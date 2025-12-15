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
            description: "Present a plan to the user for approval (review mode).",
            inputSchema: z.object({
                plan: z.string().describe('The detailed plan in Markdown format to present to the user for review. Use headers, bullet points, and code blocks for clarity.'),
                title: z.string().optional().describe('Optional title for the review panel. Defaults to "Review Plan".'),
                chatId: z.string().optional().describe('Optional chat ID to associate the review with a specific conversation.'),
            })
        },
        async (args) => {
            try {
                const result = await callExtensionApi(port, token, '/plan_review', {
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
                const result = await callExtensionApi(port, token, '/plan_review', {
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

    server.registerTool(
        "create_task_list",
        {
            description: "Create a new interactive task list and open it for the user.",
            inputSchema: z.object({
                title: z.string().describe('Task list title'),
                description: z.string().optional().describe('Optional description (informational)'),
                tasks: z.array(z.object({
                    title: z.string(),
                    description: z.string().optional(),
                    status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).optional()
                })).optional().describe('Initial tasks array')
            })
        },
        async (args) => {
            const result = await callExtensionApi(port, token, '/create_task_list', {
                title: String(args.title),
                description: args.description ? String(args.description) : undefined,
                tasks: Array.isArray(args.tasks) ? args.tasks.map((t) => ({
                    title: String(t.title),
                    description: t.description ? String(t.description) : undefined,
                    status: t.status
                })) : undefined
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.registerTool(
        "get_next_task",
        {
            description: "Return the next pending task (in order, prioritizing reopened tasks) plus any pending user comments for that task.",
            inputSchema: z.object({
                listId: z.string().describe('Task list id returned by create_task_list')
            })
        },
        async (args) => {
            const result = await callExtensionApi(port, token, '/get_next_task', { listId: String(args.listId) },);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.registerTool(
        "update_task_status",
        {
            description: "Update a task status (in-progress|completed|blocked).",
            inputSchema: z.object({
                listId: z.string().describe('Task list id'),
                taskId: z.string().describe('Task id to update'),
                status: z.enum(['in-progress', 'completed', 'blocked']).describe('New status for the task')
            })
        },
        async (args) => {
            const result = await callExtensionApi(port, token, '/update_task_status', {
                listId: String(args.listId),
                taskId: String(args.taskId),
                status: String(args.status)
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.registerTool(
        "close_task_list",
        {
            description: "Archive a task list and return a summary plus any remaining pending user comments.",
            inputSchema: z.object({
                listId: z.string().describe('Task list id')
            })
        }, async (args) => {
            const result = await callExtensionApi(port, token, '/close_task_list', { listId: String(args.listId) })

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.registerTool(
        "resume_task",
        {
            description: "Resume a paused task list after a breakpoint. If listId is not provided and only one task list is open, it will be used automatically. Otherwise, prompts the user to paste the task list ID.",
            inputSchema: z.object({
                listId: z.string().optional().describe('Task list id to resume. If omitted and only one list is open, it is inferred automatically.')
            })
        }, async (args) => {
            const result = await callExtensionApi(port, token, '/resume_task', { listId: args.listId ? String(args.listId) : undefined })

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result),
                    },
                ],
            };
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
