import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

type MockDisposable = { dispose(): void };
type MockPanel = {
    webview: {
        html: string;
        cspSource: string;
        asWebviewUri(uri: { fsPath: string }): { toString(): string };
        postMessage(message: unknown): Thenable<boolean>;
        onDidReceiveMessage(
            callback: (message: unknown) => void,
            thisArg?: unknown,
            disposables?: MockDisposable[],
        ): MockDisposable;
    };
    onDidDispose(callback: () => void, thisArg?: unknown, disposables?: MockDisposable[]): MockDisposable;
    reveal(): void;
    dispose(): void;
};

type MockVscodeModule = {
    window: {
        activeTextEditor: undefined;
        createWebviewPanel(): MockPanel;
    };
    Uri: {
        joinPath(...parts: Array<{ fsPath: string } | string>): { fsPath: string };
        file(filePath: string): { fsPath: string; toString(): string };
    };
    ViewColumn: {
        One: number;
    };
};

function createMockVscode() {
    let lastPanel: MockPanel | undefined;
    const postedMessages: unknown[] = [];
    let receiveMessageCallback: ((message: unknown) => void) | undefined;

    const mockVscode: MockVscodeModule = {
        window: {
            activeTextEditor: undefined,
            createWebviewPanel() {
                const disposeListeners: Array<() => void> = [];
                let disposed = false;

                const panel: MockPanel = {
                    webview: {
                        html: '',
                        cspSource: 'vscode-webview://test',
                        asWebviewUri(uri) {
                            return {
                                toString: () => `webview:${uri.fsPath}`,
                            };
                        },
                        postMessage: async (message) => {
                            postedMessages.push(message);
                            return true;
                        },
                        onDidReceiveMessage(callback, _thisArg, disposables) {
                            receiveMessageCallback = callback as (message: unknown) => void;
                            const disposable = { dispose() { } };
                            disposables?.push(disposable);
                            return disposable;
                        },
                    },
                    onDidDispose(callback, _thisArg, disposables) {
                        disposeListeners.push(callback);
                        const disposable = { dispose() { } };
                        disposables?.push(disposable);
                        return disposable;
                    },
                    reveal() { },
                    dispose() {
                        if (disposed) {
                            return;
                        }
                        disposed = true;
                        for (const listener of [...disposeListeners]) {
                            listener();
                        }
                    },
                };

                lastPanel = panel;
                return panel;
            },
        },
        Uri: {
            joinPath(...parts: Array<{ fsPath: string } | string>) {
                const normalized = parts.map((part) => typeof part === 'string' ? part : part.fsPath);
                return { fsPath: path.join(...normalized) };
            },
            file(filePath: string) {
                return {
                    fsPath: filePath,
                    toString: () => `file://${filePath}`,
                };
            },
        },
        ViewColumn: {
            One: 1,
        },
    };

    return {
        mockVscode,
        getLastPanel() {
            return lastPanel;
        },
        getPostedMessages() {
            return postedMessages;
        },
        sendMessage(message: unknown) {
            receiveMessageCallback?.(message);
        },
    };
}

