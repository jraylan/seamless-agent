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
import { askUser, planReviewApproval, walkthroughReview } from '../tools';

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
            console.log(`Starting MCP server on port ${this.port}`);

            this.mcpServer = new McpServer({
                name: "Seamless Agent",
                version: "1.0.0"
            });

            // Register ask_user tool
            this.mcpServer.registerTool(
                "ask_user",
                {
                    inputSchema: z.object({
                        question: z.string().describe("The question or prompt to display to the user for confirmation"),
                        title: z.string().optional().describe("Optional custom title for the confirmation dialog"),
                        agentName: z.string().optional().describe("Your agent name"),
                        options: z.union([
                            z.array(z.union([
                                z.string(),
                                z.object({
                                    label: z.string(),
                                    description: z.string().optional()
                                })
                            ])),
                            z.array(z.object({
                                title: z.string(),
                                options: z.array(z.union([
                                    z.string(),
                                    z.object({
                                        label: z.string(),
                                        description: z.string().optional()
                                    })
                                ])),
                                multiSelect: z.boolean().optional()
                            }))
                        ]).optional().describe("Optional predefined answer options")
                    })
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    // Convert MCP cancellation token to VS Code cancellation token
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }

                    // Validate args
                    if (!args || typeof args !== 'object' || !('question' in args)) {
                        throw new Error('Invalid arguments: question is required');
                    }

                    const result = await askUser(
                        {
                            question: String(args.question),
                            title: args.title ? String(args.title) : undefined,
                            agentName: args.agentName ? String(args.agentName) : undefined,
                            options: args.options ?? undefined
                        },
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
                }
            );

            // Register plan_review tool (explicit: plan approval)
            this.mcpServer.registerTool(
                "plan_review",
                {
                    inputSchema: z.object({
                        plan: z.string().describe("The detailed plan in Markdown format to present to the user for review"),
                        title: z.string().optional().describe("Optional title for the review panel"),
                        chatId: z.string().optional().describe("Optional chat session ID for grouping reviews")
                    })
                },
                async (args: any, { signal }: { signal?: AbortSignal }) => {
                    // Convert MCP cancellation token to VS Code cancellation token
                    const tokenSource = new vscode.CancellationTokenSource();
                    if (signal) {
                        signal.onabort = () => tokenSource.cancel();
                    }

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
                }
            );

            // Register walkthrough_review tool (explicit: walkthrough review mode)
            this.mcpServer.registerTool(
                "walkthrough_review",
                {
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
                console.log(`[MCP Server] Incoming request: ${req.method} ${req.url}`);

                try {
                    const url = req.url || '/';

                    // Handle SSE connection endpoint
                    if (url === '/sse' || url.startsWith('/sse/') || url.startsWith('/sse?')) {
                        if (req.method === 'DELETE') {
                            console.log('[MCP Server] Handling DELETE request');
                            try {
                                await this.transport?.handleRequest(req, res);
                            } catch (e) {
                                console.error('[MCP Server] Error in transport DELETE:', e);
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

                        console.log(`[MCP Server] Forwarding to transport as ${req.url}`);
                        await this.transport?.handleRequest(req, res);
                        console.log(`[MCP Server] Transport finished. Status: ${res.statusCode}`);
                        return;
                    }

                    // Handle message endpoint (POST requests with session_id)
                    // The client sends messages to /message?session_id=...
                    if (url.startsWith('/message') || url.startsWith('/messages')) {
                        console.log(`[MCP Server] Handling message request to ${url}`);
                        await this.transport?.handleRequest(req, res);
                        console.log(`[MCP Server] Transport finished (message). Status: ${res.statusCode}`);
                        return;
                    }

                    console.log(`[MCP Server] 404 for ${url}`);
                    res.writeHead(404);
                    res.end();
                } catch (error) {
                    console.error('[MCP Server] Error handling request:', error);
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
            console.error('Failed to start MCP server:', error);
            vscode.window.showErrorMessage(`Failed to start Seamless Agent MCP server: ${error}`);
        }
    }

    async restart() {
        console.log('[MCP Server] Restarting...');
        try {
            await Promise.race([
                this.dispose(),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
        } catch (e) {
            console.error('[MCP Server] Error during dispose on restart:', e);
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
                    console.error('Error closing MCP server:', e);
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
                    console.warn('Failed to parse existing mcp_config.json, starting fresh', e);
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
            console.error('Failed to register MCP server in mcp_config.json:', error);
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
            console.error('Failed to unregister MCP server:', error);
        }
    }
}
