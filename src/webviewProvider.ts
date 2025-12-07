import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { strings } from './localization';

// Attachment info
export interface AttachmentInfo {
    id: string;
    name: string;
    uri: string;
}

// Request item for the list
export interface RequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    attachments: AttachmentInfo[];
}

// Message types for communication between Extension Host and Webview
type ToWebviewMessage =
    | { type: 'showQuestion'; question: string; title: string; requestId: string }
    | { type: 'showList'; requests: RequestItem[] }
    | { type: 'updateAttachments'; requestId: string; attachments: AttachmentInfo[] }
    | { type: 'clear' };

type FromWebviewMessage =
    | { type: 'submit'; response: string; requestId: string; attachments: AttachmentInfo[] }
    | { type: 'cancel'; requestId: string }
    | { type: 'selectRequest'; requestId: string }
    | { type: 'backToList' }
    | { type: 'addAttachment'; requestId: string }
    | { type: 'removeAttachment'; requestId: string; attachmentId: string };

// Result type for user responses
export interface UserResponseResult {
    responded: boolean;
    response: string;
    attachments: AttachmentInfo[];
}

export class AgentInteractionProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'seamlessAgentView';

    private _view?: vscode.WebviewView;

    // Multiple pending requests
    private _pendingRequests: Map<string, {
        item: RequestItem;
        resolve: (result: UserResponseResult) => void;
    }> = new Map();

    // Currently selected request
    private _selectedRequestId: string | null = null;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
            ]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            (message: FromWebviewMessage) => {
                this._handleWebviewMessage(message);
            },
            undefined,
            []
        );

        // Restore pending requests view if there are any
        // This ensures that if the webview is closed and reopened, the requests still appear
        if (this._pendingRequests.size > 0) {
            if (this._pendingRequests.size === 1 && this._selectedRequestId) {
                // Show the single selected question
                const pending = this._pendingRequests.get(this._selectedRequestId);
                if (pending) {
                    this._showQuestion(pending.item);
                }
            } else {
                // Show the list of pending requests
                this._showList();
            }
            // Update badge count
            this._setBadge(this._pendingRequests.size);
        }
    }

    /**
     * Wait for a user response to a question.
     * Supports multiple concurrent requests.
     */
    public async waitForUserResponse(question: string, title?: string): Promise<UserResponseResult> {
        // If the view isn't available, try to open it
        if (!this._view) {
            try {
                // Focus the view to trigger resolution
                await vscode.commands.executeCommand('seamlessAgentView.focus');

                // Wait a bit for the view to initialize
                await new Promise(resolve => setTimeout(resolve, 500));

                // If still not available after focusing, return error
                if (!this._view) {
                    return { responded: false, response: 'Agent Console view is not available.', attachments: [] };
                }
            } catch (error) {
                return { responded: false, response: 'Agent Console view is not available.', attachments: [] };
            }
        }

        // Generate unique ID for this request
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return new Promise<UserResponseResult>((resolve) => {
            const item: RequestItem = {
                id: requestId,
                question,
                title: title || strings.confirmationRequired,
                createdAt: Date.now(),
                attachments: []
            };

            this._pendingRequests.set(requestId, { item, resolve });

            // Update badge count
            this._setBadge(this._pendingRequests.size);

            // If this is the first/only request, show it directly
            if (this._pendingRequests.size === 1) {
                this._selectedRequestId = requestId;
                this._showQuestion(item);
            } else {
                // Show list view
                this._showList();
            }

            // Reveal the panel to get user's attention
            // Disable automatic reveal to avoid disrupting user
            // this._view?.show(true);

            // Show notification only if panel is not already visible
            if (!this._view?.visible) {
                this._showNotification();
            }
        });
    }

    /**
     * Cancel a specific request by ID.
     * This is useful when the agent stops or the request is no longer needed.
     */
    public cancelRequest(requestId: string, reason: string = 'Request cancelled'): boolean {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return false;

        pending.resolve({ responded: false, response: reason, attachments: [] });
        this._pendingRequests.delete(requestId);
        this._setBadge(this._pendingRequests.size);

        // Update UI
        if (this._pendingRequests.size > 0) {
            this._showList();
        } else {
            this._view?.webview.postMessage({ type: 'clear' });
            this._selectedRequestId = null;
        }

        return true;
    }

    /**
     * Cancel all pending requests.
     * This is useful when the extension is deactivated or the agent session ends.
     */
    public cancelAllRequests(reason: string = 'All requests cancelled'): void {
        for (const [id, pending] of this._pendingRequests) {
            pending.resolve({ responded: false, response: reason, attachments: [] });
        }
        this._pendingRequests.clear();
        this._setBadge(0);
        this._view?.webview.postMessage({ type: 'clear' });
        this._selectedRequestId = null;
    }

    /**
     * Get all pending request items (for external use like stream.reference)
     */
    public getPendingRequests(): RequestItem[] {
        return Array.from(this._pendingRequests.values()).map(p => p.item);
    }

    /**
     * Send a question to the webview for display
     */
    private _showQuestion(item: RequestItem): void {
        const message: ToWebviewMessage = {
            type: 'showQuestion',
            question: item.question,
            title: item.title,
            requestId: item.id
        };
        this._view?.webview.postMessage(message);
    }

    /**
     * Show the list of all pending requests
     */
    private _showList(): void {
        const requests = Array.from(this._pendingRequests.values()).map(p => p.item);
        const message: ToWebviewMessage = { type: 'showList', requests };
        this._view?.webview.postMessage(message);
    }

    /**
     * Clear the current question from the webview
     */
    public clear(): void {
        const message: ToWebviewMessage = { type: 'clear' };
        this._view?.webview.postMessage(message);
    }

    /**
     * Handle messages received from the webview
     */
    private _handleWebviewMessage(message: FromWebviewMessage): void {
        switch (message.type) {
            case 'submit':
                this._resolveRequest(message.requestId, {
                    responded: true,
                    response: message.response,
                    attachments: message.attachments || []
                });
                break;
            case 'cancel':
                this._resolveRequest(message.requestId, {
                    responded: false,
                    response: '',
                    attachments: []
                });
                break;
            case 'selectRequest':
                this._selectedRequestId = message.requestId;
                const pending = this._pendingRequests.get(message.requestId);
                if (pending) {
                    this._showQuestion(pending.item);
                }
                break;
            case 'backToList':
                this._selectedRequestId = null;
                this._showList();
                break;
            case 'addAttachment':
                this._handleAddAttachment(message.requestId);
                break;
            case 'removeAttachment':
                this._handleRemoveAttachment(message.requestId, message.attachmentId);
                break;
        }
    }

    /**
     * Handle adding an attachment via VS Code's file picker (Quick Pick)
     */
    private async _handleAddAttachment(requestId: string): Promise<void> {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return;

        // Find all files in the workspace
        const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 1000);

        if (files.length === 0) {
            vscode.window.showInformationMessage('No files found in workspace');
            return;
        }

        // Create quick pick items with file icons
        const items: (vscode.QuickPickItem & { uri: vscode.Uri })[] = files.map(uri => {
            const relativePath = vscode.workspace.asRelativePath(uri);
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'file';
            return {
                label: `$(${this._getFileIcon(fileName)}) ${fileName}`,
                description: relativePath,
                uri: uri
            };
        }).sort((a, b) => a.label.localeCompare(b.label));

        // Show quick pick with multi-select
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: strings.addAttachment,
            matchOnDescription: true
        });

        if (selected && selected.length > 0) {
            for (const item of selected) {
                const uri = item.uri;
                // Extract clean file name (remove icon prefix)
                const labelMatch = item.label.match(/\$\([^)]+\)\s*(.+)/);
                const cleanName = labelMatch ? labelMatch[1] : item.label;
                const attachment: AttachmentInfo = {
                    id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: cleanName,
                    uri: uri.toString()
                };
                pending.item.attachments.push(attachment);
            }

            // Update webview with new attachments
            this._view?.webview.postMessage({
                type: 'updateAttachments',
                requestId,
                attachments: pending.item.attachments
            });
        }
    }

    /**
     * Handle removing an attachment
     */
    private _handleRemoveAttachment(requestId: string, attachmentId: string): void {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return;

        pending.item.attachments = pending.item.attachments.filter(a => a.id !== attachmentId);

        // Update webview with updated attachments
        this._view?.webview.postMessage({
            type: 'updateAttachments',
            requestId,
            attachments: pending.item.attachments
        });
    }

    /**
     * Resolve a specific request and clean up
     */
    private _resolveRequest(requestId: string, result: UserResponseResult): void {
        const pending = this._pendingRequests.get(requestId);
        if (pending) {
            pending.resolve(result);
            this._pendingRequests.delete(requestId);

            // Update badge
            this._setBadge(this._pendingRequests.size);

            // If there are still pending requests, show the list
            if (this._pendingRequests.size > 0) {
                this._showList();
            } else {
                this.clear();
            }
        }
    }

    /**
     * Set the badge count on the view
     */
    private _setBadge(count: number): void {
        if (this._view) {
            if (count === 0) {
                // Workaround for VS Code API: set to 0 first, then undefined
                // This ensures the badge properly clears in the UI
                this._view.badge = { value: 0, tooltip: '' };
                setTimeout(() => {
                    if (this._view && this._pendingRequests.size === 0) {
                        this._view.badge = undefined;
                    }
                }, 100);
            } else {
                this._view.badge = { value: count, tooltip: strings.inputRequired };
            }
        }
    }    /**
     * Show a notification to alert the user of a pending request
     */
    private _showNotification(): void {
        vscode.window.showInformationMessage(
            strings.agentRequiresInput,
            strings.openConsole
        ).then(selection => {
            if (selection === strings.openConsole) {
                vscode.commands.executeCommand('seamlessAgentView.focus');
            }
        });
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        // Get URIs for resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );
        const highlightStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );

        // Generate nonce for CSP
        const nonce = this._getNonce();

        // Read template file
        const templatePath = path.join(this._extensionUri.fsPath, 'media', 'webview.html');
        let template = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        const replacements: Record<string, string> = {
            '{{cspSource}}': webview.cspSource,
            '{{nonce}}': nonce,
            '{{styleUri}}': styleUri.toString(),
            '{{highlightStyleUri}}': highlightStyleUri.toString(),
            '{{codiconsUri}}': codiconsUri.toString(),
            '{{scriptUri}}': scriptUri.toString(),
            '{{consoleTitle}}': strings.consoleTitle,
            '{{back}}': strings.back,
            '{{noPendingRequests}}': strings.noPendingRequests,
            '{{pendingRequests}}': strings.pendingRequests,
            '{{yourResponse}}': strings.yourResponse,
            '{{inputPlaceholder}}': strings.inputPlaceholder,
            '{{attachments}}': strings.attachments,
            '{{noAttachments}}': strings.noAttachments,
            '{{addAttachment}}': strings.addAttachment,
            '{{submit}}': strings.submit,
            '{{cancel}}': strings.cancel,
            '{{remove}}': strings.remove,
            '{{justNow}}': strings.justNow,
            '{{minutesAgo}}': strings.minutesAgo,
            '{{hoursAgo}}': strings.hoursAgo,
            '{{daysAgo}}': strings.daysAgo
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.split(placeholder).join(value);
        }

        return template;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Get icon name for a file based on its extension (for Quick Pick labels)
     */
    private _getFileIcon(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const iconMap: Record<string, string> = {
            // TypeScript/JavaScript
            'ts': 'symbol-file',
            'tsx': 'symbol-file',
            'js': 'symbol-file',
            'jsx': 'symbol-file',
            'mjs': 'symbol-file',
            'cjs': 'symbol-file',
            // Python
            'py': 'symbol-file',
            // Web
            'html': 'code',
            'htm': 'code',
            'css': 'symbol-color',
            'scss': 'symbol-color',
            'sass': 'symbol-color',
            'less': 'symbol-color',
            // Data
            'json': 'json',
            'yaml': 'symbol-namespace',
            'yml': 'symbol-namespace',
            'xml': 'code',
            // Config
            'env': 'gear',
            'config': 'gear',
            // Docs
            'md': 'markdown',
            'mdx': 'markdown',
            'txt': 'file',
            // Images
            'png': 'file-media',
            'jpg': 'file-media',
            'jpeg': 'file-media',
            'gif': 'file-media',
            'svg': 'file-media',
            'ico': 'file-media',
            'webp': 'file-media',
            // Other languages
            'java': 'symbol-file',
            'c': 'symbol-file',
            'cpp': 'symbol-file',
            'cs': 'symbol-file',
            'go': 'symbol-file',
            'rs': 'symbol-file',
            'rb': 'symbol-file',
            'php': 'symbol-file',
            // Shell
            'sh': 'terminal',
            'bash': 'terminal',
            'ps1': 'terminal',
            'bat': 'terminal',
            'cmd': 'terminal',
            // Archives
            'zip': 'file-zip',
            'tar': 'file-zip',
            'gz': 'file-zip',
        };
        return iconMap[ext] || 'file';
    }
}
