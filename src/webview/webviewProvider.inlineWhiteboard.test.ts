import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

describe('AgentInteractionProvider inline whiteboard attachments', () => {
    const modulePath = require.resolve('./webviewProvider.ts');
    let originalLoad: typeof Module._load;

    beforeEach(() => {
        originalLoad = Module._load;
        delete require.cache[modulePath];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    });

    it('adds submitted whiteboard images to the active ask_user attachments', async () => {
        const postedMessages: unknown[] = [];
        const openWhiteboardCalls: unknown[] = [];

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    CancellationTokenSource: class {
                        token = { isCancellationRequested: false };
                        cancel() {
                            this.token.isCancellationRequested = true;
                        }
                        dispose() { }
                    },
                    window: {
                        showErrorMessage() { },
                    },
                    workspace: {
                        getConfiguration() {
                            return {
                                get(_key: string, fallback: unknown) {
                                    return fallback;
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

            if (request === '../storage/chatHistoryStorage') {
                return {
                    ChatHistoryStorage: class {},
                    getChatHistoryStorage() {
                        return {
                            clearAll() { },
                            getPendingPlanReviews() { return []; },
                            getPendingWhiteboards() { return []; },
                            getCompletedInteractions() { return []; },
                            saveAskUserInteraction() { },
                        };
                    },
                };
            }

            if (request === './sessionHistory') {
                return {
                    createInteraction() { },
                };
            }

            if (request === '../config/ignorePaths') {
                return {
                    getExcludePattern() {
                        return undefined;
                    },
                };
            }

            if (request === './utils') {
                return {
                    truncate(value: string) {
                        return value;
                    },
                };
            }

            if (request === '../localization') {
                return {
                    strings: {
                        openWhiteboard: 'Open Whiteboard',
                        whiteboard: 'Whiteboard',
                    },
                    localize(key: string, ...args: unknown[]) {
                        return [key, ...args].join(' ');
                    },
                };
            }

            if (request === '../logging') {
                return {
                    Logger: {
                        error() { },
                        debug() { },
                        log() { },
                        warn() { },
                    },
                };
            }

            if (request === '../tools/openWhiteboard') {
                return {
                    openWhiteboard: async (params: unknown) => {
                        openWhiteboardCalls.push(params);
                        return {
                            submitted: true,
                            action: 'approved',
                            instruction: 'ok',
                            interactionId: 'wb_inline',
                            images: [
                                {
                                    canvasId: 'canvas_1',
                                    canvasName: 'Canvas 1',
                                    imageUri: 'file:///tmp/canvas-1.png',
                                    width: 1600,
                                    height: 900,
                                },
                            ],
                        };
                    },
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const { AgentInteractionProvider } = require('./webviewProvider.ts') as typeof import('./webviewProvider');
        const provider = new AgentInteractionProvider({
            extensionUri: { path: '/extension', fsPath: '/extension' },
        } as any);

        (provider as any)._view = {
            webview: {
                postMessage(message: unknown) {
                    postedMessages.push(message);
                },
            },
        };
        (provider as any)._pendingRequests.set('req_1', {
            item: {
                id: 'req_1',
                question: 'Please sketch the UI changes.',
                title: 'Need markup',
                createdAt: 1,
                attachments: [],
                agentName: 'Agent',
            },
            resolve() { },
        });

        await (provider as any)._handleOpenInlineWhiteboard('req_1');

        assert.deepStrictEqual(openWhiteboardCalls, [{
            title: 'Open Whiteboard',
            context: 'Please sketch the UI changes.',
            blankCanvas: true,
        }]);

        const pending = (provider as any)._pendingRequests.get('req_1');
        assert.equal(pending.item.attachments.length, 1);
        assert.equal(pending.item.attachments[0].uri, 'file:///tmp/canvas-1.png');
        assert.equal(pending.item.attachments[0].isImage, true);
        assert.ok(postedMessages.some((message: any) => message?.type === 'updateAttachments' && message?.requestId === 'req_1'));
    });
});
