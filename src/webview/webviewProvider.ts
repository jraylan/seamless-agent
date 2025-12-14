import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { strings } from '../localization';

// Attachment info
export interface AttachmentInfo {
    id: string;
    name: string;
    uri: string;
    isTemporary?: boolean;  // True if this is a pasted/dropped image that should be cleaned up
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
    | { type: 'fileSearchResults'; files: FileSearchResult[] }
    | { type: 'imageSaved'; requestId: string; attachment: AttachmentInfo }
    | { type: 'clear' };

type FromWebviewMessage =
    | { type: 'submit'; response: string; requestId: string; attachments: AttachmentInfo[] }
    | { type: 'cancel'; requestId: string }
    | { type: 'selectRequest'; requestId: string }
    | { type: 'backToList' }
    | { type: 'addAttachment'; requestId: string }
    | { type: 'removeAttachment'; requestId: string; attachmentId: string }
    | { type: 'searchFiles'; query: string }
    | { type: 'saveImage'; requestId: string; data: string; mimeType: string }
    | { type: 'addFileReference'; requestId: string; file: FileSearchResult };

// File search result for autocomplete
export interface FileSearchResult {
    name: string;
    path: string;
    uri: string;
    icon: string;
}

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
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

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
            case 'searchFiles':
                this._handleSearchFiles(message.query);
                break;
            case 'saveImage':
                this._handleSaveImage(message.requestId, message.data, message.mimeType);
                break;
            case 'addFileReference':
                this._handleAddFileReference(message.requestId, message.file);
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
                    id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
     * Handle file search for autocomplete dropdown
     */
    private async _handleSearchFiles(query: string): Promise<void> {
        try {
            // Sanitize query - remove path traversal patterns and limit length
            const sanitizedQuery = this._sanitizeSearchQuery(query);

            // Fetch all workspace files first, then filter case-insensitively
            // This ensures queries like 'readme' match 'README.md'
            const allFiles = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 2000);
            const queryLower = sanitizedQuery.toLowerCase();

            const results: FileSearchResult[] = allFiles
                .map(uri => {
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    const fileName = uri.fsPath.split(/[\\/]/).pop() || 'file';
                    return {
                        name: fileName,
                        path: relativePath,
                        uri: uri.toString(),
                        icon: this._getFileIcon(fileName)
                    };
                })
                // Case-insensitive filtering on both filename and path
                // If query is empty, show all files
                .filter(file =>
                    !queryLower ||
                    file.name.toLowerCase().includes(queryLower) ||
                    file.path.toLowerCase().includes(queryLower)
                )
                .sort((a, b) => {
                    // Prioritize exact name matches (starts with query)
                    const aExact = a.name.toLowerCase().startsWith(queryLower);
                    const bExact = b.name.toLowerCase().startsWith(queryLower);
                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;

                    // Secondary: prioritize filename contains over path-only matches
                    const aNameMatch = a.name.toLowerCase().includes(queryLower);
                    const bNameMatch = b.name.toLowerCase().includes(queryLower);
                    if (aNameMatch && !bNameMatch) return -1;
                    if (!aNameMatch && bNameMatch) return 1;

                    return a.name.localeCompare(b.name);
                })
                .slice(0, 50); // Limit to 50 results

            this._view?.webview.postMessage({
                type: 'fileSearchResults',
                files: results
            });
        } catch (error) {
            console.error('File search error:', error);
            this._view?.webview.postMessage({
                type: 'fileSearchResults',
                files: []
            });
        }
    }

    /**
     * Handle adding a file reference from autocomplete selection
     */
    private _handleAddFileReference(requestId: string, file: FileSearchResult): void {
        const pending = this._pendingRequests.get(requestId);
        if (!pending || !file) return;

        // Create attachment from file reference
        const attachment: AttachmentInfo = {
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: file.name,
            uri: file.uri
        };

        // Add to pending request attachments
        pending.item.attachments.push(attachment);

        // Send updated attachments to webview
        this._view?.webview.postMessage({
            type: 'updateAttachments',
            requestId,
            attachments: pending.item.attachments
        });
    }

    /**
     * Handle saving an image from paste/drop to temp location
     */
    private async _handleSaveImage(requestId: string, dataUrl: string, mimeType: string): Promise<void> {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return;

        // Maximum allowed image size (10MB)
        const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

        try {
            // Extract base64 data from data URL
            const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
            if (!base64Match) {
                console.error('Invalid data URL format');
                vscode.window.showWarningMessage('Invalid image format: could not parse data URL');
                return;
            }

            const base64Data = base64Match[1];
            const buffer = Buffer.from(base64Data, 'base64');

            // Validate image size
            if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
                const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
                vscode.window.showWarningMessage(`Image too large (${sizeMB}MB). Maximum allowed size is 10MB.`);
                return;
            }

            // Validate MIME type is a known image type
            const validMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
            if (!validMimeTypes.includes(mimeType)) {
                vscode.window.showWarningMessage(`Unsupported image type: ${mimeType}`);
                return;
            }

            // Determine file extension from MIME type
            const extMap: Record<string, string> = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'image/bmp': '.bmp',
                'image/svg+xml': '.svg'
            };
            const ext = extMap[mimeType] || '.png';

            // Get temp directory - use workspace .seamless-agent folder or system temp
            let tempDir: string;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                tempDir = path.join(workspaceFolders[0].uri.fsPath, '.seamless-agent');
            } else {
                tempDir = path.join(require('os').tmpdir(), 'seamless-agent');
            }

            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Generate simple incremental filename: image-pasted.png, image-pasted-1.png, etc.
            let fileName: string;
            let filePath: string;
            const existingImages = pending.item.attachments.filter(a => a.isTemporary).length;

            if (existingImages === 0) {
                fileName = `image-pasted${ext}`;
            } else {
                fileName = `image-pasted-${existingImages}${ext}`;
            }
            filePath = path.join(tempDir, fileName);

            // Handle filename collision (if same name exists from previous request)
            let counter = existingImages;
            while (fs.existsSync(filePath)) {
                counter++;
                fileName = `image-pasted-${counter}${ext}`;
                filePath = path.join(tempDir, fileName);
            }

            // Write file
            fs.writeFileSync(filePath, buffer);

            // Create attachment info
            const attachment: AttachmentInfo = {
                id: `img_${Date.now()}`,
                name: fileName,
                uri: vscode.Uri.file(filePath).toString(),
                isTemporary: true  // Mark for cleanup after request resolution
            };

            // Add to pending request attachments
            pending.item.attachments.push(attachment);

            // Notify webview
            this._view?.webview.postMessage({
                type: 'imageSaved',
                requestId,
                attachment
            });

            // Also send updated attachments list
            this._view?.webview.postMessage({
                type: 'updateAttachments',
                requestId,
                attachments: pending.item.attachments
            });

        } catch (error) {
            console.error('Failed to save image:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to save pasted image: ${errorMessage}`);
        }
    }

    /**
     * Resolve a specific request and clean up
     */
    private _resolveRequest(requestId: string, result: UserResponseResult): void {
        const pending = this._pendingRequests.get(requestId);
        if (pending) {
            // Clean up temporary image files (pasted/dropped images)
            this._cleanupTempAttachments(pending.item.attachments);

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
     * Clean up temporary attachment files (pasted/dropped images)
     * Delay cleanup to allow LLM to read the files first
     */
    private _cleanupTempAttachments(attachments: AttachmentInfo[]): void {
        // Delay cleanup by 60 seconds to allow LLM adequate time to read the image data
        // This provides a safer margin than 30 seconds for larger images or slow models
        const cleanupDelay = 60000; // 60 seconds

        setTimeout(() => {
            for (const att of attachments) {
                if (att.isTemporary && att.uri) {
                    try {
                        const filePath = vscode.Uri.parse(att.uri).fsPath;
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`Cleaned up temp attachment: ${filePath}`);
                        }
                    } catch (error) {
                        console.error('Failed to cleanup temp attachment:', error);
                    }
                }
            }
        }, cleanupDelay);
    }

    /**
     * Cleanup all temp files in the .seamless-agent directory
     * Called during extension deactivation to prevent orphaned files
     */
    public cleanupAllTempFiles(): void {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const tempDir = path.join(workspaceFolders[0].uri.fsPath, '.seamless-agent');
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    for (const file of files) {
                        try {
                            const filePath = path.join(tempDir, file);
                            fs.unlinkSync(filePath);
                            console.log(`Cleaned up orphaned temp file: ${filePath}`);
                        } catch (err) {
                            console.error(`Failed to clean up ${file}:`, err);
                        }
                    }
                    // Remove the directory if empty
                    const remainingFiles = fs.readdirSync(tempDir);
                    if (remainingFiles.length === 0) {
                        fs.rmdirSync(tempDir);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup temp directory:', error);
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
            '{{daysAgo}}': strings.daysAgo,
            '{{selectFile}}': strings.selectFile,
            '{{noFilesFound}}': strings.noFilesFound,
            '{{dropImageHere}}': strings.dropImageHere
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
     * Sanitize search query to prevent potential security issues
     * Removes path traversal patterns and limits query length
     */
    private _sanitizeSearchQuery(query: string): string {
        if (!query) return '';

        // Limit query length to prevent abuse
        const maxQueryLength = 100;
        let sanitized = query.slice(0, maxQueryLength);

        // Remove path traversal patterns
        sanitized = sanitized.replace(/\.\.\//g, '');
        sanitized = sanitized.replace(/\.\.\\/g, '');
        sanitized = sanitized.replace(/\.\.$/g, '');

        // Remove null bytes and other potentially dangerous characters
        sanitized = sanitized.replace(/[\x00-\x1f]/g, '');

        return sanitized.trim();
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
