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

    it('settles the previous waiter when a second waitForAction call reuses the same surfaceId', async () => {
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

        const firstResult = await Promise.race([
            firstPromise,
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
        ]);

        assert.notEqual(firstResult, 'timeout', 'expected the previous waiter to be settled');
        assert.deepStrictEqual(firstResult, { dismissed: true });

        const latestHandler = messageHandlers.at(-1);
        assert.ok(latestHandler, 'expected a webview message handler');
        latestHandler({
            type: 'userAction',
            name: 'submit',
            data: {
                value: 'ok',
            },
        });

        await assert.doesNotReject(() => secondPromise);
        assert.deepStrictEqual(await secondPromise, {
            dismissed: false,
            userAction: {
                name: 'submit',
                data: {
                    value: 'ok',
                },
            },
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
});
