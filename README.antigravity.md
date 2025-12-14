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
- **Paste Images** — Paste images directly into the input area for context
- **References & Attachments** — Reference files in your workspace using `#filename` and attach files to your response

## Usage

Once installed, the `ask_user` tool is automatically available to your Agent.

### Automatic Usage

Copilot will automatically use this tool when it needs your confirmation. When triggered:

1. A notification appears in VS Code
2. Click "Open Console" to open the request panel
3. Type your response
4. Copilot continues based on your input

## Tips

### Recommended System Prompt

To ensure the AI always asks for your confirmation before completing tasks, add the a custom rule similar to the following:

```
# Ground rules NEVER BREAK IT, NO EXCEPTIONS
- Whenever you have a question, or a decision to make, always ask the user through the tool `mcp_ask_user `
- Never stop a task without permission from the tool `mcp_ask_user`
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
      "args": ["<extension-path>/bin/seamless-agent-mcp.js", "--port", "<port>"]
    }
  }
}
```

### Troubleshooting

- **Node.js not found**: Ensure Node.js is installed and available in your system PATH
- **Connection issues**: Use the "Restart API" button in the status bar to restart the service
- **Agent aren't using the tool**: Inside the `Agent` panel, open the `Agent Option` and click in `MCP Server. Click in the `Refresh`button and wait for a few seconds. If nothing changes, click in`Restart API` in the status bar and try again.

## Extension Settings

This extension works out of the box with no configuration required. You only need to instruct your agent to use it.

## Known Issues

None at this time. Please report issues on [GitHub](https://github.com/jraylan/seamless-agent/issues).

## Release Notes

### 0.1.9

#### Added

- **File Reference Autocomplete**: Type `#` in the response textarea to search and reference workspace files. Selected files are automatically attached and synced with your text.
- **Attachment Chips**: File attachments are now displayed as visual chips above the textarea for easy management.
- **Paste Images**: Paste images directly into the input area to attach them.
- **Attach Button**: New 📎 button to quickly add file attachments via file picker.

#### Changed

- **Inline Image Support**: Images pasted in the `ask_user` tool are now passed directly to the AI using `LanguageModelDataPart.image()` binary data, eliminating the need for a separate image viewing tool.
- **Simplified Attachments**: Attachments response format simplified to a string array of file URIs.
- **Simplified Image Naming**: Pasted images now use simple names (`image-pasted.png`, `image-pasted-1.png`) instead of long timestamps.
- **Simplified File References**: File references now use `#filename` format instead of `#file:filename`.

## 0.1.7

#### Fixed

- **Webview**: Fixed issue where the fallback prompt was opened when the Webview didn't received focus (VSCode)

### Changed

- **Documentation**: Added instruction to Antigravity users (Antigravity)

## 0.1.6

### Fixed

- **Antigravity**: Fixed Antigravity integration

## 0.1.5

### Added

- **Antigravity**: Added support to Antigravity

## 0.1.4

### Fixed

- **Badge Counter**: Fixed badge not resetting to 0 after all requests are closed (was showing "1" incorrectly)
- **Notification Behavior**: Notifications now only appear when the Seamless Agent panel is not visible, reducing interruptions when the panel is already open

## 0.1.3

- [jraylan:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/6)

### Added

- **Multiple Concurrent Requests**: Support for handling multiple requests with list view
- **Attachments**: File attachments support with VS Code Quick Pick file selector

### Changed

- **Layout**: A few updates on layout to make the request panel looks like copilot chat
- **Task List**:
  Improved task list UI with better visual hierarchy
- **Disposal**: The request will be dispose when the agent stops.
- **Panel Icon**:
  Updated panel icon to match VS Code's design language
- **Badge Counter**: Visual badge showing the number of pending requests

## 0.1.2

- [bicheichane:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/4)

### Added

- **Dedicated Panel View**:
  A new "Seamless Agent" panel is registered in the bottom panel area (alongside Terminal/Output), providing a non-intrusive workspace for agent interactions.
- **Rich Markdown Rendering**:
  Full Markdown support including: - Headers, bold, italic, strikethrough - Code blocks with **syntax highlighting** for 10 languages: - JavaScript/TypeScript - Python - C# - Java - CSS - HTML/XML - JSON - Bash/Shell - SQL - Block quotes - Ordered and unordered lists - Links (auto-linkified) - Tables
- **Multi-Line Input**:
  A proper `<textarea>` element allows users to: - Write detailed multi-paragraph responses - Paste code snippets - Use `Ctrl+Enter` to submit
- **Non-Intrusive Notifications**:
  - **Badge indicator** on the panel tab showing pending request count
  - **Information notification** as supplementary alert with "Open Console" action
  - Panel auto-reveals but preserves focus (`preserveFocus: true`)
- **Graceful Fallback**:
  If the webview panel is unavailable (e.g., not yet resolved), the tool automatically falls back to the original VS Code dialog approach.

### Changed

- Moved user confirmation UI from VS Code popup dialogs to dedicated panel
- Updated esbuild configuration to compile webview scripts separately
- Improved localization system with support for EN, PT-BR and PT variants

### Fixed

- Added `dist/` to `.gitignore` to avoid committing build artifacts

### 0.0.4

- Initial beta release
- Added `ask_user` Language Model tool
- Multi-language support (English, Portuguese)

## License

[MIT](LICENSE.md)
