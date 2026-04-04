import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

type MementoStore = {
    get<T>(key: string, defaultValue?: T): T;
    update(key: string, value: unknown): void;
};

function createMemento(initialState: Record<string, unknown> = {}): MementoStore {
    const state = new Map(Object.entries(initialState));
    return {
        get<T>(key: string, defaultValue?: T): T {
            return (state.has(key) ? state.get(key) : defaultValue) as T;
        },
        update(key: string, value: unknown): void {
            state.set(key, value);
        },
    };
}

function createExtensionContext(initialState: Record<string, unknown> = {}) {
    return {
        workspaceState: createMemento(initialState),
        globalState: createMemento(),
    };
}

describe('ChatHistoryStorage whiteboard helpers', () => {
    const modulePath = require.resolve('./chatHistoryStorage.ts');
    let originalLoad: typeof Module._load;
    let storageContext: 'workspace' | 'global' = 'workspace';
    let warnLog: string[];
    let errorLog: string[];

    beforeEach(() => {
        originalLoad = Module._load;
        storageContext = 'workspace';
        warnLog = [];
        errorLog = [];
        delete require.cache[modulePath];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    });

    function loadChatHistoryStorage() {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    workspace: {
                        getConfiguration() {
                            return {
                                get<T>(_key: string, defaultValue?: T) {
                                    return (storageContext as T) ?? defaultValue;
                                },
                            };
                        },
                        onDidChangeConfiguration() {
                            return {
                                dispose() { },
                            };
                        },
                        fs: {
                            async writeFile() { },
                        },
                        workspaceFolders: undefined,
                    },
                    window: {
                        showErrorMessage() { },
                        showInformationMessage() { },
                    },
                    Uri: {
                        file(fsPath: string) {
                            return { fsPath };
                        },
                        joinPath(base: { fsPath: string }, ...parts: string[]) {
                            return { fsPath: [base.fsPath, ...parts].join('/') };
                        },
                    },
                };
            }

            if (request === '../config/storage') {
                return {
                    getStorageContext() {
                        return storageContext;
                    },
                };
            }

            if (request === '../logging') {
                return {
                    Logger: {
                        warn(message: string) {
                            warnLog.push(message);
                        },
                        error(message: string) {
                            errorLog.push(message);
                        },
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        return require('./chatHistoryStorage.ts') as typeof import('./chatHistoryStorage');
    }

    function createCanvas(id: string, fabricState = '{"version":"6.0.0","objects":[]}') {
        return {
            id,
            name: `Canvas ${id}`,
            fabricState,
            createdAt: 100,
            updatedAt: 100,
        };
    }

    it('saves and reads whiteboard sessions through dedicated helpers', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const context = createExtensionContext();
        const storage = new ChatHistoryStorage(context as any);

        const interactionId = await storage.saveWhiteboardInteraction({
            title: 'Architecture sketch',
            context: 'Map the service boundaries',
            canvases: [createCanvas('canvas_1')],
            activeCanvasId: 'canvas_1',
            status: 'pending',
        });

        const session = storage.getWhiteboardSession(interactionId);

        assert.equal(session?.interactionId, interactionId);
        assert.equal(session?.title, 'Architecture sketch');
        assert.equal(session?.context, 'Map the service boundaries');
        assert.equal(session?.activeCanvasId, 'canvas_1');
        assert.deepEqual(session?.canvases, [createCanvas('canvas_1')]);
        assert.equal(session?.status, 'pending');
    });

    it('updates a whiteboard session without clobbering stored canvases', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const context = createExtensionContext();
        const storage = new ChatHistoryStorage(context as any);

        const interactionId = await storage.saveWhiteboardInteraction({
            title: 'Architecture sketch',
            canvases: [createCanvas('canvas_1')],
            activeCanvasId: 'canvas_1',
            status: 'pending',
        });

        await await storage.updateWhiteboardSession(interactionId, {
            status: 'approved',
            submittedAt: 1234,
            submittedCanvases: [
                {
                    id: 'canvas_1',
                    name: 'Canvas canvas_1',
                    imageUri: 'file:///tmp/canvas-1.png',
                },
            ],
        });

        const session = storage.getWhiteboardSession(interactionId);

        assert.equal(session?.status, 'approved');
        assert.equal(session?.submittedAt, 1234);
        assert.deepEqual(session?.submittedCanvases, [
            {
                id: 'canvas_1',
                name: 'Canvas canvas_1',
                imageUri: 'file:///tmp/canvas-1.png',
            },
        ]);
        assert.deepEqual(session?.canvases, [createCanvas('canvas_1')]);
        assert.equal(session?.activeCanvasId, 'canvas_1');
    });

    it('cleans up stale abandoned whiteboard sessions but preserves approved history', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const now = Date.UTC(2026, 2, 7, 12, 0, 0);
        const context = createExtensionContext();
        const storage = new (ChatHistoryStorage as any)(context, { now: () => now }) as InstanceType<typeof ChatHistoryStorage>;

        const staleInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Abandoned board',
            canvases: [createCanvas('stale_canvas')],
            activeCanvasId: 'stale_canvas',
            status: 'pending',
        });
        await storage.updateInteraction(staleInteractionId, {
            timestamp: now - (8 * 24 * 60 * 60 * 1000),
        });

        const submittedInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Approved board',
            canvases: [createCanvas('submitted_canvas')],
            activeCanvasId: 'submitted_canvas',
            status: 'approved',
            submittedAt: now - 1000,
            submittedCanvases: [
                {
                    id: 'submitted_canvas',
                    name: 'Canvas submitted_canvas',
                    imageUri: 'file:///tmp/submitted.png',
                },
            ],
        });
        await storage.updateInteraction(submittedInteractionId, {
            timestamp: now - (8 * 24 * 60 * 60 * 1000),
        });

        const recentInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Recent board',
            canvases: [createCanvas('recent_canvas')],
            activeCanvasId: 'recent_canvas',
            status: 'pending',
        });

        await storage.cleanupOldWhiteboardSessions();

        assert.equal(storage.getInteraction(staleInteractionId), undefined);
        assert.ok(storage.getInteraction(submittedInteractionId));
        assert.ok(storage.getInteraction(recentInteractionId));
    });

    it('triggers stale-session cleanup when whiteboard storage nears the quota threshold', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const now = Date.UTC(2026, 2, 7, 12, 0, 0);
        const context = createExtensionContext();
        const storage = new (ChatHistoryStorage as any)(context, {
            now: () => now,
            maxStorageBytes: 2400,
            quotaCleanupThreshold: 0.5,
        }) as InstanceType<typeof ChatHistoryStorage>;

        const oversizedState = JSON.stringify({
            version: '6.0.0',
            objects: [
                {
                    type: 'textbox',
                    text: 'x'.repeat(900),
                },
            ],
        });

        const staleInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Old large board',
            canvases: [createCanvas('stale_canvas', oversizedState)],
            activeCanvasId: 'stale_canvas',
            status: 'pending',
        });
        await storage.updateInteraction(staleInteractionId, {
            timestamp: now - (8 * 24 * 60 * 60 * 1000),
        });

        const freshInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Fresh board',
            canvases: [createCanvas('fresh_canvas')],
            activeCanvasId: 'fresh_canvas',
            status: 'pending',
        });

        assert.equal(storage.getInteraction(staleInteractionId), undefined);
        assert.ok(storage.getInteraction(freshInteractionId));
        assert.match(warnLog.join('\n'), /quota/i);
    });

    it('refuses to persist oversized whiteboard payloads when cleanup cannot get below the storage quota', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const context = createExtensionContext();
        const storage = new (ChatHistoryStorage as any)(context, {
            maxStorageBytes: 1200,
            quotaCleanupThreshold: 0.5,
        }) as InstanceType<typeof ChatHistoryStorage>;

        const baselineInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Baseline board',
            canvases: [createCanvas('baseline_canvas')],
            activeCanvasId: 'baseline_canvas',
            status: 'pending',
        });

        const oversizedState = JSON.stringify({
            version: '6.0.0',
            objects: [
                {
                    type: 'textbox',
                    text: 'y'.repeat(1500),
                },
            ],
        });

        await assert.rejects(
            () => storage.saveWhiteboardInteraction({
                title: 'Oversized board',
                canvases: [createCanvas('oversized_canvas', oversizedState)],
                activeCanvasId: 'oversized_canvas',
                status: 'pending',
            }),
            /quota exceeded/i
        );

        assert.ok(storage.getInteraction(baselineInteractionId));
        assert.equal(storage.getInteractionsByType('whiteboard').length, 1);
        assert.match(warnLog.join('\n'), /quota threshold reached/i);
        assert.match(errorLog.join('\n'), /quota exceeded/i);
    });

    it('round-trips multi-canvas submissions through storage helper updates', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const context = createExtensionContext();
        const storage = new ChatHistoryStorage(context as any);

        const interactionId = await storage.saveWhiteboardInteraction({
            title: 'Architecture board',
            canvases: [createCanvas('canvas_1'), createCanvas('canvas_2')],
            activeCanvasId: 'canvas_2',
            status: 'pending',
        });

        await storage.updateWhiteboardInteraction(interactionId, {
            title: 'Architecture board v2',
            whiteboardSession: {
                status: 'approved',
                submittedAt: 5678,
                submittedCanvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas canvas_1',
                        imageUri: 'file:///tmp/canvas-1.png',
                    },
                    {
                        id: 'canvas_2',
                        name: 'Canvas canvas_2',
                        imageUri: 'file:///tmp/canvas-2.png',
                    },
                ],
            },
        });

        const interaction = storage.getInteraction(interactionId);
        assert.equal(interaction?.title, 'Architecture board v2');
        assert.equal(interaction?.whiteboardSession?.status, 'approved');
        assert.equal(interaction?.whiteboardSession?.submittedAt, 5678);
        assert.deepEqual(interaction?.whiteboardSession?.canvases, [createCanvas('canvas_1'), createCanvas('canvas_2')]);
        assert.equal(interaction?.whiteboardSession?.activeCanvasId, 'canvas_2');
        assert.deepEqual(interaction?.whiteboardSession?.submittedCanvases, [
            {
                id: 'canvas_1',
                name: 'Canvas canvas_1',
                imageUri: 'file:///tmp/canvas-1.png',
            },
            {
                id: 'canvas_2',
                name: 'Canvas canvas_2',
                imageUri: 'file:///tmp/canvas-2.png',
            },
        ]);
        assert.deepEqual(storage.getCompletedInteractions().map((entry) => entry.id), [interactionId]);
    });

    it('preserves cancelled whiteboard history during stale-session cleanup', async () => {
        const { ChatHistoryStorage } = loadChatHistoryStorage();
        const now = Date.UTC(2026, 2, 7, 12, 0, 0);
        const context = createExtensionContext();
        const storage = new (ChatHistoryStorage as any)(context, { now: () => now }) as InstanceType<typeof ChatHistoryStorage>;

        const cancelledInteractionId = await storage.saveWhiteboardInteraction({
            title: 'Cancelled board',
            canvases: [createCanvas('cancelled_canvas')],
            activeCanvasId: 'cancelled_canvas',
            status: 'cancelled',
        });
        await storage.updateInteraction(cancelledInteractionId, {
            timestamp: now - (8 * 24 * 60 * 60 * 1000),
        });

        await storage.cleanupOldWhiteboardSessions();

        assert.ok(storage.getInteraction(cancelledInteractionId));
    });
});
