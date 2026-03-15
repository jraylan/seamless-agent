import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const req = createRequire(__filename);
const Module = req('node:module') as typeof import('node:module') & {
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
        createOutputChannel(name: string): {
            name: string;
            append(value: string): void;
            appendLine(value: string): void;
            show(): void;
            hide(): void;
            dispose(): void;
        };
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
            createOutputChannel(name: string) {
                return {
                    name,
                    append(value: string) { },
                    appendLine(value: string) { },
                    show() { },
                    hide() { },
                    dispose() { },
                };
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
            console.log('[TEST] sendMessage called with:', JSON.stringify(message));
            receiveMessageCallback?.(message);
        },
    };
}

function createPatchedLoad(
    tempRoot: string,
    mock: ReturnType<typeof createMockVscode>,
    originalLoad: typeof Module._load,
    updateCalls?: Array<{ interactionId: string; updates: unknown }>,
) {
    return function patchedLoad(this: unknown, request: string, parent: unknown, isMain: boolean) {
        console.log('[MODULE_LOAD]', request);
        if (request === 'vscode') {
            console.log('[TEST] Loading vscode mock');
            return mock.mockVscode;
        }
        if (request === '../storage/chatHistoryStorage' || request === './chatHistoryStorage' || request.endsWith('/chatHistoryStorage')) {
            console.log('[TEST] Loading chatHistoryStorage mock');
            return {
                getChatHistoryStorage: () => ({
                    updateWhiteboardInteraction(interactionId: string, updates: unknown) {
                        console.log('[TEST] updateWhiteboardInteraction called:', interactionId);
                        updateCalls?.push({ interactionId, updates });
                    },
                }),
                getExtensionContext: () => {
                    console.log('[TEST] getExtensionContext called');
                    return {
                        globalStorageUri: { fsPath: tempRoot },
                    };
                },
            };
        }
        if (request === '../logging' || request === './logging' || request.endsWith('/logging')) {
            return {
                Logger: {
                    debug() { },
                    info() { },
                    warn() { },
                    error() { },
                },
            };
        }
        if (request === '../whiteboard/imageCleanup' || request.endsWith('/imageCleanup')) {
            console.log('[TEST] Mocking imageCleanup module - creating mock');
            const mockFn = async () => { 
                console.log('[TEST] cleanupWhiteboardTempImages called - START');
                await new Promise(resolve => setTimeout(resolve, 10));
                console.log('[TEST] cleanupWhiteboardTempImages called - DONE - returning undefined');
                return undefined;
            };
            return {
                cleanupWhiteboardTempImages: mockFn,
            };
        }
        if (request === 'fs' || request === 'fs/promises') {
            console.log('[TEST] Loading fs mock');
            // For most operations, use mocks. For file operations that need real data, use real fs.
            const fsMock = {
                mkdirSync: (dirPath: string, options?: any) => {
                    console.log('[TEST] fs.mkdirSync called:', dirPath);
                    // Use real fs for actual directory creation in tempRoot
                    if (dirPath.includes(tempRoot)) {
                        return fs.mkdirSync(dirPath, options);
                    }
                    return undefined;
                },
                mkdir: async (dirPath: string, options?: any) => {
                    console.log('[TEST] fs.mkdir called:', dirPath);
                    console.log('[TEST] fs.mkdir returning promise');
                    // Use real fs for actual directory creation in tempRoot
                    if (dirPath.includes(tempRoot)) {
                        return fs.promises.mkdir(dirPath, options);
                    }
                    return undefined;
                },
                writeFileSync: (filePath: string, data: any) => {
                    console.log('[TEST] fs.writeFileSync called:', filePath);
                    return undefined;
                },
                writeFile: async (filePath: string, data: any) => {
                    console.log('[TEST] fs.writeFile called:', filePath, 'data length:', data?.length);
                    console.log('[TEST] fs.writeFile returning promise');
                    // Use real fs for files in tempRoot
                    if (filePath.includes(tempRoot)) {
                        return fs.promises.writeFile(filePath, data);
                    }
                    return undefined;
                },
                readFile: async (filePath: string, encoding?: string) => {
                    console.log('[TEST] fs.readFile called:', filePath);
                    // Use real fs for template files
                    if (filePath.includes('whiteboard.html')) {
                        try {
                            return fs.readFileSync(filePath, encoding as BufferEncoding || 'utf8');
                        } catch {
                            return '<html><body></body></html>';
                        }
                    }
                    return '<html><body></body></html>';
                },
                readFileSync: (filePath: string, encoding?: string) => {
                    console.log('[TEST] fs.readFileSync called:', filePath);
                    return '<html><body></body></html>';
                },
                readdir: async (dirPath: string) => {
                    console.log('[TEST] fs.readdir called:', dirPath);
                    // Use real fs for reading temp directory
                    if (dirPath.includes(tempRoot)) {
                        return fs.promises.readdir(dirPath);
                    }
                    return [];
                },
                rm: async (filePath: string, options?: any) => {
                    console.log('[TEST] fs.rm called:', filePath);
                    // Use real fs for deletion in tempRoot
                    if (filePath.includes(tempRoot)) {
                        return fs.promises.rm(filePath, options);
                    }
                    return undefined;
                },
            };
            return fsMock;
        }
        if (request === '../whiteboard/canvasState' || request.endsWith('/canvasState')) {
            return {
                serializeBlankFabricCanvasState: () => JSON.stringify({
                    version: '6.0.0',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    objects: [],
                }),
                DEFAULT_WHITEBOARD_CANVAS_BACKGROUND: '#ffffff',
                DEFAULT_WHITEBOARD_CANVAS_HEIGHT: 900,
                DEFAULT_WHITEBOARD_CANVAS_NAME: 'Canvas',
                DEFAULT_WHITEBOARD_CANVAS_WIDTH: 1600,
            };
        }
        if (request === '../whiteboard/constants' || request.endsWith('/constants')) {
            return {
                TEMP_IMAGE_DIRECTORY: 'temp-whiteboard-images',
            };
        }
        if (request === '../whiteboard/circlePath' || request.endsWith('/circlePath')) {
            return {
                createCirclePathFabricObject: () => ({}),
            };
        }
        if (request === '../whiteboard/fabricRegistry' || request.endsWith('/fabricRegistry')) {
            return {
                ensureWhiteboardFabricRegistry: () => { },
                assertWhiteboardFabricObjectsSupported: () => { },
                normalizeWhiteboardFabricObjectType: (t: string) => t,
            };
        }
        if (request === './types' || request.endsWith('/types')) {
            return {
                normalizeWhiteboardSubmittedCanvas: (canvas: any) => {
                    // Simple mock that just returns the canvas as-is
                    return canvas;
                },
            };
        }
        try {
            return originalLoad.call(this, request, parent, isMain);
        } catch (e) {
            console.log('[MODULE_LOAD FALLBACK]', request, '-> returning {}');
            return {};
        }
    };
}

