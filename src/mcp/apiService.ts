import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { askUser, planReview, parsePlanReviewInput, PlanReviewInput } from '../tools';

const MAX_REQUEST_BODY_BYTES = 256 * 1024; // 256KB

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
    private authToken: string | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private provider: AgentInteractionProvider
    ) { }

    async start() {
        try {
            this.port = await this.findAvailablePort();
            const storedToken = this.context.globalState.get<string>('seamlessAgent.apiAuthToken');
            if (storedToken && typeof storedToken === 'string' && storedToken.length >= 20) {
                this.authToken = storedToken;
            } else {
                this.authToken = crypto.randomBytes(32).toString('base64url');
                await this.context.globalState.update('seamlessAgent.apiAuthToken', this.authToken);
            }
            console.log(`Starting API service on port ${this.port}`);

            // Create HTTP server for API endpoints
            this.server = http.createServer(async (req, res) => {
                // Intencionalmente NÃO habilitamos CORS. Este serviço é local e não deve ser consumido por páginas web.

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

                    // Plan review endpoint
                    if (url === '/plan_review' && req.method === 'POST') {
                        await this.handlePlanReview(req, res);
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
        if (!this.isAuthorized(req)) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'WWW-Authenticate': 'Bearer'
            });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        const contentType = req.headers['content-type'];
        const contentTypeValue = Array.isArray(contentType) ? contentType[0] : contentType;
        if (!contentTypeValue || !contentTypeValue.toLowerCase().startsWith('application/json')) {
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unsupported Media Type. Use application/json' }));
            return;
        }

        // Parse request body
        let body: string;
        try {
            body = await this.readRequestBody(req, MAX_REQUEST_BODY_BYTES);
        } catch {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request body too large' }));
            return;
        }
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
     * Handle POST /plan_review requests
     */
    private async handlePlanReview(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): Promise<void> {
        if (!this.isAuthorized(req)) {
            res.writeHead(401, {
                'Content-Type': 'application/json',
                'WWW-Authenticate': 'Bearer'
            });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        const contentType = req.headers['content-type'];
        const contentTypeValue = Array.isArray(contentType) ? contentType[0] : contentType;
        if (!contentTypeValue || !contentTypeValue.toLowerCase().startsWith('application/json')) {
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unsupported Media Type. Use application/json' }));
            return;
        }

        // Parse request body
        let body: string;
        try {
            body = await this.readRequestBody(req, MAX_REQUEST_BODY_BYTES);
        } catch {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request body too large' }));
            return;
        }

        // Parse and validate with Zod schema
        let params: PlanReviewInput;
        try {
            const parsed = JSON.parse(body);
            params = parsePlanReviewInput(parsed);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid input';
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Validation error: ${errorMessage}` }));
            return;
        }

        // Create a cancellation token
        const tokenSource = new vscode.CancellationTokenSource();

        try {
            const result = await planReview(
                params,
                this.context,
                this.provider,
                tokenSource.token
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'cancelled',
                comments: [],
                reviewId: '',
                error: `Error: ${error}`,
            }));
        } finally {
            tokenSource.dispose();
        }
    }

    /**
     * Read request body as string
     */
    private readRequestBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            let totalBytes = 0;
            req.on('data', (chunk) => {
                totalBytes += Buffer.byteLength(chunk);
                if (totalBytes > maxBytes) {
                    reject(new Error('Request body too large'));
                    try {
                        req.destroy();
                    } catch {
                        // ignore
                    }
                    return;
                }
                body += chunk.toString('utf8');
            });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    private isAuthorized(req: http.IncomingMessage): boolean {
        if (!this.authToken) return false;

        const authHeader = req.headers['authorization'];
        const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        if (typeof authValue === 'string' && authValue.startsWith('Bearer ')) {
            const token = authValue.slice('Bearer '.length).trim();
            return this.safeEqual(token, this.authToken);
        }

        const altHeader = req.headers['x-seamless-agent-token'];
        const altValue = Array.isArray(altHeader) ? altHeader[0] : altHeader;
        if (typeof altValue === 'string') {
            return this.safeEqual(altValue.trim(), this.authToken);
        }

        return false;
    }

    private safeEqual(a: string, b: string): boolean {
        try {
            const aBuf = Buffer.from(a, 'utf8');
            const bBuf = Buffer.from(b, 'utf8');
            if (aBuf.length !== bBuf.length) return false;
            return crypto.timingSafeEqual(aBuf, bBuf);
        } catch {
            return false;
        }
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
        if (!this.port || !this.authToken) return;

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
                args: [cliScriptPath, '--port', String(this.port), '--token', this.authToken]
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
