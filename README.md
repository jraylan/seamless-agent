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

### Approve Plan Tool (`#approvePlan`)

A Language Model tool that presents a multi-step plan in a dedicated review panel, so you can approve it or request changes with comments anchored to specific parts of the plan.

- **Plan Review Panel** — Review the plan in a focused editor-like view
- **Targeted Feedback** — Add comments tied to specific headings/paragraphs/list items
- **Structured Output** — Returns `{ approved, comments: [{ citation, comment }] }` to the agent
- **Safer Automation** — Prevents execution before you approve the approach

## Usage

Once installed, the `ask_user` and `approve_plan` tools are automatically available to GitHub Copilot Chat.

### Automatic Usage

Copilot will automatically use this tool when it needs your confirmation. When triggered:

1. A notification appears in VS Code
2. Click "Open Console" to open the request panel
3. Type your response
4. Copilot continues based on your input

### Reviewing a Plan with `approve_plan`

Copilot will use this tool when it wants your sign-off on a plan before proceeding. When triggered:

1. A “Review Plan” editor panel opens
2. Hover a heading/paragraph/list item and click the comment icon to add feedback
3. Click **Approve** to proceed, or **Request Changes** to send feedback back to the agent
4. Copilot continues based on `{ approved, comments }`

## Tips

### Recommended System Prompt

To ensure the AI requests approval at the right times, add the following to your custom instructions or system prompt:

```
When the task requires multiple steps or non-trivial changes, present a detailed plan using #approvePlan and wait for approval before executing.
If the plan is rejected, incorporate the comments and submit an updated plan with #approvePlan.
Always use #askUser before completing any task to confirm the result matches what the user asked for.
```

You can add this into your `.github/copilot-instructions.md` file in your project

### Quick tutorial: using `approve_plan`

If you want to explicitly trigger plan review from the start, ask Copilot something like:

```
Before you change anything, write a step-by-step plan and present it with #approvePlan.
Wait for my approval (or requested changes). Only then implement the plan.
```

## Requirements

- VS Code 1.104.1 or higher
- GitHub Copilot Chat extension

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

### 0.1.8

#### Added

- **Approve Plan Tool**: Added `approve_plan` (`#approvePlan`) to let users review/approve plans with inline comments before execution (VSCode)

### 0.1.7

#### Fixed

- **Webview**: Fixed issue where the fallback prompt was opened when the Webview didn't received focus (VSCode)

#### Changed

- **Documentation**: Added instruction to Antigravity users (Antigravity)

### 0.1.6

#### Fixed

- **Antigravity**: Fixed Antigravity integration

### 0.1.5

#### Added

- **Antigravity**: Added support to Antigravity

### 0.1.4

#### Fixed

- **Badge Counter**: Fixed badge not resetting to 0 after all requests are closed (was showing "1" incorrectly)
- **Notification Behavior**: Notifications now only appear when the Seamless Agent panel is not visible, reducing interruptions when the panel is already open

## 0.1.3

- [jraylan:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/6)

#### Added

- **Multiple Concurrent Requests**: Support for handling multiple requests with list view
- **Attachments**: File attachments support with VS Code Quick Pick file selector

#### Changed

- **Layout**: A few updates on layout to make the request panel looks like copilot chat
- **Task List**:
  Improved task list UI with better visual hierarchy
- **Disposal**: The request will be dispose when the agent stops.
- **Panel Icon**:
  Updated panel icon to match VS Code's design language
- **Badge Counter**: Visual badge showing the number of pending requests

### 0.1.2

- [bicheichane:feature/dedicated-view-panel](https://github.com/jraylan/seamless-agent/pull/4)

#### Added

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

#### Changed

- Moved user confirmation UI from VS Code popup dialogs to dedicated panel
- Updated esbuild configuration to compile webview scripts separately
- Improved localization system with support for EN, PT-BR and PT variants

#### Fixed

- Added `dist/` to `.gitignore` to avoid committing build artifacts

### 0.0.4

- Initial beta release
- Added `ask_user` Language Model tool
- Multi-language support (English, Portuguese)

## License

[MIT](LICENSE.md)
