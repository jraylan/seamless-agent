import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createRequire } from 'node:module';

import { RenderUIInputSchema, WhiteboardInputSchema } from '../tools/schemas';

const require = createRequire(__filename);
const Module = require('node:module') as typeof import('node:module') & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const modulePath = require.resolve('./mcpServer.ts');
let originalLoad: typeof Module._load;

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
    renderUI?: (params: unknown) => Promise<unknown>;
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
                },
            };

            return server;
        },
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
                },
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
                },
            };
        }

        if (request === 'crypto') {
            return {
                randomUUID() {
                    return 'uuid';
                },
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
                    images: [],
                    interactionId: 'wb_test',
                    action: 'cancelled',
                    instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                })),
                renderUI: options.renderUI ?? (async () => ({
                    surfaceId: 'surface_test',
                    rendered: true,
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
                },
            };
        }

        return originalLoad.call(this, request, parent, isMain);
    };

    const { McpServerManager } = require('./mcpServer.ts') as typeof import('./mcpServer');
    const manager = new McpServerManager({} as any, {} as any);
    await manager.start();

    const openWhiteboardTool = registeredTools.find((tool) => tool.name === 'open_whiteboard');
    assert.ok(openWhiteboardTool, 'Expected open_whiteboard MCP tool to be registered');
    const renderUITool = registeredTools.find((tool) => tool.name === 'render_ui');
    assert.ok(renderUITool, 'Expected render_ui MCP tool to be registered');

    return {
        openWhiteboardTool,
        renderUITool,
    };
}

describe('McpServerManager open_whiteboard registration', () => {
    it('accepts importImages in the MCP schema and forwards parsed image-first inputs', async () => {
        const receivedCalls: unknown[] = [];
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard(params) {
                receivedCalls.push(params);
                return {
                    submitted: false,
                    images: [],
                    interactionId: 'wb_imports',
                    action: 'cancelled',
                    instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                };
            },
        });

        const importInput = {
            title: 'Annotate screenshot',
            context: 'Mark the risky areas.',
            importImages: [
                {
                    uri: 'file:///tmp/mockup.png',
                    label: 'Mockup',
                },
            ],
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, importInput),
            summarizeSchemaResult(WhiteboardInputSchema, importInput),
        );

        await openWhiteboardTool.handler(importInput, {});

        assert.deepStrictEqual(receivedCalls, [{
            ...importInput,
            blankCanvas: true,
        }]);
    });

    it('defaults blankCanvas to true for blank whiteboard MCP requests', async () => {
        const receivedCalls: unknown[] = [];
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard(params) {
                receivedCalls.push(params);
                return {
                    submitted: false,
                    images: [],
                    interactionId: 'wb_blank',
                    action: 'cancelled',
                    instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                };
            },
        });

        const blankInput = {
            title: 'Blank whiteboard',
            context: 'Start from scratch.',
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, blankInput),
            summarizeSchemaResult(WhiteboardInputSchema, blankInput),
        );

        await openWhiteboardTool.handler(blankInput, {});

        assert.deepStrictEqual(receivedCalls, [{
            ...blankInput,
            blankCanvas: true,
        }]);
    });

    it('accepts initialCanvases in the MCP schema and forwards seeded inputs', async () => {
        const receivedCalls: unknown[] = [];
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard(params) {
                receivedCalls.push(params);
                return {
                    submitted: false,
                    images: [],
                    interactionId: 'wb_seeded_mcp',
                    action: 'cancelled',
                    instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                };
            },
        });

        const seededInput = {
            title: 'Seeded starter content',
            initialCanvases: [
                {
                    name: 'Sketch',
                    seedElements: [
                        {
                            type: 'text',
                            x: 120,
                            y: 80,
                            text: 'Hello',
                        },
                    ],
                },
            ],
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, seededInput),
            summarizeSchemaResult(WhiteboardInputSchema, seededInput),
        );

        await openWhiteboardTool.handler(seededInput, {});

        assert.deepStrictEqual(receivedCalls, [{
            ...seededInput,
            blankCanvas: true,
        }]);
    });

    it('rejects invalid imported-image input before calling openWhiteboard', async () => {
        let openWhiteboardCalls = 0;
        const { openWhiteboardTool } = await loadHarness({
            async openWhiteboard() {
                openWhiteboardCalls += 1;
                return {
                    submitted: false,
                    images: [],
                    interactionId: 'wb_invalid_import',
                    action: 'cancelled',
                    instruction: 'The whiteboard was cancelled. Do not treat this submission as approved user input.',
                };
            },
        });

        const invalidImportInput = {
            title: 'Broken import',
            importImages: [
                {
                    uri: '',
                },
            ],
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(openWhiteboardTool.config.inputSchema, invalidImportInput),
            summarizeSchemaResult(WhiteboardInputSchema, invalidImportInput),
        );

        await assert.rejects(
            () => openWhiteboardTool.handler(invalidImportInput, {}),
            /Import image uri cannot be empty/,
        );
        assert.strictEqual(openWhiteboardCalls, 0);
    });
});

describe('McpServerManager render_ui registration', () => {
    it('accepts the flat render_ui schema and forwards parsed inputs', async () => {
        const receivedCalls: unknown[] = [];
        const { renderUITool } = await loadHarness({
            async renderUI(params) {
                receivedCalls.push(params);
                return {
                    surfaceId: 'surface_architecture',
                    rendered: true,
                };
            },
        });

        const renderInput = {
            surfaceId: 'surface_architecture',
            title: 'Architecture',
            components: [
                {
                    id: 'card_1',
                    component: {
                        type: 'Card',
                    },
                },
                {
                    id: 'text_1',
                    parentId: 'card_1',
                    component: {
                        type: 'Text',
                        props: {
                            content: '$data.summary',
                        },
                    },
                },
            ],
            dataModel: {
                summary: 'Rendered from data',
            },
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(renderUITool.config.inputSchema, renderInput),
            summarizeSchemaResult(RenderUIInputSchema, renderInput),
        );

        await renderUITool.handler(renderInput, {});

            assert.deepStrictEqual(receivedCalls, [{
                ...renderInput,
                waitForAction: false,
                enableA2UI: false,
                a2uiLevel: 'basic',
            }]);
    });

    it('rejects render_ui input missing components before calling renderUI', async () => {
        let renderUICalls = 0;
        const { renderUITool } = await loadHarness({
            async renderUI() {
                renderUICalls += 1;
                return {
                    surfaceId: 'surface_invalid',
                    rendered: true,
                };
            },
        });

        const invalidInput = {
            title: 'Missing components',
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(renderUITool.config.inputSchema, invalidInput),
            summarizeSchemaResult(RenderUIInputSchema, invalidInput),
        );

        await assert.rejects(
            () => renderUITool.handler(invalidInput, {}),
            /components/i,
        );
        assert.strictEqual(renderUICalls, 0);
    });
});
