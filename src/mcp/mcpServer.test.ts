import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { z } from 'zod';

import { WhiteboardInputSchema } from '../tools/schemas';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

type RegisteredTool = {
    name: string;
    config: {
        inputSchema: z.ZodTypeAny;
    };
    handler: (args: unknown, context: { signal?: AbortSignal }) => Promise<unknown>;
};

function summarizeSchemaResult(schema: z.ZodTypeAny, input: unknown) {
    const result = schema.safeParse(input);
    if (result.success) {
        return {
            success: true as const,
            data: result.data,
        };
    }

    return {
        success: false as const,
        error: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    };
}

describe('McpServerManager open_whiteboard registration', () => {
    const modulePath = require.resolve('./mcpServer.ts');
    let originalLoad: typeof Module._load;

    beforeEach(() => {
        originalLoad = Module._load;
        delete require.cache[modulePath];
    });

    afterEach(() => {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    });

    async function loadHarness(options: {
        openWhiteboard?: (params: unknown) => Promise<unknown>;
    } = {}) {
        const registeredTools: RegisteredTool[] = [];

        class MockMcpServer {
            registerTool(name: string, config: RegisteredTool['config'], handler: RegisteredTool['handler']) {
                registeredTools.push({ name, config, handler });
            }

            async connect() {
                return undefined;
            }

            async close() {
                return undefined;
            }
        }

        class MockStreamableHTTPServerTransport {
            constructor(_options: unknown) { }

            async handleRequest() {
                return undefined;
            }
        }

        const httpMock = {
            createServer() {
                const server = {
                    listen(_port: number, _host: string, callback?: () => void) {
                        callback?.();
                    },
                    address() {
                        return { port: 43123 };
                    },
                    close(callback?: () => void) {
                        callback?.();
                    },
                    on() {
                        return server;
                    }
                };

                return server;
            }
        };

        Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
            if (request === 'vscode') {
                return {
                    CancellationTokenSource: class {
                        token = { isCancellationRequested: false };
                        cancel() {
                            this.token.isCancellationRequested = true;
                        }
                    },
                    window: {
                        showErrorMessage() { },
                        showInformationMessage() { },
                    }
                };
            }

            if (request === 'http') {
                return httpMock;
            }

            if (request === 'fs') {
                return {
                    existsSync() {
                        return false;
                    },
                    mkdirSync() { },
                    readFileSync() {
                        throw new Error('not implemented');
                    },
                    writeFileSync() { },
                };
            }

            if (request === 'os') {
                return {
                    homedir() {
                        return '/tmp';
                    }
                };
            }

            if (request === 'crypto') {
                return {
                    randomUUID() {
                        return 'uuid';
                    }
                };
            }

            if (request === '@modelcontextprotocol/sdk/server/mcp.js') {
                return {
                    McpServer: MockMcpServer,
                };
            }

            if (request === '@modelcontextprotocol/sdk/server/streamableHttp.js') {
                return {
                    StreamableHTTPServerTransport: MockStreamableHTTPServerTransport,
                };
            }

            if (request === '../tools') {
                return {
                    askUser: async () => ({ responded: true, response: 'ok', attachments: [] }),
                    openWhiteboard: options.openWhiteboard ?? (async () => ({
                        submitted: false,
                        canvases: [],
                        interactionId: 'wb_test',
                        sceneSummary: {
                            totalCanvases: 0,
                            totalElements: 0,
                            canvases: [],
                        },
                    })),
                    planReviewApproval: async () => ({ status: 'approved', requiredRevisions: [], reviewId: 'review_1' }),
                    walkthroughReview: async () => ({ status: 'acknowledged', requiredRevisions: [], reviewId: 'review_2' }),
                };
            }

            if (request === '../logging') {
                return {
                    Logger: {
                        log() { },
                        warn() { },
                        error() { },
                    }
                };
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const { McpServerManager } = require('./mcpServer.ts') as typeof import('./mcpServer');
        const manager = new McpServerManager({} as any, {} as any);
        await manager.start();

        const openWhiteboardTool = registeredTools.find((tool) => tool.name === 'open_whiteboard');
        assert.ok(openWhiteboardTool, 'Expected open_whiteboard MCP tool to be registered');

        return {
            openWhiteboardTool,
        };
    }

    it('accepts seedElements in the MCP schema and forwards parsed seeded canvases unchanged', async () => {
        const receivedCalls: unknown[] = [];
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard(params) {
                receivedCalls.push(params);
                return {
                    submitted: false,
                    canvases: [],
                    interactionId: 'wb_seeded',
                    sceneSummary: {
                        totalCanvases: 0,
                        totalElements: 0,
                        canvases: [],
                    },
                };
            }
        });

        const seededInput = {
            title: 'Seeded whiteboard',
            context: 'Sketch a basic flow.',
            initialCanvases: [
                {
                    name: 'Sketch 1',
                    seedElements: [
                        {
                            type: 'rectangle',
                            x: 40,
                            y: 60,
                            width: 220,
                            height: 120,
                            strokeColor: '#2563eb',
                        },
                        {
                            type: 'text',
                            x: 72,
                            y: 96,
                            text: 'Start',
                        }
                    ]
                }
            ]
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, seededInput),
            summarizeSchemaResult(WhiteboardInputSchema, seededInput),
        );

        await openWhiteboardTool.handler(seededInput, {});

        assert.deepStrictEqual(receivedCalls, [seededInput]);
    });

    it('accepts explicit blankCanvas requests and forwards them unchanged', async () => {
        const receivedCalls: unknown[] = [];
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard(params) {
                receivedCalls.push(params);
                return {
                    submitted: false,
                    canvases: [],
                    interactionId: 'wb_blank',
                    sceneSummary: {
                        totalCanvases: 0,
                        totalElements: 0,
                        canvases: [],
                    },
                };
            }
        });

        const blankInput = {
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
            blankCanvas: true,
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, blankInput),
            summarizeSchemaResult(WhiteboardInputSchema, blankInput),
        );

        await openWhiteboardTool.handler(blankInput, {});

        assert.deepStrictEqual(receivedCalls, [blankInput]);
    });

    it('rejects invalid seeded input before calling openWhiteboard', async () => {
        let openWhiteboardCalls = 0;
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard() {
                openWhiteboardCalls += 1;
                return {
                    submitted: false,
                    canvases: [],
                    interactionId: 'wb_invalid_seed',
                    sceneSummary: {
                        totalCanvases: 0,
                        totalElements: 0,
                        canvases: [],
                    },
                };
            }
        });

        const invalidSeededInput = {
            title: 'Broken seed',
            initialCanvases: [
                {
                    name: 'Broken canvas',
                    seedElements: [
                        {
                            type: 'text',
                            x: 10,
                            y: 20,
                            text: '',
                        }
                    ]
                }
            ]
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, invalidSeededInput),
            summarizeSchemaResult(WhiteboardInputSchema, invalidSeededInput),
        );

        await assert.rejects(
            () => openWhiteboardTool.handler(invalidSeededInput, {}),
            /Seed text cannot be empty/,
        );
        assert.strictEqual(openWhiteboardCalls, 0);
    });

    it('rejects empty fabricState strings before runtime and never calls openWhiteboard', async () => {
        let openWhiteboardCalls = 0;
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard() {
                openWhiteboardCalls += 1;
                return {
                    submitted: false,
                    canvases: [],
                    interactionId: 'wb_invalid_fabric',
                    sceneSummary: {
                        totalCanvases: 0,
                        totalElements: 0,
                        canvases: [],
                    },
                };
            }
        });

        const invalidFabricStateInput = {
            title: 'Broken fabric seed',
            initialCanvases: [
                {
                    name: 'Canvas 1',
                    fabricState: '',
                }
            ]
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, invalidFabricStateInput),
            summarizeSchemaResult(WhiteboardInputSchema, invalidFabricStateInput),
        );

        await assert.rejects(
            () => openWhiteboardTool.handler(invalidFabricStateInput, {}),
            /Canvas fabricState cannot be empty/,
        );
        assert.strictEqual(openWhiteboardCalls, 0);
    });

    it('rejects implicit blank requests before calling openWhiteboard', async () => {
        let openWhiteboardCalls = 0;
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard() {
                openWhiteboardCalls += 1;
                return {
                    submitted: false,
                    canvases: [],
                    interactionId: 'wb_implicit_blank',
                    sceneSummary: {
                        totalCanvases: 0,
                        totalElements: 0,
                        canvases: [],
                    },
                };
            }
        });

        const implicitBlankInput = {
            title: 'Implicit blank whiteboard',
            context: 'Start from scratch.',
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, implicitBlankInput),
            summarizeSchemaResult(WhiteboardInputSchema, implicitBlankInput),
        );

        await assert.rejects(
            () => openWhiteboardTool.handler(implicitBlankInput, {}),
            /Provide initialCanvases for starter content, or set blankCanvas to true to intentionally open an empty whiteboard/,
        );
        assert.strictEqual(openWhiteboardCalls, 0);
    });
});
