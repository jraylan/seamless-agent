import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { WhiteboardCanvasSubmission, WhiteboardSubmittedCanvas } from '../webview/types';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function createTokenController(initiallyCancelled = false) {
    let isCancellationRequested = initiallyCancelled;
    let handler: (() => void) | undefined;

    const token = {
        get isCancellationRequested() {
            return isCancellationRequested;
        },
        onCancellationRequested(callback: () => void) {
            handler = callback;
            return {
                dispose() {
                    if (handler === callback) {
                        handler = undefined;
                    }
                }
            };
        }
    };

    return {
        token,
        cancel() {
            isCancellationRequested = true;
            handler?.();
        }
    };
}

describe('openWhiteboard', () => {
    const modulePath = require.resolve('./openWhiteboard.ts');
    let originalLoad: typeof Module._load;

    beforeEach(() => {
        originalLoad = Module._load;
        delete require.cache[modulePath];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    });

    function loadOpenWhiteboard(mockLogger?: { error?: (...args: unknown[]) => void }) {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === '../logging') {
                return {
                    Logger: {
                        error: mockLogger?.error ?? (() => { }),
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        return (require('./openWhiteboard.ts') as typeof import('./openWhiteboard')).openWhiteboard;
    }

    it('returns a cancelled result without touching dependencies when already cancelled', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController(true);
        let saveCalls = 0;
        let showCalls = 0;
        let refreshCalls = 0;

        const result = await openWhiteboard(
            {},
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome: () => { refreshCalls += 1; } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            saveCalls += 1;
                            return 'wb_never';
                        },
                        updateWhiteboardInteraction() {
                            throw new Error('should not update storage');
                        },
                    },
                    panel: {
                        async showWithOptions() {
                            showCalls += 1;
                            return { submitted: true, action: 'approved', canvases: [] };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1000,
                }
            }
        );

        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            canvases: [],
            interactionId: '',
            sceneSummary: {
                totalCanvases: 0,
                totalElements: 0,
                canvases: [],
            },
        });
        assert.strictEqual(saveCalls, 0);
        assert.strictEqual(showCalls, 0);
        assert.strictEqual(refreshCalls, 0);
    });

    it('saves a pending interaction, refreshes home, and persists submitted canvases', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        const refreshLog: string[] = [];
        const storageCalls: Array<{ type: 'save' | 'update'; payload: any }> = [];

        let submittedCanvases: WhiteboardSubmittedCanvas[] = [];

        const result = await openWhiteboard(
            {
                title: 'Design Whiteboard',
                context: 'Sketch the service boundaries.',
                initialCanvases: [
                    {
                        name: 'Architecture sketch',
                        fabricState: '{"version":"6.9.1","width":1600,"height":900,"backgroundColor":"#ffffff","objects":[{"type":"rect","whiteboardId":"seed_rect","whiteboardObjectType":"rectangle","left":40,"top":50,"width":220,"height":120,"stroke":"#2563eb","fill":"rgba(37,99,235,0.18)","strokeWidth":2}]}'
                    }
                ]
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome: () => { refreshLog.push('refresh'); } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction(payload) {
                            storageCalls.push({ type: 'save', payload });
                            return 'wb_123';
                        },
                        updateWhiteboardInteraction(interactionId, payload) {
                            storageCalls.push({ type: 'update', payload: { interactionId, ...payload } });
                        },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            assert.strictEqual(options.interactionId, 'wb_123');
                            assert.strictEqual(options.session.canvases.length, 1);
                            submittedCanvases = [
                                {
                                    id: options.session.canvases[0].id,
                                    name: options.session.canvases[0].name,
                                    imageUri: 'data:image/png;base64,abc123'
                                }
                            ];
                            return {
                                submitted: true,
                                action: 'approved',
                                canvases: submittedCanvases.map(({ id, imageUri }) => ({ id, imageUri }))
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000000,
                }
            }
        );

        assert.deepStrictEqual(result, {
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the sceneSummary and submitted canvases as confirmed input in your next response.',
            canvases: submittedCanvases,
            interactionId: 'wb_123',
            sceneSummary: {
                totalCanvases: 1,
                totalElements: 1,
                canvases: [
                    {
                        id: 'canvas_1700000000000_1',
                        name: 'Architecture sketch',
                        width: 1600,
                        height: 900,
                        backgroundColor: '#ffffff',
                        elementCount: 1,
                        elements: [
                            {
                                id: 'seed_rect',
                                objectType: 'rectangle',
                                bounds: {
                                    x: 40,
                                    y: 50,
                                    width: 220,
                                    height: 120,
                                },
                                center: {
                                    x: 150,
                                    y: 110,
                                },
                                zIndex: 0,
                                strokeColor: '#2563eb',
                                fillColor: 'rgba(37,99,235,0.18)',
                                strokeWidth: 2,
                                opacity: 1,
                            }
                        ],
                    }
                ],
            },
        });
        assert.strictEqual(refreshLog.length, 2);
        assert.strictEqual(storageCalls.length, 2);
        assert.strictEqual(storageCalls[0]?.type, 'save');
        assert.strictEqual(storageCalls[1]?.type, 'update');
        assert.deepStrictEqual(storageCalls[1]?.payload, {
            interactionId: 'wb_123',
            whiteboardSession: {
                status: 'approved',
                submittedAt: 1700000000000,
                canvases: storageCalls[0]!.payload.canvases,
                activeCanvasId: 'canvas_1700000000000_1',
                submittedCanvases,
            }
        });
    });

    it('returns recreateWithChanges when the user requests another whiteboard pass', async () => {
        const openWhiteboard = loadOpenWhiteboard();

        const result = await openWhiteboard(
            {
                title: 'Edit and resubmit',
                blankCanvas: true,
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            createTokenController().token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_changes';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            return {
                                submitted: true,
                                action: 'recreateWithChanges',
                                canvases: [
                                    {
                                        id: options.session.canvases[0]!.id,
                                        imageUri: 'data:image/png;base64,updated',
                                    },
                                ],
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000001,
                }
            }
        );

        assert.equal(result.submitted, true);
        assert.equal(result.action, 'recreateWithChanges');
    });

    it('uses the submitted fabricState as the authoritative final scene summary', async () => {
        const openWhiteboard = loadOpenWhiteboard();

        const result = await openWhiteboard(
            {
                title: 'Edit and submit',
                initialCanvases: [
                    {
                        name: 'Canvas One',
                        fabricState: '{"version":"6.9.1","width":1600,"height":900,"backgroundColor":"#ffffff","objects":[{"type":"rect","whiteboardId":"seed_rect","whiteboardObjectType":"rectangle","left":40,"top":50,"width":220,"height":120,"stroke":"#2563eb","fill":"rgba(37,99,235,0.18)","strokeWidth":2}]}'
                    }
                ]
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            createTokenController().token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_final_state';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            return {
                                submitted: true,
                                action: 'approved',
                                canvases: [
                                    {
                                        id: options.session.canvases[0]!.id,
                                        imageUri: 'data:image/png;base64,updated',
                                        fabricState: '{"version":"6.9.1","width":1600,"height":900,"backgroundColor":"#ffffff","objects":[{"type":"rect","whiteboardId":"updated_rect","whiteboardObjectType":"rectangle","left":300,"top":180,"width":180,"height":90,"stroke":"#059669","fill":"rgba(5,150,105,0.18)","strokeWidth":3}]}'
                                    },
                                ],
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000001000,
                }
            }
        );

        assert.equal(result.sceneSummary.totalElements, 1);
        assert.equal(result.sceneSummary.canvases[0]?.elements[0]?.id, 'updated_rect');
        assert.deepStrictEqual(result.sceneSummary.canvases[0]?.elements[0]?.center, {
            x: 390,
            y: 225,
        });
    });

    it('rejects implicit blank whiteboards before saving or opening the panel', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        let saveCalls = 0;
        let panelCalls = 0;

        await assert.rejects(
            () => openWhiteboard(
                {
                    title: 'Implicit blank whiteboard',
                },
                { extensionUri: { fsPath: '/extension' } } as any,
                { refreshHome() { } } as any,
                tokenController.token as any,
                {
                    dependencies: {
                        storage: {
                            saveWhiteboardInteraction() {
                                saveCalls += 1;
                                return 'wb_implicit_blank';
                            },
                            updateWhiteboardInteraction() { },
                        },
                        panel: {
                            async showWithOptions() {
                                panelCalls += 1;
                                return {
                                    submitted: false,
                                    action: 'cancelled',
                                    canvases: [],
                                };
                            },
                            closeIfOpen() {
                                return false;
                            }
                        },
                        now: () => 1700000000004,
                    }
                }
            ),
            /Provide initialCanvases for starter content, or set blankCanvas to true to intentionally open an empty whiteboard/,
        );

        assert.equal(saveCalls, 0);
        assert.equal(panelCalls, 0);
    });

    it('opens an explicit blank canvas when blankCanvas is true', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        const storageCalls: Array<{ type: 'save' | 'update'; payload: any }> = [];

        const result = await openWhiteboard(
            {
                title: 'Blank Whiteboard',
                blankCanvas: true,
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction(payload) {
                            storageCalls.push({ type: 'save', payload });
                            return 'wb_blank';
                        },
                        updateWhiteboardInteraction(interactionId, payload) {
                            storageCalls.push({ type: 'update', payload: { interactionId, ...payload } });
                        },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            assert.equal(options.session.canvases.length, 1);
                            assert.equal(options.session.activeCanvasId, options.session.canvases[0]?.id);
                            assert.equal(options.session.canvases[0]?.name, 'Canvas 1');
                            assert.match(options.session.canvases[0]?.fabricState ?? '', /"objects":\[\]/);

                            return {
                                submitted: true,
                                action: 'approved',
                                canvases: [
                                    {
                                        id: options.session.canvases[0]!.id,
                                        imageUri: 'data:image/png;base64,blank-canvas',
                                    }
                                ]
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000005,
                }
            }
        );

        assert.strictEqual(storageCalls.length, 2);
        assert.deepStrictEqual(storageCalls[0], {
            type: 'save',
            payload: {
                title: 'Blank Whiteboard',
                context: undefined,
                canvases: [
                    {
                        id: 'canvas_1700000000005_1',
                        name: 'Canvas 1',
                        fabricState: storageCalls[0]?.payload.canvases[0].fabricState,
                        createdAt: 1700000000005,
                        updatedAt: 1700000000005,
                    }
                ],
                activeCanvasId: 'canvas_1700000000005_1',
                status: 'pending',
                isDebug: undefined,
            }
        });
        assert.deepStrictEqual(JSON.parse(storageCalls[0]!.payload.canvases[0].fabricState), {
            version: JSON.parse(storageCalls[0]!.payload.canvases[0].fabricState).version,
            width: 1600,
            height: 900,
            backgroundColor: '#ffffff',
            objects: [],
        });
        assert.match(JSON.parse(storageCalls[0]!.payload.canvases[0].fabricState).version, /\S+/);
        assert.deepStrictEqual(storageCalls[1], {
            type: 'update',
            payload: {
                interactionId: 'wb_blank',
                whiteboardSession: {
                    status: 'approved',
                    submittedAt: 1700000000005,
                    canvases: storageCalls[0]!.payload.canvases,
                    activeCanvasId: 'canvas_1700000000005_1',
                    submittedCanvases: [
                        {
                            id: 'canvas_1700000000005_1',
                            name: 'Canvas 1',
                            imageUri: 'data:image/png;base64,blank-canvas',
                        }
                    ],
                }
            }
        });
        assert.deepStrictEqual(result, {
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the sceneSummary and submitted canvases as confirmed input in your next response.',
            canvases: [
                {
                    id: 'canvas_1700000000005_1',
                    name: 'Canvas 1',
                    imageUri: 'data:image/png;base64,blank-canvas',
                }
            ],
            interactionId: 'wb_blank',
            sceneSummary: {
                totalCanvases: 1,
                totalElements: 0,
                canvases: [
                    {
                        id: 'canvas_1700000000005_1',
                        name: 'Canvas 1',
                        width: 1600,
                        height: 900,
                        backgroundColor: '#ffffff',
                        elementCount: 0,
                        elements: [],
                    }
                ],
            },
        });
    });

    it('converts agent-friendly seed elements into fabric state before opening the panel', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        let panelValidated = false;

        const result = await openWhiteboard(
            {
                title: 'Seeded demo',
                initialCanvases: [
                    {
                        name: 'Demo canvas',
                        seedElements: [
                            {
                                type: 'rectangle',
                                x: 40,
                                y: 50,
                                width: 220,
                                height: 120,
                                strokeColor: '#2563eb',
                                fillColor: 'rgba(37,99,235,0.18)',
                            },
                            {
                                type: 'circle',
                                x: 360,
                                y: 140,
                                radius: 60,
                                strokeColor: '#dc2626',
                                fillColor: 'rgba(220,38,38,0.18)',
                            },
                            {
                                type: 'triangle',
                                x: 520,
                                y: 60,
                                width: 180,
                                height: 150,
                                strokeColor: '#16a34a',
                                fillColor: 'rgba(22,163,74,0.18)',
                            },
                            {
                                type: 'line',
                                start: { x: 780, y: 80 },
                                end: { x: 1040, y: 220 },
                                strokeColor: '#f97316',
                                strokeWidth: 6,
                            },
                            {
                                type: 'text',
                                x: 60,
                                y: 260,
                                text: 'Whiteboard Demo',
                                color: '#111827',
                                fontSize: 32,
                            },
                        ],
                    }
                ]
            } as any,
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_seeded_demo';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            panelValidated = true;
                            assert.equal(options.session.canvases.length, 1);
                            const seededState = JSON.parse(options.session.canvases[0]!.fabricState);
                            assert.equal(seededState.width, 1600);
                            assert.equal(seededState.height, 900);
                            assert.equal(seededState.backgroundColor, '#ffffff');
                            assert.deepStrictEqual(
                                seededState.objects.map((object: any) => [object.type, object.whiteboardObjectType]),
                                [
                                    ['rect', 'rectangle'],
                                    ['path', 'circle'],
                                    ['triangle', 'triangle'],
                                    ['line', 'line'],
                                    ['i-text', 'text'],
                                ],
                            );
                            assert.equal(seededState.objects[0].stroke, '#2563eb');
                            assert.equal(seededState.objects[1].stroke, '#dc2626');
                            assert.equal(seededState.objects[2].stroke, '#16a34a');
                            assert.equal(seededState.objects[3].stroke, '#f97316');
                            assert.equal(seededState.objects[4].text, 'Whiteboard Demo');

                            return {
                                submitted: false,
                                action: 'cancelled',
                                canvases: [],
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000010,
                }
            }
        );

        assert.equal(panelValidated, true);
        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            canvases: [],
            interactionId: 'wb_seeded_demo',
            sceneSummary: {
                totalCanvases: 1,
                totalElements: 5,
                canvases: [
                    {
                        id: 'canvas_1700000000010_1',
                        name: 'Demo canvas',
                        width: 1600,
                        height: 900,
                        backgroundColor: '#ffffff',
                        elementCount: 5,
                        elements: [
                            {
                                id: 'seed_1',
                                objectType: 'rectangle',
                                bounds: {
                                    x: 40,
                                    y: 50,
                                    width: 220,
                                    height: 120,
                                },
                                center: {
                                    x: 150,
                                    y: 110,
                                },
                                zIndex: 0,
                                strokeColor: '#2563eb',
                                fillColor: 'rgba(37,99,235,0.18)',
                                strokeWidth: 2,
                                opacity: 1,
                            },
                            {
                                id: 'seed_2',
                                objectType: 'circle',
                                bounds: {
                                    x: 300,
                                    y: 80,
                                    width: 120,
                                    height: 120,
                                },
                                center: {
                                    x: 360,
                                    y: 140,
                                },
                                zIndex: 1,
                                strokeColor: '#dc2626',
                                fillColor: 'rgba(220,38,38,0.18)',
                                strokeWidth: 2,
                                opacity: 1,
                            },
                            {
                                id: 'seed_3',
                                objectType: 'triangle',
                                bounds: {
                                    x: 520,
                                    y: 60,
                                    width: 180,
                                    height: 150,
                                },
                                center: {
                                    x: 610,
                                    y: 135,
                                },
                                zIndex: 2,
                                strokeColor: '#16a34a',
                                fillColor: 'rgba(22,163,74,0.18)',
                                strokeWidth: 2,
                                opacity: 1,
                            },
                            {
                                id: 'seed_4',
                                objectType: 'line',
                                bounds: {
                                    x: 780,
                                    y: 80,
                                    width: 260,
                                    height: 140,
                                },
                                center: {
                                    x: 910,
                                    y: 150,
                                },
                                zIndex: 3,
                                strokeColor: '#f97316',
                                fillColor: '',
                                strokeWidth: 6,
                                opacity: 1,
                            },
                            {
                                id: 'seed_5',
                                objectType: 'text',
                                label: 'Whiteboard Demo',
                                zIndex: 4,
                                fontSize: 32,
                                fontFamily: 'sans-serif',
                                strokeColor: '#111827',
                                fillColor: '#111827',
                                strokeWidth: 1,
                                opacity: 1,
                            },
                        ],
                    }
                ],
            },
        });
    });

    it('preserves the attached Android UI sample payload with rounded rectangles and centered seeded text', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        const sampleInput = JSON.parse(readFileSync(path.join(process.cwd(), 'whiteboard_input test 1.json'), 'utf8'));
        let panelValidated = false;

        const result = await openWhiteboard(
            sampleInput,
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_android_ui_1';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            panelValidated = true;
                            const seededState = JSON.parse(options.session.canvases[0]!.fabricState);
                            assert.equal(seededState.objects.length, 41);
                            assert.equal(seededState.objects[1].originX, 'center');
                            assert.equal(seededState.objects[12].rx, 8);
                            assert.equal(seededState.objects[24].rx, 25);
                            return {
                                submitted: false,
                                action: 'cancelled',
                                canvases: [],
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000011,
                }
            }
        );

        assert.equal(panelValidated, true);
        assert.equal(result.sceneSummary.totalCanvases, 1);
        assert.equal(result.sceneSummary.totalElements, 41);
        assert.equal(result.sceneSummary.canvases[0]?.elements[1]?.label, 'Android App Title Bar');
    });

    it('preserves the second attached Android UI sample payload with full element count', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        const sampleInput = JSON.parse(readFileSync(path.join(process.cwd(), 'whiteboard_input test 2.json'), 'utf8'));
        let panelValidated = false;

        const result = await openWhiteboard(
            sampleInput,
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_android_ui_2';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            panelValidated = true;
                            const seededState = JSON.parse(options.session.canvases[0]!.fabricState);
                            assert.equal(seededState.objects.length, 45);
                            return {
                                submitted: false,
                                action: 'cancelled',
                                canvases: [],
                            };
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000012,
                }
            }
        );

        assert.equal(panelValidated, true);
        assert.equal(result.sceneSummary.totalCanvases, 1);
        assert.equal(result.sceneSummary.totalElements, 45);
        assert.equal(result.sceneSummary.canvases[0]?.elements[44]?.label?.trim(), '📐 Android UI Mockup - All coordinates & sizes marked for reference');
    });

    it('rejects JSON-valid but Fabric-invalid raw fabricState before opening the panel', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        let saveCalls = 0;
        let panelCalls = 0;

        await assert.rejects(
            () => openWhiteboard(
                {
                    title: 'Broken raw fabricState',
                    initialCanvases: [
                        {
                            name: 'Canvas 1',
                            fabricState: '{"version":"6.9.1","objects":[{"type":"rectangle","left":40,"top":50,"width":220,"height":120}]}'
                        }
                    ]
                } as any,
                { extensionUri: { fsPath: '/extension' } } as any,
                { refreshHome() { } } as any,
                tokenController.token as any,
                {
                    dependencies: {
                        storage: {
                            saveWhiteboardInteraction() {
                                saveCalls += 1;
                                return 'wb_invalid_raw';
                            },
                            updateWhiteboardInteraction() { },
                        },
                        panel: {
                            async showWithOptions() {
                                panelCalls += 1;
                                return {
                                    submitted: false,
                                    action: 'cancelled',
                                    canvases: [],
                                };
                            },
                            closeIfOpen() {
                                return false;
                            }
                        },
                        now: () => 1700000000011,
                    }
                }
            ),
            /Canvas fabricState contains unsupported Fabric object type "rectangle"/,
        );

        assert.equal(saveCalls, 0);
        assert.equal(panelCalls, 0);
    });

    it('marks the interaction as cancelled once and does not persist submitted data when the agent cancels mid-flight', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tokenController = createTokenController();
        const refreshLog: string[] = [];
        const updateCalls: any[] = [];
        let resolvePanel: ((value: { submitted: boolean; action: 'approved' | 'recreateWithChanges' | 'cancelled'; canvases: WhiteboardCanvasSubmission[] }) => void) | undefined;
        const closeCalls: string[] = [];

        const resultPromise = openWhiteboard(
            {
                title: 'Cancelled Whiteboard',
                blankCanvas: true,
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome: () => { refreshLog.push('refresh'); } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_cancel';
                        },
                        updateWhiteboardInteraction(interactionId, payload) {
                            updateCalls.push({ interactionId, ...payload });
                        },
                    },
                    panel: {
                        showWithOptions: async () => new Promise((resolve) => {
                            resolvePanel = resolve;
                        }),
                        closeIfOpen(interactionId) {
                            closeCalls.push(interactionId);
                            resolvePanel?.({
                                submitted: true,
                                action: 'approved',
                                canvases: [
                                    {
                                        id: 'canvas_1700000000001_1',
                                        imageUri: 'data:image/png;base64,late-submit'
                                    }
                                ]
                            });
                            return true;
                        }
                    },
                    now: () => 1700000000001,
                }
            }
        );

        tokenController.cancel();
        const result = await resultPromise;

        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            canvases: [],
            interactionId: 'wb_cancel',
            sceneSummary: {
                totalCanvases: 0,
                totalElements: 0,
                canvases: [],
            },
        });
        assert.deepStrictEqual(closeCalls, ['wb_cancel']);
        assert.deepStrictEqual(updateCalls, [
            {
                interactionId: 'wb_cancel',
                whiteboardSession: {
                    status: 'cancelled'
                }
            }
        ]);
        assert.strictEqual(refreshLog.length, 2);
    });

    it('logs and persists cancellation when the whiteboard panel throws', async () => {
        const loggerCalls: unknown[][] = [];
        const openWhiteboard = loadOpenWhiteboard({
            error: (...args) => {
                loggerCalls.push(args);
            },
        });
        const tokenController = createTokenController();
        const result = await openWhiteboard(
            {
                title: 'Broken Whiteboard',
                blankCanvas: true,
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            tokenController.token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_error';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions() {
                            throw new Error('panel failed');
                        },
                        closeIfOpen() {
                            return false;
                        }
                    },
                    now: () => 1700000000002,
                }
            }
        );

        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            canvases: [],
            interactionId: 'wb_error',
            sceneSummary: {
                totalCanvases: 0,
                totalElements: 0,
                canvases: [],
            },
        });
        assert.strictEqual(loggerCalls.length, 1);
        assert.strictEqual(loggerCalls[0]?.[0], 'Error showing whiteboard panel:');
        assert.match(String(loggerCalls[0]?.[1]), /panel failed/);
    });
});
