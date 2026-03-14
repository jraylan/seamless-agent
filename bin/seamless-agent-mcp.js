#!/usr/bin/env node
/**
 * Seamless Agent MCP Server - CLI Tool
 *
 * This is a standalone MCP server that communicates with the Seamless Agent
 * VS Code extension via HTTP API. It uses stdio transport to communicate
 * with MCP clients (like Antigravity).
 *
 * Usage: node seamless-agent-mcp.js --port <api-port>
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
// Use zod/v3 API so the MCP SDK routes schema conversion through zod-to-json-schema
// (rather than z4mini.toJSONSchema) — avoids a bundled-duplicate-core conflict.
const { z } = require('zod/v3');
const os = require('os');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(os.homedir(), '.antigravity', 'seamless-agent-state.json');

/**
 * Reads the state file and returns the best (most recently active) instance.
 * Supports both the new registry format:
 *   { "uuid": { port, token, lastActive, startedAt }, ... }
 * and the legacy flat format:
 *   { port, token }
 */
function readBestInstance() {
    try {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const registry = JSON.parse(raw);
        // Backward compatibility: old format has a direct `port` field
        if (registry && typeof registry.port === 'number' && typeof registry.token === 'string') {
            return { port: registry.port, token: registry.token };
        }
        const entries = Object.values(registry);
        if (!Array.isArray(entries) || entries.length === 0) return null;
        // Sort by lastActive descending, fall back to startedAt
        entries.sort((a, b) => {
            const aTime = (a.lastActive ?? a.startedAt ?? 0);
            const bTime = (b.lastActive ?? b.startedAt ?? 0);
            return bTime - aTime;
        });
        const best = entries[0];
        if (!best || !best.port || !best.token) return null;
        return { port: best.port, token: best.token };
    } catch {
        return null;
    }
}

// Parse command line arguments
// --port and --token are optional; if absent, routing relies entirely on the registry.
function parseArgs() {
    const args = process.argv.slice(2);
    let port = 0;
    let token = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            port = parseInt(args[i + 1], 10);
            i++;
        }
        if (args[i] === '--token' && args[i + 1]) {
            token = String(args[i + 1]);
            i++;
        }
    }

    return { port: isNaN(port) ? 0 : port, token };
}