describe('WhiteboardPanel', () => {
    const modulePath = require.resolve('./whiteboardPanel.ts');
    let originalLoad: typeof Module._load;
    let tempRoot: string;
    const extensionUri = { fsPath: '/Users/muhammadfaiz/Custom APP/seamless_agent' } as any;

    beforeEach(() => {
        originalLoad = Module._load;
        delete require.cache[modulePath];
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-panel-test-'));
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('keeps the pending resolver alive when the user manually closes the panel', async () => {
        const mock = createMockVscode();
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction() { },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_manual_close';
        const resultPromise = WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard',
                context: 'Review this sketch',
                canvases: [],
                activeCanvasId: undefined,
                status: 'pending',
            },
        });

        const panel = mock.getLastPanel();
        assert.ok(panel, 'expected whiteboard panel to be created');
        panel.dispose();

        const resolution = await Promise.race([
            resultPromise.then((value) => ({ state: 'resolved' as const, value })),
            new Promise<{ state: 'pending' }>((resolve) => setTimeout(() => resolve({ state: 'pending' }), 0)),
        ]);

        assert.deepStrictEqual(resolution, { state: 'pending' });
        assert.strictEqual(WhiteboardPanel.hasPendingResolver(interactionId), true);
        assert.strictEqual(WhiteboardPanel.closeIfOpen(interactionId), true);
        assert.deepStrictEqual(await resultPromise, {
            submitted: false,
            action: 'cancelled',
            canvases: [],
        });
    });

    it('reopens a manually closed pending panel with the surviving resolver', async () => {
        const mock = createMockVscode();
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction() { },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_reopen_pending';
        const resultPromise = WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard',
                context: 'Reopen this sketch',
                canvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas One',
                        fabricState: '{"objects":[]}',
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
                activeCanvasId: 'canvas_1',
                status: 'pending',
            },
        });

        const firstPanel = mock.getLastPanel();
        assert.ok(firstPanel, 'expected initial whiteboard panel to be created');
        firstPanel.dispose();

        const reopened = WhiteboardPanel.reopenPending(extensionUri, interactionId, {
            interactionId,
            title: 'Whiteboard (reopened)',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard (reopened)',
                context: 'Reopen this sketch',
                canvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas One',
                        fabricState: '{"objects":[{\"type\":\"rect\"}]}',
                        createdAt: 1,
                        updatedAt: 2,
                    },
                ],
                activeCanvasId: 'canvas_1',
                status: 'pending',
            },
        });

        assert.strictEqual(reopened, true);
        const reopenedPanel = mock.getLastPanel();
        assert.ok(reopenedPanel, 'expected pending panel to be recreated');
        assert.notStrictEqual(reopenedPanel, firstPanel, 'expected a new panel instance after reopen');

        mock.sendMessage({ type: 'ready' });
        const initializeMessage = mock.getPostedMessages().at(-1);
        assert.deepStrictEqual(initializeMessage, {
            type: 'initialize',
            title: 'Whiteboard (reopened)',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard (reopened)',
                context: 'Reopen this sketch',
                canvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas One',
                        fabricState: '{"objects":[{\"type\":\"rect\"}]}',
                        createdAt: 1,
                        updatedAt: 2,
                    },
                ],
                activeCanvasId: 'canvas_1',
                status: 'pending',
            },
        });

        mock.sendMessage({ type: 'cancel' });
        assert.deepStrictEqual(await resultPromise, {
            submitted: false,
            action: 'cancelled',
            canvases: [],
        });
    });

    it('returns recreateWithChanges when the user clicks request changes', async () => {
        const mock = createMockVscode();
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction() { },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_request_changes';
        const resultPromise = WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard',
                context: 'Review this sketch',
                canvases: [],
                activeCanvasId: undefined,
                status: 'pending',
            },
        });

        mock.sendMessage({
            type: 'submit',
            action: 'recreateWithChanges',
            canvases: [],
        });

        assert.deepStrictEqual(await resultPromise, {
            submitted: true,
            action: 'recreateWithChanges',
            canvases: [],
        });
    });

    it('reuses an existing panel with the latest session data', async () => {
        const mock = createMockVscode();
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction() { },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_reuse';

        void WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Original Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Original Whiteboard',
                context: 'Old context',
                canvases: [
                    {
                        id: 'canvas_old',
                        name: 'Old Canvas',
                        fabricState: '{"objects":[]}',
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
                activeCanvasId: 'canvas_old',
                status: 'pending',
            },
        });

        const reusedPromise = WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Updated Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Updated Whiteboard',
                context: 'Fresh context',
                canvases: [
                    {
                        id: 'canvas_new',
                        name: 'New Canvas',
                        fabricState: '{"objects":[]}',
                        createdAt: 2,
                        updatedAt: 2,
                    },
                ],
                activeCanvasId: 'canvas_new',
                status: 'pending',
            },
        });

        mock.sendMessage({ type: 'ready' });
        void reusedPromise;

        const initializeMessage = mock.getPostedMessages().at(-1);
        assert.deepStrictEqual(initializeMessage, {
            type: 'initialize',
            title: 'Updated Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Updated Whiteboard',
                context: 'Fresh context',
                canvases: [
                    {
                        id: 'canvas_new',
                        name: 'New Canvas',
                        fabricState: '{"objects":[]}',
                        createdAt: 2,
                        updatedAt: 2,
                    },
                ],
                activeCanvasId: 'canvas_new',
                status: 'pending',
            },
        });
    });

    it('uses the canonical blank fabric state when creating a canvas without an explicit payload', async () => {
        const mock = createMockVscode();
        const updateCalls: Array<{ interactionId: string; updates: unknown }> = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction(interactionId: string, updates: unknown) {
                            updateCalls.push({ interactionId, updates });
                        },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_canonical_blank';
        void WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard',
                canvases: [],
                activeCanvasId: undefined,
                status: 'pending',
            },
        });

        mock.sendMessage({
            type: 'createCanvas',
            name: 'Canvas Two',
        });

        assert.equal(updateCalls.length, 1);
        const createdCanvas = ((updateCalls[0]?.updates as any)?.whiteboardSession?.canvases as any[])?.[0];
        assert.ok(createdCanvas, 'expected createCanvas to persist a canvas');
        const fabricState = JSON.parse(createdCanvas.fabricState);
        assert.match(fabricState.version, /\S+/);
        assert.deepStrictEqual(fabricState, {
            version: fabricState.version,
            width: 1600,
            height: 900,
            backgroundColor: '#ffffff',
            objects: [],
        });
    });

    it('persists canvas lifecycle updates and exports submitted png files', async () => {
        const mock = createMockVscode();
        const updateCalls: Array<{ interactionId: string; updates: unknown }> = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ...mock.mockVscode,
                    Uri: {
                        joinPath: (...parts: Array<{ fsPath: string } | string>) => {
                            const normalized = parts.map((part) => typeof part === 'string' ? part : part.fsPath);
                            return { fsPath: path.join(...normalized) };
                        },
                        file: (filePath: string) => ({
                            fsPath: filePath,
                            toString: () => `file://${filePath}`,
                        }),
                    },
                };
            }
            if (request === '../storage/chatHistoryStorage') {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction(interactionId: string, updates: unknown) {
                            updateCalls.push({ interactionId, updates });
                        },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = require('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
        const interactionId = 'wb_submit';
        const resultPromise = WhiteboardPanel.showWithOptions(extensionUri, {
            interactionId,
            title: 'Whiteboard',
            session: {
                id: interactionId,
                interactionId,
                title: 'Whiteboard',
                context: 'Persist this',
                canvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas One',
                        fabricState: '{"objects":[]}',
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ],
                activeCanvasId: 'canvas_1',
                status: 'pending',
            },
        });

        mock.sendMessage({
            type: 'saveCanvas',
            canvasId: 'canvas_1',
            name: 'Canvas One',
            fabricState: '{"objects":[{"type":"path"}]}',
            thumbnail: 'data:image/png;base64,AAAA',
            shapes: [{ id: 'shape_1', objectType: 'path' }],
            images: [],
        });
        mock.sendMessage({
            type: 'createCanvas',
            canvasId: 'canvas_2',
            name: 'Canvas Two',
            fabricState: '{"objects":[]}',
        });
        mock.sendMessage({
            type: 'switchCanvas',
            canvasId: 'canvas_2',
        });
        mock.sendMessage({
            type: 'submit',
            canvases: [
                {
                    id: 'canvas_1',
                    imageUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2WZs8AAAAASUVORK5CYII=',
                    fabricState: '{"objects":[{"type":"rect"}]}',
                    thumbnail: 'data:image/png;base64,AAAA',
                    shapes: [{ id: 'shape_1', objectType: 'path' }],
                    images: [],
                },
            ],
        });

        const result = await resultPromise;
        assert.equal(result.submitted, true);
        assert.equal(result.canvases.length, 1);
        assert.match(result.canvases[0].imageUri, /^file:\/\//);
        assert.equal((result.canvases[0] as { fabricState?: string }).fabricState, '{"objects":[{"type":"rect"}]}');

        const exportedPath = result.canvases[0].imageUri.replace('file://', '');
        assert.ok(fs.existsSync(exportedPath), 'expected exported png file to exist');
        assert.ok(exportedPath.includes(path.join('temp-whiteboard-images', `${interactionId}_canvas_1_`)));

        assert.deepStrictEqual(updateCalls.map((entry) => entry.interactionId), [
            interactionId,
            interactionId,
            interactionId,
        ]);
    });
});
