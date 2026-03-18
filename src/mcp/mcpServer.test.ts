import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createRequire } from 'node:module';

import { RenderUIInputSchema, WhiteboardInputSchema, UpdateUIInputSchema, AppendUIInputSchema, CloseUIInputSchema } from '../tools/schemas';

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

function parseTextResult(result: unknown): unknown {
    assert.ok(result && typeof result === 'object');
    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
    assert.ok(Array.isArray(content));
    assert.strictEqual(content.length, 1);
    assert.strictEqual(content[0]?.type, 'text');
    assert.ok(typeof content[0]?.text === 'string');
    return JSON.parse(content[0]!.text!);
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
    updateUI?: (params: unknown) => Promise<unknown>;
    appendUI?: (params: unknown) => Promise<unknown>;
    closeUI?: (params: unknown) => Promise<unknown>;
} = {}) {
    const registeredTools: RegisteredTool[] = [];
    let cancellationTokenSourceConstructCount = 0;
    let cancellationTokenSourceDisposeCount = 0;

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
                    constructor() {
                        cancellationTokenSourceConstructCount += 1;
                    }
                    token = { isCancellationRequested: false };
                    cancel() {
                        this.token.isCancellationRequested = true;
                    }
                    dispose() {
                        cancellationTokenSourceDisposeCount += 1;
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
                updateUI: options.updateUI ?? (async () => ({
                    surfaceId: 'surface_test',
                    applied: true,
                })),
                appendUI: options.appendUI ?? (async () => ({
                    surfaceId: 'surface_test',
                    applied: true,
                })),
                closeUI: options.closeUI ?? (async () => ({
                    surfaceId: 'surface_test',
                    closed: true,
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
    const updateUITool = registeredTools.find((tool) => tool.name === 'update_ui');
    assert.ok(updateUITool, 'Expected update_ui MCP tool to be registered');
    const appendUITool = registeredTools.find((tool) => tool.name === 'append_ui');
    assert.ok(appendUITool, 'Expected append_ui MCP tool to be registered');
    const closeUITool = registeredTools.find((tool) => tool.name === 'close_ui');
    assert.ok(closeUITool, 'Expected close_ui MCP tool to be registered');

    return {
        openWhiteboardTool,
        renderUITool,
        updateUITool,
        appendUITool,
        closeUITool,
        getCancellationTokenSourceConstructCount: () => cancellationTokenSourceConstructCount,
        getCancellationTokenSourceDisposeCount: () => cancellationTokenSourceDisposeCount,
        resetCancellationTokenSourceConstructCount: () => { cancellationTokenSourceConstructCount = 0; },
        resetCancellationTokenSourceDisposeCount: () => { cancellationTokenSourceDisposeCount = 0; },
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

        // FIX #5: handler now returns structured error instead of throwing
        const result = await openWhiteboardTool.handler(invalidImportInput, {});
        const resultText = (result as { content: Array<{ text: string }> }).content[0].text;
        assert.match(resultText, /Import image uri cannot be empty/);
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
                enableA2UI: true,
                streaming: false,
                a2uiLevel: 'basic',
                deleteSurface: false,
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

        const result = await renderUITool.handler(invalidInput, {});
        const payload = parseTextResult(result) as { surfaceId: string; rendered: boolean; error?: string };
        assert.strictEqual(payload.surfaceId, '');
        assert.strictEqual(payload.rendered, false);
        assert.match(payload.error ?? '', /Validation error:/);
        assert.strictEqual(renderUICalls, 0);
    });
});

describe('McpServerManager update_ui registration', () => {
    it('accepts valid update_ui input and forwards parsed params', async () => {
        const receivedCalls: unknown[] = [];
        const { updateUITool } = await loadHarness({
            async updateUI(params) {
                receivedCalls.push(params);
                return { surfaceId: 'surface_1', applied: true };
            },
        });

        const updateInput = {
            surfaceId: 'surface_1',
            dataModel: { key: 'value' },
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(updateUITool.config.inputSchema, updateInput),
            summarizeSchemaResult(UpdateUIInputSchema, updateInput),
        );

        await updateUITool.handler(updateInput, {});
        assert.deepStrictEqual(receivedCalls, [updateInput]);
    });

    it('rejects update_ui input missing both title and dataModel', async () => {
        let updateUICalls = 0;
        const { updateUITool } = await loadHarness({
            async updateUI() {
                updateUICalls += 1;
                return { surfaceId: 'surface_invalid', applied: false };
            },
        });

        const invalidInput = { surfaceId: 'surface_1' };

        assert.deepStrictEqual(
            summarizeSchemaResult(updateUITool.config.inputSchema, invalidInput),
            summarizeSchemaResult(UpdateUIInputSchema, invalidInput),
        );

        const result = await updateUITool.handler(invalidInput, {});
        const payload = parseTextResult(result) as { surfaceId: string; applied: boolean; error?: string };
        assert.strictEqual(payload.surfaceId, 'surface_1');
        assert.strictEqual(payload.applied, false);
        assert.match(payload.error ?? '', /Validation error:/);
        assert.strictEqual(updateUICalls, 0);
    });
});

describe('McpServerManager append_ui registration', () => {
    it('accepts valid append_ui input and forwards parsed params', async () => {
        const receivedCalls: unknown[] = [];
        const { appendUITool } = await loadHarness({
            async appendUI(params) {
                receivedCalls.push(params);
                return { surfaceId: 'surface_2', applied: true };
            },
        });

        const appendInput = {
            surfaceId: 'surface_2',
            components: [
                { id: 'text_1', component: { type: 'Text', props: { content: 'Hello' } } },
            ],
        };

        assert.deepStrictEqual(
            summarizeSchemaResult(appendUITool.config.inputSchema, appendInput),
            summarizeSchemaResult(AppendUIInputSchema, appendInput),
        );

        await appendUITool.handler(appendInput, {});
        assert.deepStrictEqual(receivedCalls, [{ ...appendInput, finalize: false }]);
    });

    it('rejects append_ui input missing components before calling appendUI', async () => {
        let appendUICalls = 0;
        const { appendUITool } = await loadHarness({
            async appendUI() {
                appendUICalls += 1;
                return { surfaceId: 'surface_invalid', applied: false };
            },
        });

        const invalidInput = { surfaceId: 'surface_2' };

        assert.deepStrictEqual(
            summarizeSchemaResult(appendUITool.config.inputSchema, invalidInput),
            summarizeSchemaResult(AppendUIInputSchema, invalidInput),
        );

        const result = await appendUITool.handler(invalidInput, {});
        const payload = parseTextResult(result) as { surfaceId: string; applied: boolean; error?: string };
        assert.strictEqual(payload.surfaceId, 'surface_2');
        assert.strictEqual(payload.applied, false);
        assert.match(payload.error ?? '', /Validation error:/);
        assert.strictEqual(appendUICalls, 0);
    });
});

describe('McpServerManager close_ui registration', () => {
    it('accepts valid close_ui input and forwards parsed params', async () => {
        const receivedCalls: unknown[] = [];
        const { closeUITool } = await loadHarness({
            async closeUI(params) {
                receivedCalls.push(params);
                return { surfaceId: 'surface_3', closed: true };
            },
        });

        const closeInput = { surfaceId: 'surface_3' };

        assert.deepStrictEqual(
            summarizeSchemaResult(closeUITool.config.inputSchema, closeInput),
            summarizeSchemaResult(CloseUIInputSchema, closeInput),
        );

        await closeUITool.handler(closeInput, {});
        assert.deepStrictEqual(receivedCalls, [closeInput]);
    });

    it('rejects close_ui input with empty surfaceId', async () => {
        let closeUICalls = 0;
        const { closeUITool } = await loadHarness({
            async closeUI() {
                closeUICalls += 1;
                return { surfaceId: '', closed: false };
            },
        });

        const invalidInput = { surfaceId: '' };

        assert.deepStrictEqual(
            summarizeSchemaResult(closeUITool.config.inputSchema, invalidInput),
            summarizeSchemaResult(CloseUIInputSchema, invalidInput),
        );

        const result = await closeUITool.handler(invalidInput, {});
        const payload = parseTextResult(result) as { surfaceId: string; closed: boolean; error?: string };
        assert.strictEqual(payload.surfaceId, '');
        assert.strictEqual(payload.closed, false);
        assert.match(payload.error ?? '', /Validation error:/);
        assert.strictEqual(closeUICalls, 0);
    });
});

describe('McpServerManager - CancellationTokenSource for delta tools', () => {
    it('render_ui handler disposes CancellationTokenSource after success', async () => {
        const {
            renderUITool,
            resetCancellationTokenSourceConstructCount,
            resetCancellationTokenSourceDisposeCount,
            getCancellationTokenSourceConstructCount,
            getCancellationTokenSourceDisposeCount,
        } = await loadHarness({
            async renderUI() {
                return { surfaceId: 'surface_render', rendered: true };
            },
        });

        resetCancellationTokenSourceConstructCount();
        resetCancellationTokenSourceDisposeCount();
        await renderUITool.handler({ title: 'Render', components: [{ id: 'text_1', component: { type: 'Text', props: { content: 'Hello' } } }] }, {});
        assert.strictEqual(getCancellationTokenSourceConstructCount(), 1);
        assert.strictEqual(getCancellationTokenSourceDisposeCount(), 1);
    });

    it('update_ui handler constructs CancellationTokenSource and passes token', async () => {
        const {
            updateUITool,
            resetCancellationTokenSourceConstructCount,
            resetCancellationTokenSourceDisposeCount,
            getCancellationTokenSourceConstructCount,
            getCancellationTokenSourceDisposeCount,
        } =
            await loadHarness({
                async updateUI() {
                    return { surfaceId: 'surface_1', applied: true };
                },
            });

        resetCancellationTokenSourceConstructCount();
        resetCancellationTokenSourceDisposeCount();
        await updateUITool.handler({ surfaceId: 'surface_1', dataModel: { key: 'value' } }, {});
        assert.strictEqual(
            getCancellationTokenSourceConstructCount(),
            1,
            'update_ui must construct CancellationTokenSource to pass the token',
        );
        assert.strictEqual(
            getCancellationTokenSourceDisposeCount(),
            1,
            'update_ui must dispose the CancellationTokenSource after the request completes',
        );
    });

    it('append_ui handler constructs CancellationTokenSource and passes token', async () => {
        const {
            appendUITool,
            resetCancellationTokenSourceConstructCount,
            resetCancellationTokenSourceDisposeCount,
            getCancellationTokenSourceConstructCount,
            getCancellationTokenSourceDisposeCount,
        } =
            await loadHarness({
                async appendUI() {
                    return { surfaceId: 'surface_2', applied: true };
                },
            });

        resetCancellationTokenSourceConstructCount();
        resetCancellationTokenSourceDisposeCount();
        await appendUITool.handler(
            {
                surfaceId: 'surface_2',
                components: [{ id: 'text_1', component: { type: 'Text', props: { content: 'Hello' } } }],
            },
            {},
        );
        assert.strictEqual(
            getCancellationTokenSourceConstructCount(),
            1,
            'append_ui must construct CancellationTokenSource to pass the token',
        );
        assert.strictEqual(
            getCancellationTokenSourceDisposeCount(),
            1,
            'append_ui must dispose the CancellationTokenSource after the request completes',
        );
    });

    it('close_ui handler constructs CancellationTokenSource and passes token', async () => {
        const {
            closeUITool,
            resetCancellationTokenSourceConstructCount,
            resetCancellationTokenSourceDisposeCount,
            getCancellationTokenSourceConstructCount,
            getCancellationTokenSourceDisposeCount,
        } =
            await loadHarness({
                async closeUI() {
                    return { surfaceId: 'surface_3', closed: true };
                },
            });

        resetCancellationTokenSourceConstructCount();
        resetCancellationTokenSourceDisposeCount();
        await closeUITool.handler({ surfaceId: 'surface_3' }, {});
        assert.strictEqual(
            getCancellationTokenSourceConstructCount(),
            1,
            'close_ui must construct CancellationTokenSource to pass the token',
        );
        assert.strictEqual(
            getCancellationTokenSourceDisposeCount(),
            1,
            'close_ui must dispose the CancellationTokenSource after the request completes',
        );
    });

    it('update_ui disposes CancellationTokenSource after validation errors too', async () => {
        const {
            updateUITool,
            resetCancellationTokenSourceConstructCount,
            resetCancellationTokenSourceDisposeCount,
            getCancellationTokenSourceConstructCount,
            getCancellationTokenSourceDisposeCount,
        } = await loadHarness();

        resetCancellationTokenSourceConstructCount();
        resetCancellationTokenSourceDisposeCount();
        await updateUITool.handler({ surfaceId: 'surface_1' }, {});
        assert.strictEqual(getCancellationTokenSourceConstructCount(), 1);
        assert.strictEqual(getCancellationTokenSourceDisposeCount(), 1);
    });
});
