import * as vscode from 'vscode';
import * as http from 'http';
import { AgentInteractionProvider } from './webviewProvider';
import { askUser } from './tools';

/**
 * API Service Manager
 * 
 * Provides HTTP API endpoints for the CLI MCP server to communicate
 * with the VS Code extension. This replaces the previous SSE-based
 * MCP server with a simpler HTTP API approach.
 */
export class ApiServiceManager {
    private server: http.Server | undefined;
    private port: number | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private provider: AgentInteractionProvider
    ) { }

    async start() {
        try {
            this.port = await this.findAvailablePort();
            console.log(`Starting API service on port ${this.port}`);

            // Create HTTP server for API endpoints
            this.server = http.createServer(async (req, res) => {
                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                const url = req.url || '/';

                try {
                    // Health check endpoint
                    if (url === '/health' && req.method === 'GET') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'ok', port: this.port }));
                        return;
                    }

                    // Ask user endpoint
                    if (url === '/ask_user' && req.method === 'POST') {
                        await this.handleAskUser(req, res);
                        return;
                    }

                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
                } catch (error) {
                    console.error('[API Service] Error handling request:', error);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal server error' }));
                    }
                }
            });

            // Start listening
            await new Promise<void>((resolve) => {
                this.server?.listen(this.port, '127.0.0.1', () => resolve());
            });

            console.log(`API service started on port ${this.port}`);

            // Register with Antigravity using command format
            await this.registerWithAntigravity();

            vscode.window.showInformationMessage(
                `Seamless Agent API service started on port ${this.port}`
            );

        } catch (error) {
            console.error('Failed to start API service:', error);
            vscode.window.showErrorMessage(`Failed to start Seamless Agent API service: ${error}`);
        }
    }

    /**
     * Handle POST /ask_user requests
     */
    private async handleAskUser(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        // Parse request body
        const body = await this.readRequestBody(req);
        let params: { question: string; title?: string; agentName?: string };

        try {
            params = JSON.parse(body);
        } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
        }

        if (!params.question) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required field: question' }));
            return;
        }

        // Create a cancellation token (no actual cancellation support via HTTP)
        const tokenSource = new vscode.CancellationTokenSource();

        try {
            const result = await askUser(
                {
                    question: params.question,
                    title: params.title,
                    agentName: params.agentName,
                },
                this.provider,
                tokenSource.token
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                responded: false,
                response: `Error: ${error}`,
                attachments: [],
            }));
        } finally {
            tokenSource.dispose();
        }
    }

    /**
     * Read request body as string
     */
    private readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
            });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    async restart() {
        console.log('[API Service] Restarting...');
        try {
            await this.dispose();
        } catch (e) {
            console.error('[API Service] Error during dispose on restart:', e);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        await this.start();
        vscode.window.showInformationMessage('Seamless Agent API service restarted.');
    }

    async dispose() {
        await this.unregisterFromAntigravity();

        if (this.server) {
            return new Promise<void>((resolve) => {
                this.server?.close(() => {
                    this.server = undefined;
                    resolve();
                });
            });
        }
    }

    getPort(): number | undefined {
        return this.port;
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

        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const mcpConfigPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');

        // Get the path to the bundled CLI script in dist/
        const cliScriptPath = path.join(this.context.extensionPath, 'dist', 'seamless-agent-mcp.js');

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

            // Use command-based format for cross-platform compatibility
            // Note: Requires Node.js to be installed and in PATH
            // This matches the standard MCP server configuration pattern
            config.mcpServers['seamless-agent'] = {
                command: 'node',
                args: [cliScriptPath, '--port', String(this.port)]
            };

            fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
            console.log(`Registered with Antigravity: command=node, args=[${cliScriptPath}, --port, ${this.port}]`);

        } catch (error) {
            console.error('Failed to register MCP server in mcp_config.json:', error);
        }
    }

    private async unregisterFromAntigravity() {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        const mcpConfigPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');

        try {
            if (fs.existsSync(mcpConfigPath)) {
                let config: any = {};
                try {
                    const content = fs.readFileSync(mcpConfigPath, 'utf8');
                    config = JSON.parse(content);
                } catch (e) {
                    return;
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
