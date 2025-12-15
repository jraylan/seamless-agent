import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TaskListStorage } from '../storage/taskListStorage';
import type { TaskListSession, TaskItem, TaskComment, TaskListPanelToWebviewMessage as ToWebviewMessage, TaskListPanelFromWebviewMessage as FromWebviewMessage } from './types';
import { strings } from '../localization';

/**
 * Webview Panel for displaying a task list
 * Non-blocking - updates are pushed in real-time
 * Users can add comments that will be returned to the LLM on next call
 */
export class TaskListPanel {
    public static readonly viewType = 'seamlessAgent.taskList';

    // Map of listId to panel instance
    private static _panels: Map<string, TaskListPanel> = new Map();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _listId: string;
    private readonly _storage: TaskListStorage;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        listId: string,
        storage: TaskListStorage
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._listId = listId;
        this._storage = storage;

        // Set panel HTML
        this._panel.webview.html = this._getHtmlContent();

        // Listen for panel disposal
        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            (message: FromWebviewMessage) => this._handleMessage(message),
            null,
            this._disposables
        );

        // Send initial content after a short delay to ensure webview is ready
        setTimeout(() => {
            this._sendCurrentState();
        }, 100);
    }

    /**
     * Open or reveal a task list panel
     */
    public static open(
        extensionUri: vscode.Uri,
        listId: string,
        storage: TaskListStorage
    ): TaskListPanel {
        const existingPanel = TaskListPanel._panels.get(listId);

        if (existingPanel) {
            existingPanel._panel.reveal();
            existingPanel._sendCurrentState();
            return existingPanel;
        }

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const session = storage.getSession(listId);
        const title = session?.title || strings.taskLists;

        const panel = vscode.window.createWebviewPanel(
            TaskListPanel.viewType,
            title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
                ]
            }
        );

        const taskListPanel = new TaskListPanel(panel, extensionUri, listId, storage);
        TaskListPanel._panels.set(listId, taskListPanel);

        panel.onDidDispose(() => {
            TaskListPanel._panels.delete(listId);
        });

        return taskListPanel;
    }

    /**
     * Get a panel by list ID
     */
    public static getPanel(listId: string): TaskListPanel | undefined {
        return TaskListPanel._panels.get(listId);
    }

    /**
     * Update panel if open
     */
    public static updateIfOpen(listId: string): void {
        const panel = TaskListPanel._panels.get(listId);
        if (panel) {
            panel._sendCurrentState();
        }
    }

    /**
     * Close panel if open
     */
    public static closeIfOpen(listId: string): void {
        const panel = TaskListPanel._panels.get(listId);
        if (panel) {
            panel._panel.webview.postMessage({ type: 'listClosed' } as ToWebviewMessage);
            panel._panel.dispose();
        }
    }

    /**
     * Send current state to webview
     */
    private _sendCurrentState(): void {
        const session = this._storage.getSession(this._listId);
        if (!session) {
            return;
        }

        this._panel.webview.postMessage({
            type: 'showTaskList',
            listId: session.id,
            title: session.title,
            tasks: session.tasks,
            closed: session.closed
        } as ToWebviewMessage);
    }

    /**
     * Handle messages from webview
     */
    private _handleMessage(message: FromWebviewMessage): void {
        switch (message.type) {
            case 'addComment':
                this._storage.addComment(
                    this._listId,
                    message.taskId,
                    message.revisedPart,
                    message.revisorInstructions,
                    message.reopened
                );
                this._sendCurrentState();
                break;

            case 'removeComment':
                this._storage.removeComment(
                    this._listId,
                    message.taskId,
                    message.commentId
                );
                this._sendCurrentState();
                break;

            case 'close':
                this._panel.dispose();
                break;
        }
    }

    /**
     * Dispose the panel
     */
    private _dispose(): void {
        TaskListPanel._panels.delete(this._listId);

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Get HTML content for the panel
     */
    private _getHtmlContent(): string {
        const webview = this._panel.webview;

        const session = this._storage.getSession(this._listId);
        const initialTitle = session?.title || strings.taskLists;

        // Get URIs for resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'taskList.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'taskList.js')
        );

        // Generate nonce for CSP
        const nonce = this._getNonce();

        // Read template file
        const templatePath = path.join(this._extensionUri.fsPath, 'media', 'taskList.html');
        let template: string;

        try {
            template = fs.readFileSync(templatePath, 'utf8');
        } catch {
            // Fallback inline HTML if template doesn't exist
            template = this._getInlineHtml(webview, nonce, styleUri, codiconsUri, scriptUri);
            return template;
        }

        // Replace placeholders
        const replacements: Record<string, string> = {
            '{{cspSource}}': webview.cspSource,
            '{{nonce}}': nonce,
            '{{styleUri}}': styleUri.toString(),
            '{{codiconsUri}}': codiconsUri.toString(),
            '{{scriptUri}}': scriptUri.toString(),
            // i18n strings
            '{{taskListTitle}}': initialTitle,
            '{{taskListArchived}}': strings.taskListArchived,
            '{{taskListTasksCompleted}}': strings.taskListTasksCompleted,
            '{{taskListNoTasks}}': strings.taskListNoTasks,
            '{{taskListAddComment}}': strings.taskListAddComment,
            '{{taskListComments}}': strings.taskListComments,
            '{{taskListSent}}': strings.taskListSent,
            '{{taskListPending}}': strings.taskListPending,
            '{{taskListRemoveComment}}': strings.taskListRemoveComment,
            '{{taskListSubmit}}': strings.taskListSubmit,
            '{{taskListReopenTask}}': strings.taskListReopenTask,
            '{{taskListCommentPlaceholder}}': strings.taskListCommentPlaceholder,
            '{{cancel}}': strings.cancel
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.split(placeholder).join(value);
        }

        return template;
    }

    /**
     * Inline HTML fallback
     */
    private _getInlineHtml(
        webview: vscode.Webview,
        nonce: string,
        styleUri: vscode.Uri,
        codiconsUri: vscode.Uri,
        scriptUri: vscode.Uri
    ): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <link href="${codiconsUri}" rel="stylesheet">
    <title>Task List</title>
</head>
<body>
    <div class="task-list-container">
        <div class="header">
            <h1 id="list-title">Task List</h1>
            <span id="closed-badge" class="badge closed-badge hidden">
                <span class="codicon codicon-archive"></span>
                Closed
            </span>
        </div>
        <div class="tasks-container" id="tasks-container">
            <!-- Tasks will be rendered here -->
        </div>
        
        <!-- Comment dialog -->
        <div id="comment-dialog" class="dialog-overlay hidden">
            <div class="dialog">
                <div class="dialog-header">
                    <h3>Add Comment</h3>
                    <button id="dialog-close" class="btn-icon" title="Close">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
                <div class="dialog-content">
                    <div class="task-preview" id="task-preview"></div>
                    <input type="text" id="revised-part-input" class="input" placeholder="Part of task to revise...">
                    <textarea id="comment-input" class="comment-textarea" placeholder="Your instructions..." rows="4"></textarea>
                </div>
                <div class="dialog-actions">
                    <button id="dialog-save" class="btn btn-primary">Save</button>
                    <button id="dialog-cancel" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate nonce for CSP
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
