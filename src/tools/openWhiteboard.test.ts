import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

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
                },
            };
        },
    };

    return {
        token,
        cancel() {
            isCancellationRequested = true;
            handler?.();
        },
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

    it('returns a cancelled image result without touching dependencies when already cancelled', async () => {
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
                        },
                    },
                    now: () => 1000,
                },
            },
        );

        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            images: [],
            interactionId: '',
            userComment: undefined,
        });
        assert.strictEqual(saveCalls, 0);
        assert.strictEqual(showCalls, 0);
        assert.strictEqual(refreshCalls, 0);
    });

    it('returns image-focused results for approved submissions', async () => {
        const openWhiteboard = loadOpenWhiteboard();

        const result = await openWhiteboard(
            {
                title: 'Blank Whiteboard',
                blankCanvas: true,
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            createTokenController().token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_image_contract';
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
                                        imageUri: 'file:///tmp/canvas.png',
                                    },
                                ],
                                userComment: undefined,
                            };
                        },
                        closeIfOpen() {
                            return false;
                        },
                    },
                    now: () => 1700000002000,
                },
            },
        );

        assert.deepStrictEqual(result, {
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the returned whiteboard images as confirmed visual input in your next response.',
            images: [
                {
                    canvasId: 'canvas_1700000002000_1',
                    canvasName: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                    width: 1600,
                    height: 900,
                },
            ],
            interactionId: 'wb_image_contract',
            userComment: undefined,
        });
    });

    it('preloads importImages into the initial canvas for annotation', async () => {
        const openWhiteboard = loadOpenWhiteboard();
        const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-import-'));
        const imagePath = path.join(tempDirectory, 'mockup.png');
        fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Zz6kAAAAASUVORK5CYII=', 'base64'));

        try {
            const fileUri = `file://${imagePath}`;
            const result = await openWhiteboard(
                {
                    title: 'Annotate imported image',
                    importImages: [
                        {
                            uri: fileUri,
                            label: 'Mockup',
                        },
                    ],
                },
                { extensionUri: { fsPath: '/extension' } } as any,
                { refreshHome() { } } as any,
                createTokenController().token as any,
                {
                    dependencies: {
                        storage: {
                            saveWhiteboardInteraction() {
                                return 'wb_imports';
                            },
                            updateWhiteboardInteraction() { },
                        },
                        panel: {
                            async showWithOptions(_extensionUri, options) {
                                const state = JSON.parse(options.session.canvases[0]!.fabricState) as {
                                    objects: Array<Record<string, unknown>>;
                                };
                                assert.equal(state.objects.length, 1);
                                assert.equal(state.objects[0]?.type, 'image');
                                assert.match(String(state.objects[0]?.src ?? ''), /^data:image\/png;base64,/);
                                assert.equal(state.objects[0]?.whiteboardSourceUri, fileUri);
                                return {
                                    submitted: false,
                                    action: 'cancelled',
                                    canvases: [],
                                    userComment: undefined,
                                };
                            },
                            closeIfOpen() {
                                return false;
                            },
                        },
                        now: () => 1700000003000,
                    },
                },
            );

            assert.deepStrictEqual(result, {
                submitted: false,
                action: 'cancelled',
                instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                images: [],
                interactionId: 'wb_imports',
                userComment: undefined,
            });
        } finally {
            fs.rmSync(tempDirectory, { recursive: true, force: true });
        }
    });

    it('builds starter canvases from seedElements and keeps the image result contract', async () => {
        const openWhiteboard = loadOpenWhiteboard();

        const result = await openWhiteboard(
            {
                title: 'Seeded whiteboard',
                initialCanvases: [
                    {
                        name: 'Seeded Canvas',
                        seedElements: [
                            {
                                type: 'rectangle',
                                x: 120,
                                y: 80,
                                width: 240,
                                height: 120,
                                fillColor: '#dbeafe',
                            },
                            {
                                type: 'text',
                                x: 180,
                                y: 140,
                                text: 'Seeded',
                            },
                        ],
                    },
                ],
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            createTokenController().token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_seeded';
                        },
                        updateWhiteboardInteraction() { },
                    },
                    panel: {
                        async showWithOptions(_extensionUri, options) {
                            assert.equal(options.session.canvases.length, 1);
                            assert.equal(options.session.canvases[0]?.name, 'Seeded Canvas');
                            const state = JSON.parse(options.session.canvases[0]!.fabricState) as {
                                objects: Array<Record<string, unknown>>;
                            };
                            assert.equal(state.objects.length, 2);
                            assert.equal(state.objects[0]?.type, 'rect');
                            assert.equal(state.objects[1]?.type, 'i-text');
                            return {
                                submitted: true,
                                action: 'approved',
                                canvases: [
                                    {
                                        id: options.session.canvases[0]!.id,
                                        imageUri: 'file:///tmp/seeded.png',
                                    },
                                ],
                                userComment: undefined,
                            };
                        },
                        closeIfOpen() {
                            return false;
                        },
                    },
                    now: () => 1700000003500,
                },
            },
        );

        assert.deepStrictEqual(result, {
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the returned whiteboard images as confirmed visual input in your next response.',
            images: [
                {
                    canvasId: 'canvas_1700000003500_1',
                    canvasName: 'Seeded Canvas',
                    imageUri: 'file:///tmp/seeded.png',
                    width: 1600,
                    height: 900,
                },
            ],
            interactionId: 'wb_seeded',
            userComment: undefined,
        });
    });

    it('preserves recreateWithChanges as an image-focused result action', async () => {
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
                                        imageUri: 'file:///tmp/updated.png',
                                    },
                                ],
                                userComment: undefined,
                            };
                        },
                        closeIfOpen() {
                            return false;
                        },
                    },
                    now: () => 1700000000001,
                },
            },
        );

        assert.equal(result.submitted, true);
        assert.equal(result.action, 'recreateWithChanges');
        assert.equal(result.images[0]?.imageUri, 'file:///tmp/updated.png');
        assert.equal(result.userComment, undefined);
    });

    it('logs and persists cancellation when the whiteboard panel throws', async () => {
        let loggedError: unknown;
        const openWhiteboard = loadOpenWhiteboard({
            error: (...args) => {
                loggedError = args;
            },
        });
        let updatedInteractionId = '';

        const result = await openWhiteboard(
            {
                title: 'Throwing panel',
            },
            { extensionUri: { fsPath: '/extension' } } as any,
            { refreshHome() { } } as any,
            createTokenController().token as any,
            {
                dependencies: {
                    storage: {
                        saveWhiteboardInteraction() {
                            return 'wb_throw';
                        },
                        updateWhiteboardInteraction(interactionId) {
                            updatedInteractionId = interactionId;
                        },
                    },
                    panel: {
                        async showWithOptions() {
                            throw new Error('panel failed');
                        },
                        closeIfOpen() {
                            return false;
                        },
                    },
                    now: () => 1700000004000,
                },
            },
        );

        assert.equal(updatedInteractionId, 'wb_throw');
        assert.ok(loggedError, 'expected panel errors to be logged');
        assert.deepStrictEqual(result, {
            submitted: false,
            action: 'cancelled',
            instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
            images: [],
            interactionId: 'wb_throw',
            userComment: undefined,
        });
    });
});
