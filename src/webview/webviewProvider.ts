import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { strings, localize } from '../localization';

import {
    ToolCallInteraction,
    createInteraction
} from './sessionHistory';

import { getExcludePattern } from '../config/ignorePaths';
import { ChatHistoryStorage, getChatHistoryStorage } from '../storage/chatHistoryStorage';

import {
    AttachmentInfo,
    RequestItem,
    ToWebviewMessage,
    FromWebviewMessage,
    FileSearchResult,
    UserResponseResult,
    AskUserOptions,
} from "./types";
import { truncate } from './utils';


export class AgentInteractionProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'seamlessAgentView';

    private _view?: vscode.WebviewView;

    // Multiple pending requests
    private _pendingRequests: Map<string,
        {
            item: RequestItem;
            resolve: (result: UserResponseResult) => void;
        }

    > = new Map();

    // Currently selected request
    private _selectedRequestId: string | null = null;

    // Interaction history
    private _recentInteractions: ToolCallInteraction[] = [];

    // Chat history storage for plan reviews
    private _chatHistoryStorage: ChatHistoryStorage;

    constructor(private readonly _context: vscode.ExtensionContext) {
        // Use the singleton instance that was initialized in extension.ts
        this._chatHistoryStorage = getChatHistoryStorage();
        //this.loadSessionsFromDisk()
    }

    /**
     * Get the chat history storage instance
     */
    public getChatHistoryStorage(): ChatHistoryStorage {
        return this._chatHistoryStorage;
    }

    private get _extensionUri(): vscode.Uri {
        return this._context.extensionUri;
    }

    /**
     * Get all recent interactions
     */
    public getRecentSessions(): ToolCallInteraction[] {
        return [...this._recentInteractions];
    }

    /**
     * Clear all interaction history (both legacy and storage)
     */
    public clearHistory(): void {
        // Clear all chats and interactions from storage
        this._chatHistoryStorage.clearAll();

        this._showHome();
    }

    resolveWebviewView(webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken,
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media'),
            vscode.Uri.joinPath(this._extensionUri, 'dist'),
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message: FromWebviewMessage) => {
            void this._handleWebviewMessage(message);
        }, undefined, []);

        // Always show home view first (which includes pending requests and recent sessions)
        this._showHome();

        // Update badge count
        if (this._pendingRequests.size > 0) {
            this._setBadge(this._pendingRequests.size);
        }
    }

    /**
     * Wait for a user response to a question.
     * Supports multiple concurrent requests.
     */
    public async waitForUserResponse(question: string, title?: string, agentName?: string, requestId?: string, options?: AskUserOptions): Promise<UserResponseResult> {

        // If the view isn't available, try to open it
        if (!this._view) {
            try {
                // Focus the view to trigger resolution
                await vscode.commands.executeCommand('seamlessAgentView.focus');

                // Wait a bit for the view to initialize
                await new Promise(resolve => setTimeout(resolve, 500));

                // If still not available after focusing, return error
                if (!this._view) {
                    return {
                        responded: false, response: 'Agent Console view is not available.', attachments: []
                    };
                }
            }

            catch (error) {
                return {
                    responded: false, response: 'Agent Console view is not available.', attachments: []
                };
            }
        }

        // Generate unique ID for this request
        const req = requestId ?? `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        console.log(req)

        return new Promise<UserResponseResult>((resolve) => {
            const item: RequestItem = {
                id: req,
                question,
                title: title || strings.confirmationRequired,
                createdAt: Date.now(),
                attachments: [],
                agentName,
                options,
            };

            this._pendingRequests.set(req, { item, resolve });

            // Update badge count
            this._setBadge(this._pendingRequests.size);

            // If this is the first/only request, show it directly
            if (this._pendingRequests.size === 1) {
                this._selectedRequestId = req;
                this._showQuestion(item);
            }

            else {
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
    public cancelRequest(requestId: string, reason: string = strings.cancelled): boolean {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return false;

        pending.resolve({
            responded: false, response: reason, attachments: []
        });
        this._pendingRequests.delete(requestId);
        this._setBadge(this._pendingRequests.size);

        // Update UI
        if (this._pendingRequests.size > 0) {
            this._showList();
        }

        else {
            this._view?.webview.postMessage({
                type: 'clear'
            });
            this._selectedRequestId = null;
        }

        return true;
    }

    /**
     * Cancel all pending requests.
     * This is useful when the extension is deactivated or the agent session ends.
     */
    public cancelAllRequests(reason: string = strings.cancelled): void {
        for (const [id, pending] of this._pendingRequests) {
            pending.resolve({
                responded: false, response: reason, attachments: []
            });
        }

        this._pendingRequests.clear();
        this._setBadge(0);

        this._view?.webview.postMessage({
            type: 'clear'
        });
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
            requestId: item.id,
            options: item.options
        };
        this._view?.webview.postMessage(message);
    }

    /**
     * Show the list of all pending requests
     */
    private _showList(): void {
        const requests = Array.from(this._pendingRequests.values()).map(p => p.item);

        const message: ToWebviewMessage = {
            type: 'showList', requests
        };
        this._view?.webview.postMessage(message);
    }

    /**
     * Show the home view with pending requests and recent interactions
     */
    private _showHome(): void {
        const pendingRequests = Array.from(this._pendingRequests.values()).map(p => p.item);
        const pendingPlanReviews = this._chatHistoryStorage.getPendingPlanReviews();
        const historyInteractions = this._chatHistoryStorage.getCompletedInteractions();

        console.log('[Seamless Agent] _showHome called:', {
            pendingRequestsCount: pendingRequests.length,
            pendingPlanReviewsCount: pendingPlanReviews.length,
            historyInteractionsCount: historyInteractions.length,
            pendingPlanReviews: pendingPlanReviews.map(r => ({ id: r.id, title: r.title, status: r.status }))
        });

        const message: ToWebviewMessage = {
            type: 'showHome',
            pendingRequests,
            pendingPlanReviews,
            historyInteractions,
            recentInteractions: this._recentInteractions
        };
        this._view?.webview.postMessage(message);

        // Update badge with total pending count (requests + plan reviews)
        const totalPending = pendingRequests.length + pendingPlanReviews.length;
        this._setBadge(totalPending);
    }

    /**
     * Public method to refresh the home view (called from commands)
     */
    public refreshHome(): void {
        this._showHome();
    }

    /**
     * Public method to switch tabs in the webview (called from commands)
     */
    public switchTab(tab: 'pending' | 'history'): void {
        const message: ToWebviewMessage = {
            type: 'switchTab',
            tab
        };
        this._view?.webview.postMessage(message);
    }

    /**
     * Clear the current question from the webview
     */
    public clear(): void {
        const message: ToWebviewMessage = {
            type: 'clear'
        };
        this._view?.webview.postMessage(message);
    }

    /**
     * Handle messages received from the webview
     */
    private async _handleWebviewMessage(message: FromWebviewMessage): Promise<void> {
        switch (message.type) {
            case 'submit': this._resolveRequest(message.requestId, {
                responded: true,
                response: message.response,
                attachments: message.attachments || []
            }, message.selectedOptions);
                break;

            case 'cancel': this._resolveRequest(message.requestId, {
                responded: false,
                response: '',
                attachments: []
            });
                break;
            case 'selectRequest': this._selectedRequestId = message.requestId;
                const pending = this._pendingRequests.get(message.requestId);

                if (pending) {
                    this._showQuestion(pending.item);
                }

                break;
            case 'backToList': this._selectedRequestId = null;
                this._showList();
                break;
            case 'backToHome': this._selectedRequestId = null;
                this._showHome();
                break;
            case 'clearHistory': {
                const result = await vscode.window.showWarningMessage(
                    strings.confirmClearHistory,
                    { modal: true },
                    strings.confirm
                );
                if (result === strings.confirm) {
                    this.clearHistory();
                }
                break;
            }
            case 'addAttachment': this._handleAddAttachment(message.requestId);
                break;
            case 'addFolderAttachment': this._handleAddFolderAttachment(message.requestId);
                break;
            case 'removeAttachment': this._handleRemoveAttachment(message.requestId, message.attachmentId);
                break;
            case 'searchFiles': this._handleSearchFiles(message.query);
                break;
            case 'saveImage': this._handleSaveImage(message.requestId, message.data, message.mimeType);
                break;
            case 'addFileReference': this._handleAddFileReference(message.requestId, message.file);
                break;
            case 'clearChatHistory': this._handleClearChatHistory();
                break;
            case 'selectPlanReview': this._handleSelectInteraction(message.interactionId);
                break;
            case 'selectInteraction': this._handleSelectInteraction(message.interactionId);
                break;
            case 'openPlanReviewPanel': this._handleOpenPlanReviewPanel(message.interactionId);
                break;
            case 'deleteInteraction': this._handleDeleteInteraction(message.interactionId);
                break;
            case 'deleteMultipleInteractions': this._handleDeleteMultipleInteractions(message.interactionIds);
                break;
            case 'cancelPendingRequest': {
                this.cancelPendingRequest(message.requestId);
                break;
            }
        }
    }


    private getPendingInteraction(requestId: string) {
        return this._pendingRequests.get(requestId)?.item || this._chatHistoryStorage.getPendingInteraction(requestId);
    }

    private cancelPendingRequest(requestId: string) {
        const interaction = this.getPendingInteraction(requestId);
        if (!interaction) {
            vscode.window.showWarningMessage(strings.noSuchInteraction);
            return;
        }

        const title = truncate(interaction.title ?? interaction.question ?? requestId, 80);

        vscode.window.showWarningMessage(
            strings.confirmCancelPending.replace('{0}', title),
            { modal: true },
            strings.close
        ).then(async (result) => {
            try {
                if (result !== strings.close) {
                    return;
                }
                const canceled = this.cancelRequest(requestId);
                if (!canceled) {
                    await this.cancelReview(requestId);
                }
            } finally {
                this._showHome();
            }
        });
    }

    private async cancelReview(panelId: string): Promise<boolean> {
        const { PlanReviewPanel } = await import('./planReviewPanel');
        const closed = PlanReviewPanel.closeIfOpen(panelId);
        if (!closed) {
            this._chatHistoryStorage.updateInteraction(panelId, { status: 'cancelled' });
        }
        return closed;
    }

    /**
     * Handle adding an attachment via VS Code's file picker (Quick Pick)
     */
    private async _handleAddAttachment(requestId: string): Promise<void> {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return;

        // Find all files in the workspace, excluding configured ignore patterns
        const excludePattern = getExcludePattern();
        const files = await vscode.workspace.findFiles('**/*', excludePattern || undefined, 1000);

        if (files.length === 0) {
            vscode.window.showInformationMessage(strings.attachmentNoFilesFound);
            return;
        }

        // Create quick pick items with file icons
        const items: (vscode.QuickPickItem & {
            uri: vscode.Uri
        }

        )[] = files.map(uri => {
            const relativePath = vscode.workspace.asRelativePath(uri);
            const fileName = uri.fsPath.split(/[\\/]/).pop() || 'file';

            const posixPath = relativePath.replace(/\\/g, '/');
            const posixDir = path.posix.dirname(posixPath);
            const folderDisplay = posixDir === '.' ? '' : posixDir.replace(/\//g, '\\');

            return {
                label: fileName,
                description: folderDisplay,
                detail: relativePath,
                // Using the file URI lets VS Code render the icon in the left column (similar to Quick Open)
                iconPath: uri,
                uri: uri
            };
        }

        ).sort((a, b) => a.label.localeCompare(b.label) || (a.description || '').localeCompare(b.description || ''));

        // Show quick pick with multi-select
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: strings.addAttachment,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected && selected.length > 0) {
            for (const item of selected) {
                const uri = item.uri;
                const cleanName = item.label;

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
     * Handle adding a folder attachment via VS Code's folder picker
     */
    private async _handleAddFolderAttachment(requestId: string): Promise<void> {
        const pending = this._pendingRequests.get(requestId);
        if (!pending) return;

        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showInformationMessage('No workspace folder found');
            return;
        }

        // Find all folders in the workspace
        const folderItems: (vscode.QuickPickItem & {
            uri: vscode.Uri
        }

        )[] = [];

        // Add workspace root folders
        for (const folder of workspaceFolders) {
            folderItems.push({
                label: folder.name,
                description: folder.uri.fsPath,
                iconPath: folder.uri,
                uri: folder.uri
            });
        }

        // Find subdirectories
        try {

            const excludePattern = getExcludePattern();
            const allFiles = await vscode.workspace.findFiles('**/*', excludePattern || undefined, 5000);
            const seenDirs = new Set<string>();

            for (const fileUri of allFiles) {
                const dirPath = path.dirname(fileUri.fsPath);

                if (!seenDirs.has(dirPath)) {
                    seenDirs.add(dirPath);
                    const relativePath = vscode.workspace.asRelativePath(dirPath);
                    const folderName = path.basename(dirPath);

                    // Skip root workspace folders (already added)
                    const isWorkspaceRoot = workspaceFolders.some(wf => wf.uri.fsPath === dirPath);

                    if (!isWorkspaceRoot) {
                        folderItems.push({
                            label: folderName,
                            description: relativePath,
                            iconPath: vscode.Uri.file(dirPath),
                            uri: vscode.Uri.file(dirPath)
                        });
                    }
                }
            }
        }

        catch (error) {
            console.error('Error finding folders:', error);
        }

        // Sort by label
        folderItems.sort((a, b) => a.label.localeCompare(b.label));

        // Show quick pick for folder selection
        const selectedFolder = await vscode.window.showQuickPick(folderItems, {
            placeHolder: strings.attachmentSelectFolder,
            matchOnDescription: true
        });

        if (!selectedFolder) return;

        // Ask for folder depth
        const depthOptions = [
            {
                label: strings.attachmentFolderDepthCurrent, depth: 0,
            },
            {
                label: strings.attachmentFolderDepth1, depth: 1,
            },
            {
                label: strings.attachmentFolderDepth2, depth: 2,
            },
            {
                label: strings.attachmentFolderDepthRecursive, depth: -1,
            }
        ];

        const selectedDepth = await vscode.window.showQuickPick(depthOptions, {
            placeHolder: strings.attachmentSelectFolderDepth
        });

        if (!selectedDepth) return;

        // Create folder attachment
        const folderName = path.basename(selectedFolder.uri.fsPath);

        const attachment: AttachmentInfo = {
            id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            name: folderName,
            uri: selectedFolder.uri.toString(),
            isFolder: true,
            folderPath: selectedFolder.uri.fsPath,
            depth: selectedDepth.depth
        };

        pending.item.attachments.push(attachment);

        // Update webview with new attachments
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

            // Fetch all workspace files, excluding configured ignore patterns
            // This ensures queries like 'readme' match 'README.md'
            const excludePattern = getExcludePattern();
            const allFiles = await vscode.workspace.findFiles('**/*', excludePattern || undefined, 2000);
            const queryLower = sanitizedQuery.toLowerCase();

            // Extract unique folders from file paths (optimized)
            const seenFolders = new Set<string>();
            const folderResults: FileSearchResult[] = [];

            for (const uri of allFiles) {
                const relativePath = vscode.workspace.asRelativePath(uri);
                const dirPath = path.dirname(relativePath);

                if (dirPath && dirPath !== '.' && !seenFolders.has(dirPath)) {
                    seenFolders.add(dirPath);
                    const parts = dirPath.split(/[\\/]/);
                    const folderName = parts[parts.length - 1];

                    // Only add if matches query (or query is empty)
                    if (!queryLower || folderName.toLowerCase().includes(queryLower) || dirPath.toLowerCase().includes(queryLower)) {
                        // Use correct workspace folder for multi-root workspaces
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.workspace.workspaceFolders![0].uri;

                        folderResults.push({
                            name: folderName,
                            path: dirPath,
                            uri: vscode.Uri.joinPath(workspaceFolder, dirPath).toString(),
                            icon: 'folder',
                            isFolder: true
                        });
                    }
                }
            }

            // Map files to results
            const fileResults: FileSearchResult[] = allFiles.map(uri => {
                const relativePath = vscode.workspace.asRelativePath(uri);
                const fileName = uri.fsPath.split(/[\\/]/).pop() || 'file';

                return {
                    name: fileName,
                    path: relativePath,
                    uri: uri.toString(),
                    icon: this._getFileIcon(fileName),
                    isFolder: false
                };
            }

            ) // Case-insensitive filtering on both filename and path
                // If query is empty, show all files
                .filter(file => !queryLower || file.name.toLowerCase().includes(queryLower) || file.path.toLowerCase().includes(queryLower));

            // Combine folders and files, then sort
            const allResults = [...folderResults,
            ...fileResults].sort((a, b) => {
                // Prioritize folders over files
                if (a.isFolder && !b.isFolder) return -1;
                if (!a.isFolder && b.isFolder) return 1;

                // Then prioritize exact name matches (starts with query)
                const aExact = a.name.toLowerCase().startsWith(queryLower);
                const bExact = b.name.toLowerCase().startsWith(queryLower);
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                // Secondary: prioritize name contains over path-only matches
                const aNameMatch = a.name.toLowerCase().includes(queryLower);
                const bNameMatch = b.name.toLowerCase().includes(queryLower);
                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;

                return a.name.localeCompare(b.name);
            }

            ).slice(0, 50); // Limit to 50 results

            this._view?.webview.postMessage({
                type: 'fileSearchResults',
                files: allResults
            });
        }

        catch (error) {
            console.error('File search error:', error);

            this._view?.webview.postMessage({
                type: 'fileSearchResults',
                files: []
            });
        }
    }

    /**
     * Handle adding a file or folder reference from autocomplete selection
     */
    private _handleAddFileReference(requestId: string, file: FileSearchResult): void {
        const pending = this._pendingRequests.get(requestId);
        if (!pending || !file) return;

        const isFolder = file.isFolder === true;

        // Create attachment from file/folder reference
        const attachment: AttachmentInfo = {
            id: `${isFolder ? 'folder' : 'file'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: file.name,
            uri: file.uri,
            isFolder: isFolder,
            folderPath: isFolder ? file.path : undefined,
            depth: isFolder ? -1 : undefined // Default to recursive for autocomplete-added folders
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
            // Robust parse of data URL: data:<mime>[;base64],<data>
            if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
                console.error('Invalid data URL format');
                vscode.window.showWarningMessage(strings.attachmentInvalidDataUrl);
                return;
            }

            const commaIndex = dataUrl.indexOf(',');
            if (commaIndex === -1) {
                console.error('Invalid data URL format (missing comma)');
                vscode.window.showWarningMessage(strings.attachmentInvalidDataUrl);
                return;
            }

            const header = dataUrl.slice('data:'.length, commaIndex);
            const dataPart = dataUrl.slice(commaIndex + 1);
            const headerParts = header.split(';').map(p => p.trim()).filter(Boolean);

            const mimeFromUrl = headerParts[0] && headerParts[0].includes('/') ? headerParts[0] : '';
            const isBase64 = headerParts.some(p => p.toLowerCase() === 'base64');
            const effectiveMimeType = mimeType || mimeFromUrl;

            if (!effectiveMimeType) {
                vscode.window.showWarningMessage(localize('attachment.unsupportedImageType', 'unknown'));
                return;
            }

            let buffer: Buffer;
            try {
                buffer = isBase64
                    ? Buffer.from(dataPart, 'base64')
                    : Buffer.from(decodeURIComponent(dataPart), 'utf8');
            } catch (e) {
                console.error('Failed to decode data URL payload', e);
                vscode.window.showWarningMessage(strings.attachmentInvalidDataUrl);
                return;
            }

            // Validate image size
            if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
                const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

                vscode.window.showWarningMessage(localize('attachment.imageTooLarge', sizeMB, 10));
                return;
            }

            // Validate MIME type is a known image type
            const validMimeTypes = ['image/png',
                'image/jpeg',
                'image/gif',
                'image/webp',
                'image/bmp',
                'image/svg+xml'];

            if (!validMimeTypes.includes(effectiveMimeType)) {
                vscode.window.showWarningMessage(localize('attachment.unsupportedImageType', effectiveMimeType));
                return;
            }

            // Determine file extension from MIME type
            const extMap: Record<string,
                string> = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'image/bmp': '.bmp',
                'image/svg+xml': '.svg'
            };
            const ext = extMap[effectiveMimeType] || '.png';

            // Use VS Code storage for temp images
            const storageUri = this._context.storageUri;

            if (!storageUri) {
                throw new Error('Storage URI not available');
            }

            const tempDir = path.join(storageUri.fsPath, 'temp-images');

            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, {
                    recursive: true
                });
            }

            // Generate simple incremental filename: image-pasted.png, image-pasted-1.png, etc.
            let fileName: string;
            let filePath: string;
            const existingImages = pending.item.attachments.filter(a => a.isTemporary).length;

            if (existingImages === 0) {
                fileName = `image-pasted${ext}`;
            }

            else {
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
                id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                name: fileName,
                uri: vscode.Uri.file(filePath).toString(),
                isTemporary: true,
                thumbnail: dataUrl,
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

        }

        catch (error) {
            console.error('Failed to save image:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            vscode.window.showErrorMessage(localize('attachment.saveImageFailed', errorMessage));
        }
    }

    /**
     * Resolve a specific request and clean up
     */
    private _resolveRequest(requestId: string, result: UserResponseResult, selectedOptions?: Record<string, string[]>): void {
        const pending = this._pendingRequests.get(requestId);

        if (pending) {
            // Create interaction record and add to history (keeps full attachment info)
            createInteraction(requestId,
                pending.item.question,
                pending.item.title,
                result.response,
                result.attachments,
                result.responded ? 'completed' : 'cancelled'
            );

            // Persist ask_user interaction into ChatHistoryStorage so it shows in the History tab
            // (This is separate from the legacy "recent interactions" list.)
            try {
                this._chatHistoryStorage.saveAskUserInteraction({
                    question: pending.item.question,
                    title: pending.item.title,
                    agentName: pending.item.agentName,
                    response: result.responded ? result.response : strings.cancelled,
                    attachments: (result.attachments || []).map(a => a.uri),
                    options: pending.item.options,
                    selectedOptionLabels: selectedOptions,
                });
            } catch (e) {
                console.error('[Seamless Agent] Failed to save ask_user interaction to ChatHistoryStorage:', e);
            }

            // Clean up temporary image files (pasted/dropped images)
            this._cleanupTempAttachments(pending.item.attachments);

            // Strip internal fields from attachments before returning to MCP caller
            // LLM only needs name and uri to access the content
            const cleanResult: UserResponseResult = {
                responded: result.responded,
                response: result.response,
                attachments: result.attachments.map(att => ({
                    name: att.name,
                    uri: att.uri
                }

                )) as AttachmentInfo[]
            };

            pending.resolve(cleanResult);
            this._pendingRequests.delete(requestId);

            // Update badge
            this._setBadge(this._pendingRequests.size);

            // Show home view (pending requests + history)
            if (this._pendingRequests.size > 0) {
                this._showList();
            }

            else {
                this._showHome();
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
                    }

                    catch (error) {
                        console.error('Failed to cleanup temp attachment:', error);
                    }
                }
            }
        }, cleanupDelay);
    }

    /**
     * Cleanup all temp files in the extension storage directory
     * Called during extension deactivation to prevent orphaned files
     */
    public cleanupAllTempFiles(): void {
        try {
            const storageUri = this._context.storageUri;
            if (!storageUri) return;

            const tempDir = path.join(storageUri.fsPath, 'temp-images');

            if (fs.existsSync(tempDir)) {
                const files = fs.readdirSync(tempDir);

                for (const file of files) {
                    try {
                        const filePath = path.join(tempDir, file);
                        fs.unlinkSync(filePath);

                        console.log(`Cleaned up orphaned temp file: ${filePath}`);
                    }

                    catch (err) {
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

        catch (error) {
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
                this._view.badge = {
                    value: 0, tooltip: ''
                };

                setTimeout(() => {
                    if (this._view && this._pendingRequests.size === 0) {
                        this._view.badge = undefined;
                    }
                }, 100);
            }

            else {
                this._view.badge = {
                    value: count, tooltip: strings.inputRequired
                };
            }
        }
    }

    /**
     * Show a notification to alert the user of a pending request
     */
    private _showNotification(): void {

        vscode.window.showInformationMessage(strings.agentRequiresInput,
            strings.openConsole).then(selection => {
                if (selection === strings.openConsole) {
                    vscode.commands.executeCommand('seamlessAgentView.focus');
                }
            });
    }

    // ========================
    // Chat History Handlers
    // ========================

    /**
     * Clear all chat history (with confirmation)
     */
    private async _handleClearChatHistory(): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            strings.confirmClearHistory || 'Are you sure you want to clear all history?',
            { modal: true },
            strings.confirm || 'Clear'
        );

        if (confirmation) {
            this._chatHistoryStorage.clearAll();
            this._showHome();
        }
    }

    /**
     * Handle selecting an interaction to show its detail
     */
    private _handleSelectInteraction(interactionId: string): void {
        const interaction = this._chatHistoryStorage.getInteraction(interactionId);

        if (interaction) {
            const message: ToWebviewMessage = {
                type: 'showInteractionDetail',
                interaction
            };
            this._view?.webview.postMessage(message);
        }
    }

    /**
     * Handle deleting an individual interaction (with confirmation)
     */
    private async _handleDeleteInteraction(interactionId: string): Promise<void> {
        const confirmation = await vscode.window.showWarningMessage(
            strings.confirmDeleteItem || 'Remove this item from history?',
            { modal: true },
            strings.remove || 'Remove'
        );

        if (confirmation) {
            this._chatHistoryStorage.deleteInteraction(interactionId);
            this._showHome();
        }
    }

    /**
     * Handle deleting multiple interactions (batch delete with confirmation)
     */
    private async _handleDeleteMultipleInteractions(interactionIds: string[]): Promise<void> {
        if (!interactionIds || interactionIds.length === 0) return;

        const count = interactionIds.length;
        const message = (strings.confirmDeleteSelected || 'Are you sure you want to delete {0} selected items?')
            .replace('{0}', String(count));

        const confirmation = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            strings.delete || 'Delete'
        );

        if (confirmation) {
            this._chatHistoryStorage.deleteMultipleInteractions(interactionIds);
            this._showHome();
        }
    }

    /**
     * Handle opening a plan review in the full PlanReviewPanel
     * For pending reviews, uses reopenPendingReview to connect to the waiting agent
     * For historical reviews, opens in read-only mode
     */
    private async _handleOpenPlanReviewPanel(interactionId: string): Promise<void> {
        const interaction = this._chatHistoryStorage.getInteraction(interactionId);

        if (interaction && interaction.plan) {
            // Import dynamically to avoid circular dependency
            const { PlanReviewPanel } = await import('./planReviewPanel');
            type PlanCommentType = import('./types').RequiredPlanRevisions;
            type PlanReviewModeType = import('./types').PlanReviewMode;

            // Determine if this is a pending review or historical
            const isPending = interaction.status === 'pending';

            const options = {
                plan: interaction.plan,
                title: interaction.title || strings.planReviewTitle,
                mode: (interaction.mode || 'display') as PlanReviewModeType,
                readOnly: !isPending,
                existingComments: interaction.requiredRevisions as PlanCommentType[],
                interactionId: interactionId
            };

            if (isPending) {
                // Use reopenPendingReview to connect to the existing agent promise
                await PlanReviewPanel.reopenPendingReview(this._extensionUri, interactionId, options);
            } else {
                // Historical view - just open in read-only mode
                PlanReviewPanel.showWithOptions(this._extensionUri, options);
            }
        }
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        // Get URIs for resources
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        const highlightStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.css'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));

        // Generate nonce for CSP
        const nonce = this._getNonce();

        // Read template file
        const templatePath = path.join(this._extensionUri.fsPath, 'media', 'webview.html');
        let template = fs.readFileSync(templatePath, 'utf8');

        const config = vscode.workspace.getConfiguration('seamless-agent');
        const rawHistoryTimeDisplay = config.get<string>('historyTimeDisplay', 'hybrid');
        const historyTimeDisplay = ['relative', 'absolute', 'hybrid'].includes(rawHistoryTimeDisplay)
            ? rawHistoryTimeDisplay
            : 'hybrid';

        // Replace placeholders
        const replacements: Record<string,
            string> = {
            '{{cspSource}}': webview.cspSource,
            '{{nonce}}': nonce,
            '{{styleUri}}': styleUri.toString(),
            '{{highlightStyleUri}}': highlightStyleUri.toString(),
            '{{codiconsUri}}': codiconsUri.toString(),
            '{{scriptUri}}': scriptUri.toString(),
            '{{consoleTitle}}': strings.consoleTitle,
            '{{back}}': strings.back,
            '{{noPendingRequests}}': strings.noPendingRequests,
            '{{noPendingItems}}': strings.noPendingItems,
            '{{pendingItems}}': strings.pendingItems,
            '{{pendingRequests}}': strings.pendingRequests,
            '{{yourResponse}}': strings.yourResponse,
            '{{inputPlaceholder}}': strings.inputPlaceholder,
            '{{attachments}}': strings.attachments,
            '{{noAttachments}}': strings.noAttachments,
            '{{addAttachment}}': strings.addAttachment,
            '{{pastedImage}}': strings.pastedImage,
            '{{submit}}': strings.submit,
            '{{cancel}}': strings.cancel,
            '{{close}}': strings.close,
            '{{remove}}': strings.remove,
            '{{justNow}}': strings.justNow,
            '{{minutesAgo}}': strings.minutesAgo,
            '{{hoursAgo}}': strings.hoursAgo,
            '{{daysAgo}}': strings.daysAgo,
            '{{selectFile}}': strings.selectFile,
            '{{noFilesFound}}': strings.noFilesFound,
            '{{dropImageHere}}': strings.dropImageHere,
            // Session history strings
            '{{recentSessions}}': strings.recentSessions,
            '{{noRecentSessions}}': strings.noRecentSessions,
            '{{clearHistory}}': strings.clearHistory,
            '{{sessionInput}}': strings.sessionInput,
            '{{sessionOutput}}': strings.sessionOutput,
            '{{addFolder}}': strings.addFolder,
            // Chat history & Plan Review strings
            '{{pendingReviews}}': strings.pendingReviews,
            '{{noPendingReviews}}': strings.noPendingReviews,
            '{{chatHistory}}': strings.chatHistory,
            '{{noChats}}': strings.noChats,
            '{{openInPanel}}': strings.openInPanel,
            '{{deleteChat}}': strings.deleteChat,
            '{{approved}}': strings.approved,
            '{{rejected}}': strings.rejected,
            '{{pending}}': strings.pending,
            '{{acknowledged}}': strings.acknowledged,
            '{{cancelled}}': strings.cancelled,
            '{{question}}': strings.question,
            '{{response}}': strings.response,
            '{{noResponse}}': strings.noResponse,
            '{{options}}': strings.options,
            // History filter tooltips
            '{{historyFilterAll}}': strings.historyFilterAll,
            '{{historyFilterAskUser}}': strings.historyFilterAskUser,
            '{{historyFilterPlanReview}}': strings.historyFilterPlanReview,
            // Batch selection
            '{{batchSelectMode}}': strings.batchSelectMode,
            '{{batchExitSelectMode}}': strings.batchExitSelectMode,
            '{{batchSelectAll}}': strings.batchSelectAll,
            '{{batchDeselectAll}}': strings.batchDeselectAll,
            '{{batchDeleteSelected}}': strings.batchDeleteSelected,
            '{{batchSelectedCount}}': strings.batchSelectedCount,
            '{{historyTimeDisplay}}': historyTimeDisplay,
            '{{orTypeYourOwn}}': strings.orTypeYourOwn,
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

        const iconMap: Record<string,
            string> = {
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
