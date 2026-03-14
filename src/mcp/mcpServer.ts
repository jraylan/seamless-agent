import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { askUser, openWhiteboard, planReviewApproval, walkthroughReview, renderUI, updateUI, appendUI, closeUI, listSurfaces } from '../tools';
import { parseWhiteboardInput, parseRenderUIInput, parseUpdateUIInput, parseAppendUIInput, parseCloseUIInput, parseListSurfacesInput, WhiteboardInputSchema, RenderUIInputSchema, UpdateUIInputSchema, AppendUIInputSchema, CloseUIInputSchema, ListSurfacesInputSchema } from '../tools/schemas';
import { Logger } from '../logging';

function createMcpTextResult(payload: unknown) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(payload)
            }
        ]
    };
}

function getOptionalStringArg(args: unknown, key: string): string | undefined {
    if (!args || typeof args !== 'object') {
        return undefined;
    }

    const value = (args as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
}

async function withCancellationToken<T>(
    signal: AbortSignal | undefined,
    callback: (token: vscode.CancellationToken) => Promise<T>,
): Promise<T> {
    const tokenSource = new vscode.CancellationTokenSource();
    const abortListener = () => tokenSource.cancel();
    signal?.addEventListener('abort', abortListener);

    try {
        return await callback(tokenSource.token);
    } finally {
        signal?.removeEventListener('abort', abortListener);
        tokenSource.dispose();
    }
}

export class McpServerManager {
    private server: http.Server | undefined;
    private mcpServer: McpServer | undefined;
    private port: number | undefined;
    private transport: StreamableHTTPServerTransport | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private provider: AgentInteractionProvider
    ) { }

    async start(reusePort: boolean = false) {
        try {
            if (!reusePort || !this.port) {
                this.port = await this.findAvailablePort();
            }

            Logger.log(`Starting MCP server on port ${this.port}`);

            this.mcpServer = new McpServer({
                name: "Seamless Agent",
                version: "1.0.0"
            });

            // Register ask_user tool
            const askUserOptionLabelSchema = z.string()
                .max(120, "Option label must be 120 characters or less. Keep 'label' concise and move long explanatory text to 'description'.")
                .describe("Short option title shown in the button. Keep it concise (ideally single line and <=120 chars); put longer details in description.");

            this.mcpServer.registerTool(
                "ask_user",
                {
                    description: "Present a question or prompt to the user and wait for their response. Use for confirmations, decisions, and collecting user input. " +
                        "Provide options[] for clickable answer buttons (flat strings or {label,description} objects); use multiSelect:true when multiple selections are allowed. " +
                        "Returns responded:true with the user's response string, or responded:false if the dialog was dismissed. " +
                        "MANDATORY in this workspace: call ask_user for every reply, response, or summary.",
                    inputSchema: z.object({
                        question: z.string().describe("The question or prompt to display to the user for confirmation"),
                        title: z.string().optional().describe("Optional custom title for the confirmation dialog"),
                        agentName: z.string().optional().describe("Your agent name"),
                        options: z.union([
                            z.array(z.union([
                                z.string(),
                                z.object({
                                    label: askUserOptionLabelSchema,
                                    description: z.string().optional().describe("Optional detailed context; use this for longer explanatory text")
                                })
                            ])),
                            z.array(z.object({
                                title: z.string(),
                                options: z.array(z.union([
                                    z.string(),
                                    z.object({
                                        label: askUserOptionLabelSchema,
                                        description: z.string().optional().describe("Optional detailed context; use this for longer explanatory text")
                                    })
                                ])),
                                multiSelect: z.boolean().optional()
                            }))
                        ]).optional().describe("Optional predefined answer options. For object options, keep 'label' short and place longer details in 'description'.")
                    })
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }
                    try {
                        // Validate args
                        if (!args || typeof args !== 'object' || !('question' in args)) {
                            throw new Error('Invalid arguments: question is required');
                        }

                    // Validate args
                    if (!args || typeof args !== 'object' || !('question' in args)) {
                        throw new Error('Invalid arguments: question is required');
                    }

                    try {
                        const result = await askUser(
                            {
                                question: String(args.question),
                                title: args.title ? String(args.title) : undefined,
                                agentName: args.agentName ? String(args.agentName) : undefined,
                                options: args.options ?? undefined,
                                multiSelect: args.multiSelect ? Boolean(args.multiSelect) : false
                            },
                            this.provider,
                            tokenSource.token
                        );

                        const appendText = vscode.workspace.getConfiguration('seamless-agent').get<string>('askUserAppendText', '');

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result)
                                },
                                ...(appendText ? [{
                                    type: "text",
                                    text: appendText
                                }] : [])
                            ]
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        return createMcpTextResult({ error: `Validation failed: ${message}` });
                    } finally {
                        tokenSource.dispose();
                    }

                }
            );

            // Register plan_review tool (explicit: plan approval)
            this.mcpServer.registerTool(
                "plan_review",
                {
                    description: "Present a Markdown implementation plan to the user for approval and wait for their decision. " +
                        "Returns status:'approved' (proceed), 'recreateWithChanges' (revise and resubmit via plan_review again with requiredRevisions applied), " +
                        "or 'cancelled'. Use for multi-step or non-trivial tasks before executing. " +
                        "For step-by-step guides use walkthrough_review instead.",
                    inputSchema: z.object({
                        plan: z.string().describe("The detailed plan in Markdown format to present to the user for review"),
                        title: z.string().optional().describe("Optional title for the review panel"),
                        chatId: z.string().optional().describe("Optional chat session ID for grouping reviews")
                    })
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }
                    try {
                        // Validate args
                        if (!args || typeof args !== 'object' || !('plan' in args)) {
                            throw new Error('Invalid arguments: plan is required');
                        }

                        const result = await planReviewApproval(
                            {
                                plan: String(args.plan),
                                title: args.title ? String(args.title) : undefined,
                                chatId: args.chatId ? String(args.chatId) : undefined
                            },
                            this.context,
                            this.provider,
                            tokenSource.token
                        );

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result)
                                }
                            ]
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        return createMcpTextResult({ error: `Validation failed: ${message}` });
                    } finally {
                        tokenSource.dispose();
                    }
                }
            );

            // Register open_whiteboard tool
            this.mcpServer.registerTool(
                "open_whiteboard",
                {
                    description: "Open an interactive whiteboard panel for the user to sketch, draw, or annotate visuals. Blocks until the user submits. " +
                        "Returns action ('approved' | 'recreateWithChanges' | 'cancelled'), exported images as data URIs, and an instruction string. " +
                        "When action==='approved': use images as confirmed visual input. " +
                        "When action==='recreateWithChanges': address the user's annotated feedback and call open_whiteboard again before concluding. " +
                        "When action==='cancelled': discard the submission. " +
                        "Use importImages to pre-load screenshots for annotation. " +
                        "Use initialCanvases[].seedElements (preferred) for agent-authored starter sketches; use fabricState only to reopen a saved session.",
                    inputSchema: WhiteboardInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }
                    try {
                        const params = parseWhiteboardInput(args);

                        const result = await openWhiteboard(
                            params,
                            this.context,
                            this.provider,
                            tokenSource.token
                        );

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result)
                                }
                            ]
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        return createMcpTextResult({ error: `Validation failed: ${message}` });
                    } finally {
                        tokenSource.dispose();
                    }
                }
            );

            // Register walkthrough_review tool (explicit: walkthrough review mode)
            this.mcpServer.registerTool(
                "walkthrough_review",
                {
                    description: "Present a step-by-step Markdown guide to the user in a dedicated walkthrough panel. " +
                        "Use for tutorials, setup instructions, and sequential how-to guides. " +
                        "The user can comment; address feedback by calling walkthrough_review again with the revised steps. " +
                        "For implementation plan approval (approve/reject workflow) use plan_review instead.",
                    inputSchema: z.object({
                        plan: z.string().describe("The walkthrough content in Markdown format to present to the user"),
                        title: z.string().optional().describe("Optional title for the walkthrough panel"),
                        chatId: z.string().optional().describe("Optional chat session ID for grouping walkthroughs")
                    })
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }
                    try {
                        if (!args || typeof args !== 'object' || !('plan' in args)) {
                            throw new Error('Invalid arguments: plan is required');
                        }

                        const result = await walkthroughReview(
                            {
                                plan: String(args.plan),
                                title: args.title ? String(args.title) : undefined,
                                chatId: args.chatId ? String(args.chatId) : undefined
                            },
                            this.context,
                            this.provider,
                            tokenSource.token
                        );

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result)
                                }
                            ]
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        return createMcpTextResult({ error: `Validation failed: ${message}` });
                    } finally {
                        tokenSource.dispose();
                    }
                }
            );

            // Register render_ui tool (Phase 2 A2UI surface rendering)
            this.mcpServer.registerTool(
                "render_ui",
                {
                    description: "Render a structured UI panel in a dedicated VS Code webview using a flat component list. " +
                        "Use for dashboards, forms, data displays, reports, or any rich structured UI. " +
                        "This tool creates the surface — call it FIRST before using append_ui, update_ui, or close_ui on the same surfaceId. " +
                        "Do NOT use to change only the dataModel or title of an existing surface — use update_ui instead (cheaper). " +
                        "STREAMING WORKFLOW: pass streaming:true to show a loading indicator, then call append_ui() one or more times to add content incrementally, ending with append_ui(finalize:true) to dismiss the indicator. " +
                        "FORM/BUTTON WORKFLOW: pass waitForAction:true to block until the user clicks a Button; the result will include userAction.name (the Button's action prop) and userAction.data (form field values keyed by component name props). " +
                        "To close a surface, call close_ui or pass deleteSurface:true with the surfaceId.",
                    inputSchema: RenderUIInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    return withCancellationToken(signal, async (token) => {
                        let params;
                        try {
                            params = parseRenderUIInput(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                            return createMcpTextResult({
                                surfaceId: getOptionalStringArg(args, 'surfaceId') ?? '',
                                rendered: false,
                                error: `Validation error: ${errorMessage}`,
                            });
                        }

                        const result = await renderUI(
                            params,
                            this.context,
                            this.provider,
                            token,
                        );

                        return createMcpTextResult(result);
                    });
                }
            );

            // Register update_ui tool (delta: mutate dataModel/title of an existing surface)
            this.mcpServer.registerTool(
                "update_ui",
                {
                    description: "Update the dataModel and/or title of an existing surface without resending the full component tree. " +
                        "Use this for efficient data refresh — e.g. updating values displayed via $data.path bindings after a background fetch. " +
                        "dataModel is a FULL REPLACEMENT (not a patch/merge); all existing bindings are re-resolved from the new model. " +
                        "At least one of title or dataModel must be provided. " +
                        "Requires the surface to already exist (created by render_ui). " +
                        "If notFound:true is returned, the surface no longer exists — call list_surfaces to check active panels or call render_ui to create a new one.",
                    inputSchema: UpdateUIInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    return withCancellationToken(signal, async (token) => {
                        let params;
                        try {
                            params = parseUpdateUIInput(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                            return createMcpTextResult({
                                surfaceId: getOptionalStringArg(args, 'surfaceId') ?? '',
                                applied: false,
                                error: `Validation error: ${errorMessage}`,
                            });
                        }

                        const result = await updateUI(params, undefined, token);
                        return createMcpTextResult(result);
                    });
                }
            );

            // Register append_ui tool (delta: append components to an existing surface)
            this.mcpServer.registerTool(
                "append_ui",
                {
                    description: "Append one or more components onto an existing surface without replacing the current component tree. " +
                        "Requires render_ui to have been called first with the same surfaceId. " +
                        "PRIMARY USE CASE — streaming/progressive UI: call render_ui(streaming:true) to show initial structure and a loading indicator, " +
                        "then call append_ui() one or more times to add content incrementally, " +
                        "and end with append_ui(finalize:true) to dismiss the indicator. " +
                        "parentId in appended components can reference IDs from the original render_ui components OR from previously appended components. " +
                        "If notFound:true is returned, the surface no longer exists — call list_surfaces to check active panels.",
                    inputSchema: AppendUIInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    return withCancellationToken(signal, async (token) => {
                        let params;
                        try {
                            params = parseAppendUIInput(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                            return createMcpTextResult({
                                surfaceId: getOptionalStringArg(args, 'surfaceId') ?? '',
                                applied: false,
                                error: `Validation error: ${errorMessage}`,
                            });
                        }

                        const result = await appendUI(params, undefined, token);
                        return createMcpTextResult(result);
                    });
                }
            );

            // Register close_ui tool (delta: close an existing surface panel)
            this.mcpServer.registerTool(
                "close_ui",
                {
                    description: "Close an active surface panel by surfaceId. " +
                        "Use for cleanup when a task completes or to dismiss a stale UI panel. " +
                        "Equivalent to calling render_ui(deleteSurface:true, surfaceId:...) but lighter weight (no component resend). " +
                        "closed:true means the panel was found and closed. " +
                        "closed:false means the surface was not found (may already be closed or never created) — call list_surfaces to enumerate active panels.",
                    inputSchema: CloseUIInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    return withCancellationToken(signal, async (token) => {
                        let params;
                        try {
                            params = parseCloseUIInput(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                            return createMcpTextResult({
                                surfaceId: getOptionalStringArg(args, 'surfaceId') ?? '',
                                closed: false,
                                error: `Validation error: ${errorMessage}`,
                            });
                        }

                        const result = await closeUI(params, undefined, token);
                        return createMcpTextResult(result);
                    });
                }
            );

            // Register list_surfaces tool (delta: list all active surface panels)
            this.mcpServer.registerTool(
                "list_surfaces",
                {
                    description: "List all currently active surface panels with their IDs, titles, and creation timestamps. " +
                        "Use as a recovery/discovery tool when you have lost track of a surfaceId. " +
                        "The returned surfaceId values can be passed directly to update_ui, append_ui, or close_ui. " +
                        "An empty surfaces array means no panels are currently open.",
                    inputSchema: ListSurfacesInputSchema
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    return withCancellationToken(signal, async (token) => {
                        let params;
                        try {
                            params = parseListSurfacesInput(args);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                            return createMcpTextResult({
                                surfaces: [],
                                error: `Validation error: ${errorMessage}`,
                            });
                        }

                        const result = await listSurfaces(params, undefined, token);
                        return createMcpTextResult(result);
                    });
                }
            );

            // -----------------------------
            // Create transport
            this.transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => `sess_${crypto.randomUUID()}`
            });

            // Connect server to transport
            await this.mcpServer.connect(this.transport);

            // Create HTTP server
            this.server = http.createServer(async (req, res) => {
                // Intencionalmente NÃO habilitamos CORS e evitamos logar headers (podem conter credenciais).
                Logger.log(`[MCP Server] Incoming request: ${req.method} ${req.url}`);

                try {
                    const url = req.url || '/';

                    // Handle SSE connection endpoint
                    if (url === '/sse' || url.startsWith('/sse/') || url.startsWith('/sse?')) {
                        if (req.method === 'DELETE') {
                            Logger.log('[MCP Server] Handling DELETE request');
                            try {
                                await this.transport?.handleRequest(req, res);
                            } catch (e) {
                                Logger.error('[MCP Server] Error in transport DELETE:', e);
                                if (!res.headersSent) {
                                    res.writeHead(202);
                                    res.end('Session closed');
                                }
                            }
                            return;
                        }

                        // Rewrite URL to root so transport generates correct relative links
                        // and doesn't get confused by the /sse prefix
                        const queryIndex = url.indexOf('?');
                        req.url = queryIndex !== -1 ? '/' + url.substring(queryIndex) : '/';

                        Logger.log(`[MCP Server] Forwarding to transport as ${req.url}`);
                        await this.transport?.handleRequest(req, res);
                        Logger.log(`[MCP Server] Transport finished. Status: ${res.statusCode}`);
                        return;
                    }

                    // Handle message endpoint (POST requests with session_id)
                    // The client sends messages to /message?session_id=...
                    if (url.startsWith('/message') || url.startsWith('/messages')) {
                        Logger.log(`[MCP Server] Handling message request to ${url}`);
                        await this.transport?.handleRequest(req, res);
                        Logger.log(`[MCP Server] Transport finished (message). Status: ${res.statusCode}`);
                        return;
                    }

                    Logger.log(`[MCP Server] 404 for ${url}`);
                    res.writeHead(404);
                    res.end();
                } catch (error) {
                    Logger.error('[MCP Server] Error handling request:', error);
                    if (!res.headersSent) {
                        res.writeHead(500);
                        res.end('Internal Server Error');
                    }
                }
            });

            // Start listening
            await new Promise<void>((resolve) => {
                this.server?.listen(this.port, '127.0.0.1', () => resolve());
            });

            // Register with Antigravity
            await this.registerWithAntigravity();

        } catch (error) {
            Logger.error('Failed to start MCP server:', error);
            vscode.window.showErrorMessage(`Failed to start Seamless Agent MCP server: ${error}`);
        }
    }

    async restart() {
        Logger.log('[MCP Server] Restarting...');
        try {
            await Promise.race([
                this.dispose(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch (e) {
            Logger.error('[MCP Server] Error during dispose on restart:', e);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.start(true); // Reuse port
        vscode.window.showInformationMessage('Seamless Agent MCP Server restarted.');
    }

    async dispose() {
        try {
            if (this.server) {
                this.server.close();
                this.server = undefined;
            }

            if (this.mcpServer) {
                try {
                    await this.mcpServer.close();
                } catch (e) {
                    Logger.error('Error closing MCP server:', e);
                }
                this.mcpServer = undefined;
            }
        } finally {
            await this.unregisterFromAntigravity();
        }
    }

    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const port = address.port;
                    server.close(() => resolve(port));
                } else {
                    reject(new Error('Failed to get port'));
                }
            });
            server.on('error', reject);
        });
    }

    private async registerWithAntigravity() {
        if (!this.port) return;

        const mcpConfigPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
        const serverUrl = `http://localhost:${this.port}/sse`;

        try {
            // Ensure directory exists
            const configDir = path.dirname(mcpConfigPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            let config: any = { mcpServers: {} };
            if (fs.existsSync(mcpConfigPath)) {
                try {
                    const content = fs.readFileSync(mcpConfigPath, 'utf8');
                    config = JSON.parse(content);
                } catch (e) {
                    Logger.warn('Failed to parse existing mcp_config.json, starting fresh', e);
                }
            }

            if (!config.mcpServers) {
                config.mcpServers = {};
            }

            config.mcpServers['seamless-agent'] = {
                serverUrl: serverUrl
            };

            fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));

        } catch (error) {
            Logger.error('Failed to register MCP server in mcp_config.json:', error);
        }
    }

    private async unregisterFromAntigravity() {
        const mcpConfigPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');

        try {
            if (fs.existsSync(mcpConfigPath)) {
                let config: any = {};
                try {
                    const content = fs.readFileSync(mcpConfigPath, 'utf8');
                    config = JSON.parse(content);
                } catch (e) {
                    return; // Can't parse, nothing to remove
                }

                if (config.mcpServers && config.mcpServers['seamless-agent']) {
                    delete config.mcpServers['seamless-agent'];

                    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
                }
            }
        } catch (error) {
            Logger.error('Failed to unregister MCP server:', error);
        }
    }
}
