import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

describe('A2UIPanel', () => {
    const modulePath = require.resolve('./panel.ts');
    let originalLoad: typeof Module._load;

    beforeEach(() => {
        originalLoad = Module._load;
        delete require.cache[modulePath];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    });

    it('reuses the same pending waiter when a second waitForAction call reuses the same surfaceId', async () => {
        const messageHandlers: Array<(message: unknown) => void> = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: {
                        One: 1,
                    },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(value: { toString(): string }) {
                                        return value;
                                    },
                                    onDidReceiveMessage(handler: (message: unknown) => void) {
                                        messageHandlers.push(handler);
                                        return {
                                            dispose() { },
                                        };
                                    },
                                },
                                onDidDispose(handler: () => void) {
                                    disposeHandler = handler;
                                    return {
                                        dispose() { },
                                    };
                                },
                                reveal() { },
                                dispose() {
                                    disposeHandler?.();
                                },
                            };
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((part) => typeof part === 'string' ? part : part.path || part.fsPath || '').join('/'),
                        }),
                    },
                };
            }

            if (request === 'fs') {
                return {
                    readFileSync() {
                        return '<html><head><link href="{{styleUri}}" rel="stylesheet" /></head><body><div id="surface-{{surfaceId}}">{{surfaceHtml}}</div><script nonce="{{nonce}}"></script></body></html>';
                    },
                };
            }

            if (request === 'path') {
                return {
                    join: (...parts: string[]) => parts.join('/'),
                };
            }

            if (request === 'crypto') {
                return {
                    randomBytes() {
                        return {
                            toString() {
                                return 'nonce';
                            },
                        };
                    },
                };
            }

            if (request === './renderer') {
                return {
                    renderSurface() {
                        return '<button class="a2ui-button" data-action="submit">Submit</button>';
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surface = {
            surfaceId: 'surface_shared',
            title: 'Shared surface',
            components: [
                {
                    id: 'button_1',
                    component: {
                        type: 'Button',
                        props: {
                            label: 'Submit',
                            action: 'submit',
                        },
                    },
                },
            ],
        };

        const firstPromise = A2UIPanel.showSurface({ fsPath: '/extension' } as any, surface, true);
        const secondPromise = A2UIPanel.showSurface({ fsPath: '/extension' } as any, surface, true);

        const pendingResult = await Promise.race([
            Promise.all([firstPromise, secondPromise]).then(() => 'resolved'),
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
        ]);

        assert.equal(pendingResult, 'timeout', 'expected both waiters to remain pending until user action');

        const latestHandler = messageHandlers.at(-1);
        assert.ok(latestHandler, 'expected a webview message handler');
        latestHandler({
            type: 'userAction',
            name: 'submit',
            data: {
                value: 'ok',
            },
        });

        const expectedResult = {
            dismissed: false,
            userAction: {
                name: 'submit',
                data: {
                    value: 'ok',
                },
            },
        };

        await assert.doesNotReject(() => Promise.all([firstPromise, secondPromise]));
        assert.deepStrictEqual(await firstPromise, expectedResult);
        assert.deepStrictEqual(await secondPromise, expectedResult);
    });

    it('returns renderer errors when the surface cannot be rendered', async () => {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: {
                        One: 1,
                    },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(value: { toString(): string }) {
                                        return value;
                                    },
                                    onDidReceiveMessage() {
                                        return {
                                            dispose() { },
                                        };
                                    },
                                },
                                onDidDispose(handler: () => void) {
                                    disposeHandler = handler;
                                    return {
                                        dispose() { },
                                    };
                                },
                                reveal() { },
                                dispose() {
                                    disposeHandler?.();
                                },
                            };
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((part) => typeof part === 'string' ? part : part.path || part.fsPath || '').join('/'),
                        }),
                    },
                };
            }

            if (request === 'fs') {
                return {
                    readFileSync() {
                        return '<html><body>{{surfaceHtml}}</body></html>';
                    },
                };
            }

            if (request === 'path') {
                return {
                    join: (...parts: string[]) => parts.join('/'),
                };
            }

            if (request === 'crypto') {
                return {
                    randomBytes() {
                        return {
                            toString() {
                                return 'nonce';
                            },
                        };
                    },
                };
            }

            if (request === './renderer') {
                return {
                    renderSurface() {
                        throw new Error('Unsupported component type: Table (id: table_1)');
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const result = await A2UIPanel.showSurface(
            { fsPath: '/extension' } as any,
            {
                surfaceId: 'surface_error',
                components: [
                    {
                        id: 'table_1',
                        component: { type: 'Table' },
                    },
                ],
            },
            false,
        );

        assert.deepStrictEqual(result, {
            dismissed: false,
            renderErrors: [
                {
                    source: 'renderer',
                    message: 'Unsupported component type: Table (id: table_1)',
                },
            ],
        });
    });

    it('preserves literal dollar replacement patterns in rendered HTML', async () => {
        let createdPanel:
            | {
                webview: {
                    html: string;
                };
            }
            | undefined;

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: {
                        One: 1,
                    },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            createdPanel = {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(value: { toString(): string }) {
                                        return value;
                                    },
                                    onDidReceiveMessage() {
                                        return {
                                            dispose() { },
                                        };
                                    },
                                },
                                onDidDispose(handler: () => void) {
                                    disposeHandler = handler;
                                    return {
                                        dispose() { },
                                    };
                                },
                                reveal() { },
                                dispose() {
                                    disposeHandler?.();
                                },
                            } as any;

                            return createdPanel;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((part) => typeof part === 'string' ? part : part.path || part.fsPath || '').join('/'),
                        }),
                    },
                };
            }

            if (request === 'fs') {
                return {
                    readFileSync() {
                        return '<html><body>{{surfaceHtml}}</body></html>';
                    },
                };
            }

            if (request === 'path') {
                return {
                    join: (...parts: string[]) => parts.join('/'),
                };
            }

            if (request === 'crypto') {
                return {
                    randomBytes() {
                        return {
                            toString() {
                                return 'nonce';
                            },
                        };
                    },
                };
            }

            if (request === './renderer') {
                return {
                    renderSurface() {
                        return '<p>literal $& marker</p>';
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        await A2UIPanel.showSurface(
            { fsPath: '/extension' } as any,
            {
                surfaceId: 'surface_literal',
                components: [
                    {
                        id: 'text_1',
                        component: { type: 'Text', props: { content: 'ignored' } },
                    },
                ],
            },
            false,
        );

        assert.ok(createdPanel, 'expected a panel to be created');
        assert.match(createdPanel.webview.html, /\$& marker/);
        assert.doesNotMatch(createdPanel.webview.html, /\{\{surfaceHtml\}\}/);
    });

    // ---------- updateDataModel tests ----------

    it('updateDataModel returns { found: false } when the surface does not exist', () => {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: { activeTextEditor: undefined, createWebviewPanel() { return {} as any; } },
                    Uri: { joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({ toString: () => '' }) },
                };
            }
            if (request === 'fs') { return { readFileSync() { return ''; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') { return { renderSurface() { return ''; } }; }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const result = A2UIPanel.updateDataModel('nonexistent_surface', { key: 'value' });
        assert.deepStrictEqual(result, { found: false });
    });

    it('updateDataModel updates the dataModel of an existing surface and re-renders', async () => {
        let renderCallCount = 0;
        let lastRenderedSurface: unknown;
        let renderedHtmlSnapshots: string[] = [];
        let webviewHtmlRef = { value: '' };

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            const panel = {
                                webview: {
                                    get html() { return webviewHtmlRef.value; },
                                    set html(v: string) { webviewHtmlRef.value = v; renderedHtmlSnapshots.push(v); },
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(value: { toString(): string }) { return value; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            };
                            return panel;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : p.path || p.fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                return {
                    renderSurface(surface: { dataModel?: Record<string, unknown> }) {
                        renderCallCount++;
                        lastRenderedSurface = surface;
                        return `<p>data=${JSON.stringify(surface.dataModel ?? {})}</p>`;
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId: 'surface_update',
            components: [{ id: 'c1', component: { type: 'Text' } }],
            dataModel: { initial: true },
        }, false);

        const countBefore = renderCallCount;
        const result = A2UIPanel.updateDataModel('surface_update', { updated: true });

        assert.deepStrictEqual(result, { found: true });
        assert.equal(renderCallCount, countBefore + 1, 'expected one additional render call');
        assert.ok((lastRenderedSurface as any).dataModel?.updated === true, 'expected dataModel to be updated');
    });

    it('updateDataModel surfaces render errors when the renderer throws', async () => {
        let shouldThrow = false;

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                return {
                    renderSurface() {
                        if (shouldThrow) { throw new Error('render failure after update'); }
                        return '<p>ok</p>';
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId: 'surface_update_err',
            components: [{ id: 'c1', component: { type: 'Text' } }],
        }, false);

        shouldThrow = true;
        const result = A2UIPanel.updateDataModel('surface_update_err', { x: 1 });

        assert.deepStrictEqual(result, {
            found: true,
            renderErrors: [{ source: 'renderer', message: 'render failure after update' }],
        });
    });

    it('updateDataModel preserves the pending waiter when the surface is waiting for an action', async () => {
        const messageHandlers: Array<(message: unknown) => void> = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage(handler: (m: unknown) => void) {
                                        messageHandlers.push(handler);
                                        return { dispose() {} };
                                    },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') { return { renderSurface() { return '<p>ok</p>'; } }; }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surfaceId = 'surface_wait_update';
        const waitPromise = A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId,
            components: [{ id: 'c1', component: { type: 'Button' } }],
        }, true);

        // Mutate the dataModel while the surface is waiting
        const updateResult = A2UIPanel.updateDataModel(surfaceId, { refreshed: true });
        assert.deepStrictEqual(updateResult, { found: true });

        // Promise should still be pending
        const raceResult = await Promise.race([
            waitPromise.then(() => 'resolved'),
            new Promise((r) => setTimeout(() => r('timeout'), 50)),
        ]);
        assert.equal(raceResult, 'timeout', 'expected wait promise to remain pending after updateDataModel');

        // Resolve via user action to avoid dangling promise
        const latestHandler = messageHandlers.at(-1);
        assert.ok(latestHandler);
        latestHandler({ type: 'userAction', name: 'done', data: {} });
        await waitPromise;
    });

    // ---------- updateTitle tests ----------

    it('updateTitle returns { found: false } when the surface does not exist', () => {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: { activeTextEditor: undefined, createWebviewPanel() { return {} as any; } },
                    Uri: { joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({ toString: () => '' }) },
                };
            }
            if (request === 'fs') { return { readFileSync() { return ''; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') { return { renderSurface() { return ''; } }; }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const result = A2UIPanel.updateTitle('nonexistent_surface', 'New Title');
        assert.deepStrictEqual(result, { found: false });
    });

    it('updateTitle updates panel title, re-renders the webview with the new title, and returns { found: true }', async () => {
        let renderCallCount = 0;
        let panelTitleSet = '';
        let capturedHtml = '';

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel(_viewType: string, initialTitle: string) {
                            panelTitleSet = initialTitle;
                            return {
                                webview: {
                                    get html() { return capturedHtml; },
                                    set html(v: string) { capturedHtml = v; },
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose() { return { dispose() {} }; },
                                reveal() {},
                                dispose() {},
                                get title() { return panelTitleSet; },
                                set title(v: string) { panelTitleSet = v; },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><title>{{title}}</title>{{surfaceHtml}}{{diagnosticsHtml}}{{surfaceId}}{{nonce}}{{cspSource}}{{styleUri}}{{scriptUri}}</html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                return {
                    renderSurface() {
                        renderCallCount++;
                        return '<p>ok</p>';
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surfaceId = 'surface_title_rerender';
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId,
            title: 'Original Title',
            components: [{ id: 'c1', component: { type: 'Text' } }],
        }, false);

        const renderCountBefore = renderCallCount;
        const result = A2UIPanel.updateTitle(surfaceId, 'New Title');

        assert.deepStrictEqual(result, { found: true });
        assert.strictEqual(panelTitleSet, 'New Title', 'panel.title should be updated');
        // updateTitle MUST trigger a re-render so {{title}} in the HTML template is refreshed
        assert.strictEqual(renderCallCount, renderCountBefore + 1, 'updateTitle should trigger exactly one re-render');
        assert.ok(capturedHtml.includes('New Title'), 'rendered HTML should contain the new title');
        assert.ok(!capturedHtml.includes('Original Title'), 'rendered HTML should not contain the old title');
    });

    it('updateTitle surfaces render errors when the renderer throws', async () => {
        let panelTitleSet = '';

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel(_viewType: string, initialTitle: string) {
                            panelTitleSet = initialTitle;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose() { return { dispose() {} }; },
                                reveal() {},
                                dispose() {},
                                get title() { return panelTitleSet; },
                                set title(v: string) { panelTitleSet = v; },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html>{{surfaceHtml}}</html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                let callCount = 0;
                return {
                    renderSurface() {
                        callCount++;
                        if (callCount >= 2) {
                            throw new Error('Renderer exploded on re-render');
                        }
                        return '<p>ok</p>';
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surfaceId = 'surface_title_render_err';
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId,
            title: 'Original Title',
            components: [{ id: 'c1', component: { type: 'Text' } }],
        }, false);

        const result = A2UIPanel.updateTitle(surfaceId, 'Error Title');

        assert.deepStrictEqual(result, {
            found: true,
            renderErrors: [{ source: 'renderer', message: 'Renderer exploded on re-render' }],
        });
    });

    // ---------- appendComponents tests ----------

    it('appendComponents returns { found: false } when the surface does not exist', () => {
        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: { activeTextEditor: undefined, createWebviewPanel() { return {} as any; } },
                    Uri: { joinPath: () => ({ toString: () => '' }) },
                };
            }
            if (request === 'fs') { return { readFileSync() { return ''; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') { return { renderSurface() { return ''; } }; }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const result = A2UIPanel.appendComponents('nonexistent_surface', [{ id: 'x', component: { type: 'Text' } }]);
        assert.deepStrictEqual(result, { found: false });
    });

    it('appendComponents adds new components to existing ones and re-renders', async () => {
        let lastRenderedComponents: unknown[] = [];
        let renderCallCount = 0;

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                return {
                    renderSurface(surface: { components: unknown[] }) {
                        renderCallCount++;
                        lastRenderedComponents = surface.components;
                        return '<p>rendered</p>';
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surfaceId = 'surface_append';
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId,
            components: [{ id: 'original', component: { type: 'Text' } }],
        }, false);

        const countBefore = renderCallCount;
        const result = A2UIPanel.appendComponents(surfaceId, [
            { id: 'appended_1', component: { type: 'Button' } },
        ]);

        assert.deepStrictEqual(result, { found: true });
        assert.equal(renderCallCount, countBefore + 1, 'expected one additional render call');
        assert.equal(lastRenderedComponents.length, 2, 'expected two components after append');
        assert.deepStrictEqual(
            (lastRenderedComponents as Array<{ id: string }>).map((c) => c.id),
            ['original', 'appended_1'],
        );
    });

    it('appendComponents surfaces render errors when the renderer throws', async () => {
        let shouldThrow = false;

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage() { return { dispose() {} }; },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') {
                return {
                    renderSurface() {
                        if (shouldThrow) { throw new Error('append render failure'); }
                        return '<p>ok</p>';
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        await A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId: 'surface_append_err',
            components: [{ id: 'c1', component: { type: 'Text' } }],
        }, false);

        shouldThrow = true;
        const result = A2UIPanel.appendComponents('surface_append_err', [
            { id: 'c2', component: { type: 'Button' } },
        ]);

        assert.deepStrictEqual(result, {
            found: true,
            renderErrors: [{ source: 'renderer', message: 'append render failure' }],
        });
    });

    it('appendComponents preserves the pending waiter when the surface is waiting for an action', async () => {
        const messageHandlers: Array<(message: unknown) => void> = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    ViewColumn: { One: 1 },
                    window: {
                        activeTextEditor: undefined,
                        createWebviewPanel() {
                            let disposeHandler: (() => void) | undefined;
                            return {
                                webview: {
                                    html: '',
                                    cspSource: 'vscode-webview://test',
                                    asWebviewUri(v: { toString(): string }) { return v; },
                                    onDidReceiveMessage(handler: (m: unknown) => void) {
                                        messageHandlers.push(handler);
                                        return { dispose() {} };
                                    },
                                },
                                onDidDispose(handler: () => void) { disposeHandler = handler; return { dispose() {} }; },
                                reveal() {},
                                dispose() { disposeHandler?.(); },
                            } as any;
                        },
                    },
                    Uri: {
                        joinPath: (...parts: Array<{ path?: string; fsPath?: string } | string>) => ({
                            toString: () => parts.map((p) => typeof p === 'string' ? p : (p as any).path || (p as any).fsPath || '').join('/'),
                        }),
                    },
                };
            }
            if (request === 'fs') { return { readFileSync() { return '<html><body>{{surfaceHtml}}</body></html>'; } }; }
            if (request === 'path') { return { join: (...p: string[]) => p.join('/') }; }
            if (request === 'crypto') { return { randomBytes() { return { toString() { return 'nonce'; } }; } }; }
            if (request === './renderer') { return { renderSurface() { return '<p>ok</p>'; } }; }
            return originalLoad.call(this, request, parent, isMain);
        };

        const { A2UIPanel } = require('./panel.ts') as typeof import('./panel');
        const surfaceId = 'surface_wait_append';
        const waitPromise = A2UIPanel.showSurface({ fsPath: '/extension' } as any, {
            surfaceId,
            components: [{ id: 'c1', component: { type: 'Button' } }],
        }, true);

        const appendResult = A2UIPanel.appendComponents(surfaceId, [{ id: 'c2', component: { type: 'Text' } }]);
        assert.deepStrictEqual(appendResult, { found: true });

        const raceResult = await Promise.race([
            waitPromise.then(() => 'resolved'),
            new Promise((r) => setTimeout(() => r('timeout'), 50)),
        ]);
        assert.equal(raceResult, 'timeout', 'expected wait promise to remain pending after appendComponents');

        const latestHandler = messageHandlers.at(-1);
        assert.ok(latestHandler);
        latestHandler({ type: 'userAction', name: 'done', data: {} });
        await waitPromise;
    });
});
