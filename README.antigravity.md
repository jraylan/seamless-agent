# Seamless Agent

![English](https://img.shields.io/badge/lang-en-blue) [![Português do Brasil](https://img.shields.io/badge/lang-pt--BR-green)](README.pt-br.md) [![Português](https://img.shields.io/badge/lang-pt-green)](README.pt-pt.md)

Seamless Agent enhances GitHub Copilot by providing interactive user confirmation tools. It allows AI agents to ask for user approval before executing actions, ensuring you stay in control.

![VS Code](https://img.shields.io/badge/VS%20Code-1.106.1+-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Ask User Tool (`#askUser`)

A Language Model tool that enables Copilot to interactively prompt you for confirmation or additional input during chat sessions.

- **User Confirmation** — Get explicit approval before Copilot executes critical actions
- **Interactive Input** — Provide additional context or instructions mid-conversation
- **Task Validation** — Confirm whether a task was fulfilled your specs
- **Seamless Integration** — Works naturally within the Copilot Chat workflow

### Plan Review Tool (`plan_review`)

Present Markdown content for review (approve/request changes) in a dedicated panel.

- **Targeted Feedback** — Comments anchored to specific parts
- **Structured Output** — Returns `{ status, requiredRevisions, reviewId }`

### Walkthrough Review Tool (`walkthrough_review`)

Present Markdown content as a step-by-step walkthrough for review (approve/request changes) in a dedicated panel.

- **Comment Support** — Comments anchored to specific parts
- **Structured Output** — Returns `{ status, requiredRevisions, reviewId }`

## Usage

Once installed, the MCP tools are automatically available to your Agent (tool names may appear as `mcp_<toolName>` depending on the client):

- `ask_user`
- `plan_review`
- `walkthrough_review`

### Automatic Usage

Copilot will automatically use this tool when it needs your confirmation. When triggered:

1. A notification appears in VS Code
2. Click "Open Console" to open the request panel
3. Type your response
4. Copilot continues based on your input

## Tips

### Recommended System Prompt

To ensure the AI always asks for your confirmation before completing tasks, add a custom rule similar to the following:

```
# Ground rules NEVER BREAK IT, NO EXCEPTIONS
- Whenever you have a question, or a decision to make, always ask the user through the tool `ask_user` (or `mcp_ask_user`)
- Never stop a task without permission from the tool `ask_user` (or `mcp_ask_user`)
```

You can add this in Antigravity by opening the `Agent Option`, inside the `Agent` panel, and clicking in the option `Customizations`. Then you add a new `Rule` for general use or `Workflow` or specifics workflows.

Note that Antigravity workflow already creates `Walkthroughs` and `Planing` documents where you can refine the task. If you intent is to change this behavior you can try explicitly explain it to the agent.

## Requirements

- Antigravity 1.104.0 or higher
- **Node.js** (required for MCP server integration with Antigravity)

## Antigravity MCP Integration

Seamless Agent integrates with Antigravity IDE via the Model Context Protocol (MCP). When the extension starts, it:

1. Launches a local HTTP API service
2. Registers itself in `~/.gemini/antigravity/mcp_config.json` using a command-based configuration

### How It Works

![](./resources/flow.png)

The MCP config uses the standard command format:

```json
{
  "mcpServers": {
    "seamless-agent": {
      "command": "node",
      "args": [
        "<extension-path>/dist/seamless-agent-mcp.js",
        "--port",
        "<port>",
        "--token",
        "<token>"
      ]
    }
  }
}
```

### Troubleshooting

- **Node.js not found**: Ensure Node.js is installed and available in your system PATH
- **Connection issues**: Use the "Restart API" button in the status bar to restart the service
- **Agent isn't using the tools**: Inside the `Agent` panel, open `Agent Option` → `MCP Server`. Click `Refresh` and wait a few seconds. If nothing changes, click `Restart API` in the status bar and try again.

## Extension Settings

This extension works out of the box with no configuration required. You only need to instruct your agent to use it.

### Storage Context (`seamless-agent.storageContext`) 🔧

Determines where the tools history are stored.

- **global** — Stores history across all workspaces (shared).
- **workspace** — Stores history specific to the current workspace (default).

**Default:** `workspace`

Example (settings.json):

```json
"seamless-agent.storageContext": "global"
```

> Note: Changing this setting changes where the extension saves chat history; switching between values may make previously saved history unavailable in the current context.

## Known Issues

None at this time. Please report issues on [GitHub](https://github.com/jraylan/seamless-agent/issues).

## License

[MIT](LICENSE.md)
