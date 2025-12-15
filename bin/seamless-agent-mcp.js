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
const { z } = require('zod');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let port = null;
    let token = null;

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

    if (!port || isNaN(port) || !token) {
        console.error('Usage: seamless-agent-mcp --port <api-port> --token <api-token>');
        console.error('  --port  The port where the VS Code extension API is running');
        console.error('  --token Authentication token for the local API service');
        process.exit(1);
    }

    return { port, token };
}

// Make HTTP request to VS Code extension API
async function callExtensionApi(port, token, endpoint, data) {
    const url = `http://localhost:${port}${endpoint}`;

    try {
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
    } catch (error) {
        // Check if extension API is available
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            throw new Error(
                `Cannot connect to Seamless Agent extension API at port ${port}. ` +
                `Please ensure the VS Code extension is running and the API service has started.`
            );
        }
        throw error;
    }
}

async function main() {
    const { port, token } = parseArgs();

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
                const result = await callExtensionApi(port, token, '/ask_user', {
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
            description: "Present content to user for review with comments. All modes support line-by-line user comments. Modes: 'review' (approve/reject plans - default), 'summary' (session end summaries), 'progress' (task progress updates), 'walkthrough' (step-by-step guides), 'display' (diagrams/content). Content is rendered with Markdown and code highlighting. History is saved and accessible from the extension panel. Returns an object with 'status' (string) and 'comments' (array). Status values: 'approved' (user approved - consider comments if any and continue), 'recreateWithChanges' (user wants changes - apply the suggested changes from comments and submit the plan again, no need confirm with ask_user in this case), 'cancelled' (something went wrong - try again).",
            inputSchema: z.object({
                plan: z.string().describe('The detailed plan in Markdown format to present to the user for review. Use headers, bullet points, and code blocks for clarity.'),
                title: z.string().optional().describe('Optional title for the review panel. Defaults to "Review Plan".'),
                mode: z.enum(['review', 'summary', 'progress', 'walkthrough', 'display']).optional().describe('The review mode: "review" for plan approval (default), "summary" for session summaries, "progress" for task updates, "walkthrough" for step-by-step guides, "display" for viewing content.'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(port, token, '/plan_review', {
                    plan: args.plan,
                    title: args.title,
                    mode: args.mode,
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

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Log to stderr (stdout is used for MCP protocol)
    console.error(`Seamless Agent MCP server started, connecting to API at port ${port}`);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
