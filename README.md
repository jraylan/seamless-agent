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

### Plan Review Tool (`#planReview`)

A Language Model tool that presents Markdown content in a dedicated review panel, so you can approve it or request changes with comments anchored to specific parts of the plan.

- **Plan Review Panel** — Review the plan in a focused editor-like view
- **Targeted Feedback** — Add comments tied to specific headings/paragraphs/list items
- **Structured Output** — Returns `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }` to the agent
- **Safer Automation** — Prevents execution before you approve the approach

> Note: `#approvePlan` is supported for backwards compatibility, but `#planReview` is the recommended tool.

### Walkthrough Review Tool (`#walkthroughReview`)

A Language Model tool that presents Markdown content as a step-by-step walkthrough in a dedicated panel, so you can add comments and request revisions.

- **Walkthrough Panel** — Great for guided, sequential steps
- **Comment Support** — Add feedback anchored to specific parts of the walkthrough
- **Structured Output** — Returns `{ status, requiredRevisions: [{ revisedPart, revisorInstructions }], reviewId }`

### Task List Flow Tools

Interactive task lists visible in real-time (with a dedicated panel) so you can track progress and leave feedback while the agent is working.

- **Live Task List Panel** — Walkthrough-style UI with task status and progress
- **Task Comments** — Add comments to any task, including reopening a completed task if needed
- **History Integration** — Closed task lists appear in History

#### Recommended Task List flow

To ensure the agent receives your comments **before** executing each task, use the flow tools below:

- `#createTaskList` → creates the list and returns `listId`
- `#getNextTask` → returns the next pending task **plus pending comments for that task**
- `#updateTaskStatus` → updates task status (in-progress / completed / blocked). Then call `#getNextTask` to fetch the next task + its comments
- `#closeTaskList` → archives the list and returns a summary

### History (Requests, Plan Reviews, Task Lists)

The Seamless Agent panel includes a unified History timeline (newest first), with filters:

- **All**
- **Task Lists**
- **Ask User**
- **Plan Review**

You can open ask_user details, open plan review panels from history, open closed task lists, and delete individual items.

### Approve Plan Tool (`#approvePlan`) (Deprecated)

Backwards-compatible alias for plan review.

## Usage

Once installed, the tools are automatically available to GitHub Copilot Chat.

### Automatic Usage

Copilot will automatically use this tool when it needs your confirmation. When triggered:

1. A notification appears in VS Code
2. Click "Open Console" to open the request panel
3. Type your response
4. Copilot continues based on your input

### Reviewing a Plan with `#planReview` (tool: `plan_review`)

Copilot will use this tool when it wants your sign-off on a plan before proceeding. When triggered:

1. A “Review Plan” editor panel opens
2. Hover a heading/paragraph/list item and click the comment icon to add feedback
3. Click **Approve** to proceed, or **Request Changes** to send feedback back to the agent
4. Copilot continues based on `{ status, requiredRevisions, reviewId }`

> You can still explicitly ask for `#approvePlan`, but prefer `#planReview`.

### Reviewing a Walkthrough with `#walkthroughReview` (tool: `walkthrough_review`)

Use this when you want a step-by-step guide presented for review/feedback.

1. A walkthrough editor panel opens
2. Add comments where you want changes
3. Click **Approve** or **Request Changes**
4. Copilot continues based on `{ status, requiredRevisions, reviewId }`

### Using Task Lists (recommended flow)

At a high level, the agent should:

1. Create the list with `#createTaskList` (store `listId`)
2. Loop:
   - Call `#getNextTask`
   - Apply any returned `comments[]` **before** executing the task
   - Execute the task
   - Call `#updateTaskStatus`
3. When done, call `#closeTaskList`

## Tips

### Recommended System Prompt

To ensure the AI requests approval at the right times, add the following to your custom instructions or system prompt:

```
When the task requires multiple steps or non-trivial changes, present a detailed plan using #planReview and wait for approval before executing.
If the plan is rejected, incorporate the comments and submit an updated plan with #planReview.
When the user asks for a step-by-step guide or walkthrough, present it using #walkthroughReview.
Always use #askUser before completing any task to confirm the result matches what the user asked for.

When using task lists, prefer the flow: #createTaskList → #getNextTask → #updateTaskStatus → ... → #closeTaskList.
```

You can add this into your `.github/copilot-instructions.md` file in your project

### Quick tutorial: using `#planReview` (tool: `plan_review`)

If you want to explicitly trigger plan review from the start, ask Copilot something like:

```
Before you change anything, write a step-by-step plan and present it with #planReview.
Wait for my approval (or requested changes). Only then implement the plan.
```

## Requirements

- VS Code 1.104.1 or higher
- GitHub Copilot Chat extension

## Extension Settings

This extension works out of the box with no configuration required. You only need to instruct your agent to use it.

## MCP / Antigravity

If you're using Antigravity IDE via MCP, see [README.antigravity.md](README.antigravity.md) for integration details and troubleshooting.

## Releasing (maintainers)

This repository uses Release Please to generate changelogs and tags based on Conventional Commits.

If a single squash-merge contains multiple logical changes, you can include **multiple Conventional Commit headers** in the commit message (or PR description, depending on your repo squash settings). Release Please will parse them as separate changelog entries, e.g.:

```
fix: prevent horizontal line comment

feat: add folder attachments

refactor: reorganize webview providers
```

For squash merges, you can also override the merge commit parsing by adding this block to the PR body:

```
BEGIN_COMMIT_OVERRIDE
fix: prevent horizontal line comment
feat: add folder attachments
refactor: reorganize webview providers
END_COMMIT_OVERRIDE
```

## Known Issues

None at this time. Please report issues on [GitHub](https://github.com/jraylan/seamless-agent/issues).

## License

[MIT](LICENSE.md)