// Make HTTP request to VS Code extension API
// state is a mutable object { port, token } — updated on ECONNREFUSED from state file
async function callExtensionApi(state, endpoint, data) {
    async function attempt(port, token) {
        const url = `http://localhost:${port}${endpoint}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    // Re-read registry on every call to route to the most-recently-focused IDE window
    const proactive = readBestInstance();
    if (proactive && (proactive.port !== state.port || proactive.token !== state.token)) {
        state.port = proactive.port;
        state.token = proactive.token;
    }

    try {
        return await attempt(state.port, state.token);
    } catch (error) {
        // If the extension was restarted with a new port, recover from the registry and retry once
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            const fresh = readBestInstance();
            if (fresh && (fresh.port !== state.port || fresh.token !== state.token)) {
                state.port = fresh.port;
                state.token = fresh.token;
                try {
                    return await attempt(state.port, state.token);
                } catch (_) {
                    // Fall through to the error below
                }
            }
            throw new Error(
                `Cannot connect to Seamless Agent extension API at port ${state.port}. ` +
                `Please ensure the VS Code extension is running and the API service has started.`
            );
        }
        throw error;
    }
}

async function main() {
    const args = parseArgs();

    // Mutable state — port and token may be refreshed from state file on ECONNREFUSED
    const state = { port: args.port, token: args.token };

    // Create MCP server
    const server = new McpServer({
        name: 'seamless-agent',
        version: '1.0.0',
    });

    // Register ask_user tool
    server.registerTool(
        'ask_user',
        {
            description: 'Ask the user to confirm an action or decision. Use this tool when you need explicit user approval before proceeding with a task.',
            inputSchema: z.object({
                question: z.string().describe('The question or prompt to display to the user for confirmation'),
                title: z.string().optional().describe('Optional custom title for the confirmation dialog'),
                agentName: z.string().optional().describe('Your agent name'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/ask_user', {
                    question: args.question,
                    title: args.title,
                    agentName: args.agentName,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                responded: false,
                                response: `Error: ${error.message}`,
                                attachments: [],
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    // Register plan_review tool
    server.registerTool(
        'plan_review',
        {
            description: "Present a plan to the user for approval (review mode).",
            inputSchema: z.object({
                plan: z.string().describe('The detailed plan in Markdown format to present to the user for review. Use headers, bullet points, and code blocks for clarity.'),
                title: z.string().optional().describe('Optional title for the review panel. Defaults to "Review Plan".'),
                chatId: z.string().optional().describe('Optional chat ID to associate the review with a specific conversation.'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/plan_review', {
                    plan: args.plan,
                    title: args.title,
                    mode: 'review',
                    chatId: args.chatId,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                status: 'cancelled',
                                comments: [],
                                reviewId: '',
                                error: `Error: ${error.message}`,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        }
    );


    // Register plan_review tool
    server.registerTool(
        'walkthrough_review',
        {
            description: "Present content as a walkthrough (step-by-step guide) in a dedicated panel with comment support.",
            inputSchema: z.object({
                plan: z.string().describe('The detailed plan in Markdown format to present to the user for review. Use headers, bullet points, and code blocks for clarity.'),
                title: z.string().optional().describe('Optional title for the review panel. Defaults to "Review Plan".'),
                chatId: z.string().optional().describe('Optional chat ID to associate the review with a specific conversation.'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/plan_review', {
                    plan: args.plan,
                    title: args.title,
                    mode: 'walkthrough',
                    chatId: args.chatId,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                status: 'cancelled',
                                comments: [],
                                reviewId: '',
                                error: `Error: ${error.message}`,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    // Register open_whiteboard tool
    server.registerTool(
        'open_whiteboard',
        {
            description: 'Open an interactive whiteboard panel for sketching, drawing, or annotating visuals. Returns exported images as data URIs.',
            inputSchema: z.object({
                context: z.string().optional().describe('Instructions for the user about what to draw or annotate'),
                title: z.string().optional().describe('Title for the whiteboard panel'),
                blankCanvas: z.boolean().optional().describe('Open a blank canvas. Defaults to true.'),
                importImages: z.array(z.object({
                    uri: z.string().describe('File URI of an image to import'),
                    label: z.string().optional().describe('Optional label for the image'),
                })).optional().describe('Optional images to pre-load onto the canvas'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/open_whiteboard', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Register render_ui tool
    server.registerTool(
        'render_ui',
        {
            description: 'Render a structured UI panel in a dedicated VS Code webview using a flat component list. Use for dashboards, forms, data displays, reports, or any rich structured UI. This tool creates the surface — call it FIRST before using append_ui, update_ui, or close_ui on the same surfaceId.',
            inputSchema: z.object({
                surfaceId: z.string().optional().describe('Optional unique surface identifier. Re-using the same surfaceId will update an existing panel.'),
                title: z.string().optional().describe('Optional panel title displayed in the webview header.'),
                components: z.array(z.object({
                    id: z.string(),
                    component: z.object({
                        type: z.enum(['Row', 'Column', 'Card', 'Divider', 'Text', 'Heading', 'Image', 'Markdown', 'CodeBlock', 'Button', 'TextField', 'Checkbox', 'Select']),
                        props: z.record(z.any()).optional(),
                    }),
                })).optional(),
                waitForAction: z.boolean().optional().describe('If true, block until the user clicks a Button'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/render_ui', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ surfaceId: '', rendered: false, error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Register update_ui tool
    server.registerTool(
        'update_ui',
        {
            description: 'Update the dataModel and/or title of an existing surface.',
            inputSchema: z.object({
                surfaceId: z.string().describe('The surface identifier of the panel to update'),
                title: z.string().optional().describe('Optional new panel title'),
                dataModel: z.record(z.any()).optional().describe('Replacement data model'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/update_ui', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ surfaceId: args.surfaceId ?? '', applied: false, error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Register append_ui tool
    server.registerTool(
        'append_ui',
        {
            description: 'Append components onto an existing surface.',
            inputSchema: z.object({
                surfaceId: z.string().describe('The surface identifier of the panel to append onto'),
                title: z.string().optional().describe('Optional new panel title'),
                components: z.array(z.object({
                    id: z.string(),
                    component: z.object({
                        type: z.enum(['Row', 'Column', 'Card', 'Divider', 'Text', 'Heading', 'Image', 'Markdown', 'CodeBlock', 'Button', 'TextField', 'Checkbox', 'Select']),
                        props: z.record(z.any()).optional(),
                    }),
                })).describe('Non-empty list of components to append'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/append_ui', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ surfaceId: args.surfaceId ?? '', applied: false, error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Register close_ui tool
    server.registerTool(
        'close_ui',
        {
            description: 'Close an active surface panel by surfaceId.',
            inputSchema: z.object({
                surfaceId: z.string().describe('The surface identifier of the panel to close'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/close_ui', args);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ surfaceId: args.surfaceId ?? '', closed: false, error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Register list_surfaces tool
    server.registerTool(
        'list_surfaces',
        {
            description: 'List all currently active UI surface panels with their IDs, titles, and timestamps.',
            inputSchema: z.object({}).describe('No parameters required'),
        },
        async (args) => {
            try {
                const result = await callExtensionApi(state, '/list_surfaces', {});
                return {
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ surfaces: [], error: `Error: ${error.message}` }) }],
                    isError: true,
                };
            }
        }
    );

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Log to stderr (stdout is used for MCP protocol)
    console.error(`Seamless Agent MCP server started, connecting to API at port ${state.port}`);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