describe('WhiteboardPanel', () => {
    const modulePath = req.resolve('./whiteboardPanel.ts');
    let originalLoad: typeof Module._load;
    let tempRoot: string;
    const extensionUri = { fsPath: '/Users/muhammadfaiz/Custom APP/seamless_agent' } as any;

    beforeEach(() => {
        originalLoad = Module._load;
        delete req.cache[modulePath];
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-panel-test-'));
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete req.cache[modulePath];
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('keeps the pending resolver alive when the user manually closes the panel', async () => {
        const mock = createMockVscode();
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return mock.mockVscode;
            }
            if (request === '../storage/chatHistoryStorage' || request === './chatHistoryStorage' || request.endsWith('/chatHistoryStorage')) {
                return {
                    getChatHistoryStorage: () => ({
                        updateWhiteboardInteraction() { },
                    }),
                    getExtensionContext: () => ({
                        globalStorageUri: { fsPath: tempRoot },
                    }),
                };
            }
            if (request === '../logging' || request === './logging' || request.endsWith('/logging')) {
                return {
                    Logger: {
                        debug() { },
                        info() { },
                        warn() { },
                        error() { },
                    },
                };
            }
            if (request === '../whiteboard/imageCleanup' || request.endsWith('/imageCleanup')) {
                return {
                    cleanupWhiteboardTempImages: async () => { },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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
        Module._load = createPatchedLoad(tempRoot, mock, originalLoad);

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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
        Module._load = createPatchedLoad(tempRoot, mock, originalLoad);

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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
            userComment: undefined,
        });
    });

    it('reuses an existing panel with the latest session data', async () => {
        const mock = createMockVscode();
        Module._load = createPatchedLoad(tempRoot, mock, originalLoad);

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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

        const patchedLoad = createPatchedLoad(tempRoot, mock, originalLoad);
        Module._load = function(request: string, parent: unknown, isMain: boolean) {
            if (request === '../storage/chatHistoryStorage' || request.endsWith('/chatHistoryStorage')) {
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
            return patchedLoad(request, parent, isMain);
        };

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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

        Module._load = createPatchedLoad(tempRoot, mock, originalLoad, updateCalls);

        const { WhiteboardPanel } = req('./whiteboardPanel.ts') as typeof import('./whiteboardPanel');
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

        console.log('[TEST] Submit message sent, waiting...');

        console.log('[TEST] Waiting for resultPromise...');
        
        const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Test timeout - promise never resolved')), 5000)
        );
        
        let result: any;
        try {
            result = await Promise.race([resultPromise, timeoutPromise]);
            console.log('[TEST] Got result:', result);
        } catch (e) {
            console.log('[TEST] Error:', e);
            throw e;
        }
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
