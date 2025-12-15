import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { strings } from '../localization';
import type {
    RequiredPlanRevisions,
    PlanReviewResult,
    PlanReviewMode,
    PlanReviewOptions,
    PlanReviewPanelToWebviewMessage as ToWebviewMessage,
    PlanReviewPanelFromWebviewMessage as FromWebviewMessage
} from './types';

/**
 * Webview Panel for reviewing and approving AI plans
 * Opens as a document-like panel in the center of VS Code (like GitHub Copilot Chat Editor)
 * Supports multiple modes: review, summary, progress, walkthrough, display
 */
export class PlanReviewPanel {
    public static readonly viewType = 'seamlessAgent.approvePlan';

    private static _panels: Map<string, PlanReviewPanel> = new Map();
    // Stores pending resolvers that survive panel close/reopen
    private static _pendingResolvers: Map<string, (result: PlanReviewResult) => void> = new Map();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private _comments: RequiredPlanRevisions[] = [];
    private _resolvePromise?: (result: PlanReviewResult) => void;
    private _mode: PlanReviewMode;
    private _readOnly: boolean;
    private _planContent: string;
    private _planTitle: string;
    private _closedByAgent: boolean = false;
    private _panelId: string;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        options: PlanReviewOptions,
        resolve: (result: PlanReviewResult) => void,
        panelId: string
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._resolvePromise = resolve;
        this._mode = options.mode || 'review';
        this._readOnly = options.readOnly || false;
        this._comments = options.existingComments || [];
        this._planContent = options.plan;
        this._planTitle = options.title || 'Review Plan';
        this._panelId = panelId;

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
            this._panel.webview.postMessage({
                type: 'showPlan',
                content: options.plan,
                title: this._planTitle,
                mode: this._mode,
                readOnly: this._readOnly,
                comments: this._comments
            } as ToWebviewMessage);
        }, 100);
    }

    /**
     * Create or show an approve plan panel
     */
    public static async show(
        extensionUri: vscode.Uri,
        content: string,
        title: string = 'Review Plan'
    ): Promise<PlanReviewResult> {
        return PlanReviewPanel.showWithOptions(extensionUri, {
            plan: content,
            title,
            mode: 'review'
        });
    }

    /**
     * Create or show a plan review panel with full options
     */
    public static async showWithOptions(
        extensionUri: vscode.Uri,
        options: PlanReviewOptions
    ): Promise<PlanReviewResult> {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const title = options.title || 'Review Plan';
        const panelId = options.interactionId || `plan_${Date.now()}`;

        // Check if panel already exists for this interaction - if so, reveal it
        const existingPanel = PlanReviewPanel._panels.get(panelId);
        if (existingPanel && existingPanel._panel) {
            existingPanel._panel.reveal(column);
            // Return existing promise if there's one waiting
            const existingResolver = PlanReviewPanel._pendingResolvers.get(panelId);
            if (existingResolver) {
                return new Promise<PlanReviewResult>((resolve) => {
                    // Replace the resolver with the new one
                    PlanReviewPanel._pendingResolvers.set(panelId, resolve);
                });
            }
        }

        return new Promise<PlanReviewResult>((resolve) => {
            // Store the resolver globally so it survives panel close/reopen
            PlanReviewPanel._pendingResolvers.set(panelId, resolve);

            // Create a new panel
            const panel = vscode.window.createWebviewPanel(
                PlanReviewPanel.viewType,
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

            const reviewPanel = new PlanReviewPanel(panel, extensionUri, options, resolve, panelId);
            PlanReviewPanel._panels.set(panelId, reviewPanel);

            // Clean up when panel is closed
            panel.onDidDispose(() => {
                PlanReviewPanel._panels.delete(panelId);
            });
        });
    }

    /**
     * Get a panel by ID (for reopening pending reviews)
     */
    public static getPanel(panelId: string): PlanReviewPanel | undefined {
        return PlanReviewPanel._panels.get(panelId);
    }

    /**
     * Close a panel if it's open (used when agent cancels the request)
     * This marks the panel as closed by the agent, which will resolve the promise
     * Also resolves the global pending resolver if the panel is not open
     */
    public static closeIfOpen(panelId: string): void {
        const panel = PlanReviewPanel._panels.get(panelId);
        if (panel) {
            panel._closedByAgent = true;
            panel._panel.dispose();
        } else {
            // Panel is not open, but we may still have a pending resolver
            const pendingResolver = PlanReviewPanel._pendingResolvers.get(panelId);
            if (pendingResolver) {
                pendingResolver({ approved: false, requiredRevisions: [], action: 'closed' });
                PlanReviewPanel._pendingResolvers.delete(panelId);
            }
        }
    }

    /**
     * Reopen a panel for a pending review from storage
     * Uses the global resolver if one exists (agent is still waiting)
     * Returns the existing panel if already open, or creates a new one
     */
    public static async reopenPendingReview(
        extensionUri: vscode.Uri,
        interactionId: string,
        options: PlanReviewOptions
    ): Promise<PlanReviewResult | null> {
        // Check if panel is already open
        const existingPanel = PlanReviewPanel._panels.get(interactionId);
        if (existingPanel) {
            existingPanel._panel.reveal();
            // Panel is already open, no new promise needed
            return null;
        }

        // Check if there's a pending resolver (agent is still waiting)
        const pendingResolver = PlanReviewPanel._pendingResolvers.get(interactionId);

        // Create new panel with the interaction ID
        options.interactionId = interactionId;

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const title = options.title || 'Review Plan';

        // If there's no pending resolver, we're just viewing history - no promise needed
        if (!pendingResolver) {
            // Create panel in read-only mode for viewing
            const panel = vscode.window.createWebviewPanel(
                PlanReviewPanel.viewType,
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

            // For read-only viewing, we create without a real resolver
            const dummyResolve = () => { };
            const reviewPanel = new PlanReviewPanel(panel, extensionUri, options, dummyResolve, interactionId);
            PlanReviewPanel._panels.set(interactionId, reviewPanel);

            panel.onDidDispose(() => {
                PlanReviewPanel._panels.delete(interactionId);
            });

            return null;
        }

        // Create panel that will use the existing pending resolver
        const panel = vscode.window.createWebviewPanel(
            PlanReviewPanel.viewType,
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

        // Create panel with the pending resolver
        const reviewPanel = new PlanReviewPanel(panel, extensionUri, options, pendingResolver, interactionId);
        PlanReviewPanel._panels.set(interactionId, reviewPanel);

        panel.onDidDispose(() => {
            PlanReviewPanel._panels.delete(interactionId);
        });

        return null;
    }

    private _handleMessage(message: FromWebviewMessage): void {
        switch (message.type) {
            case 'approve':
                this._resolve({ approved: true, requiredRevisions: message.comments, action: 'approved' });
                break;
            case 'reject':
                this._resolve({ approved: false, requiredRevisions: message.comments, action: 'recreateWithChanges' });
                break;
            case 'acknowledge':
                this._resolve({ approved: true, requiredRevisions: message.comments, action: 'acknowledged' });
                break;
            case 'close':
                this._resolve({ approved: true, requiredRevisions: message.comments, action: 'closed' });
                break;
            case 'addComment':
                if (!this._readOnly) {
                    this._comments.push({
                        revisedPart: message.revisedPart,
                        revisorInstructions: message.revisorInstructions
                    });
                    this._updateComments();
                }
                break;
            case 'editComment':
                if (!this._readOnly && message.index >= 0 && message.index < this._comments.length) {
                    this._comments[message.index].revisorInstructions = message.revisorInstructions;
                    this._updateComments();
                }
                break;
            case 'removeComment':
                if (!this._readOnly && message.index >= 0 && message.index < this._comments.length) {
                    this._comments.splice(message.index, 1);
                    this._updateComments();
                }
                break;
            case 'exportPlan':
                this._exportPlan();
                break;
        }
    }

    private async _exportPlan(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        // Build markdown content with comments
        let content = `# ${this._planTitle}\n\n`;
        content += `**Mode:** ${this._mode}\n`;
        content += `**Date:** ${new Date().toLocaleString()}\n\n`;
        content += `---\n\n`;
        content += this._planContent;

        // Add comments section if any
        if (this._comments.length > 0) {
            content += `\n\n---\n\n## Comments\n\n`;
            for (const comment of this._comments) {
                content += `> ${comment.revisedPart}\n\n`;
                content += `${comment.revisorInstructions}\n\n`;
            }
        }

        // Ask user for save location
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(workspaceFolders[0].uri, `plan-review-${Date.now()}.md`),
            filters: { 'Markdown': ['md'] }
        });

        if (uri) {
            try {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
                vscode.window.showInformationMessage(`Plan exported to ${uri.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export plan: ${error}`);
            }
        }
    }

    private _updateComments(): void {
        this._panel.webview.postMessage({
            type: 'updateComments',
            comments: this._comments
        } as ToWebviewMessage);
    }

    private _resolve(result: PlanReviewResult): void {
        if (this._resolvePromise) {
            this._resolvePromise(result);
            this._resolvePromise = undefined;
            // Clean up the global pending resolver
            PlanReviewPanel._pendingResolvers.delete(this._panelId);
        }
        // Don't dispose in read-only mode - user can close manually
        if (!this._readOnly) {
            this._panel.dispose();
        }
    }

    private _dispose(): void {
        // Only resolve the promise if the agent cancelled (closed by agent)
        // If the user just closed the panel (X button), the plan stays pending
        // and the agent keeps waiting for a response
        if (this._resolvePromise && this._closedByAgent) {
            this._resolvePromise({ approved: false, requiredRevisions: this._comments, action: 'closed' });
            this._resolvePromise = undefined;
            // Clean up the global pending resolver
            PlanReviewPanel._pendingResolvers.delete(this._panelId);
        }
        // Note: if user closes the panel without action, the plan remains pending
        // The agent continues waiting until it's cancelled or reopened

        // Clean up disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getHtmlContent(): string {
        const webview = this._panel.webview;

        // Get URIs for resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'planReview.css')
        );
        const highlightStyleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'highlight.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'planReview.js')
        );

        // Generate nonce for CSP
        const nonce = this._getNonce();

        // Read template file
        const templatePath = path.join(this._extensionUri.fsPath, 'media', 'planReview.html');
        let template = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        const replacements: Record<string, string> = {
            '{{cspSource}}': webview.cspSource,
            '{{nonce}}': nonce,
            '{{styleUri}}': styleUri.toString(),
            '{{highlightStyleUri}}': highlightStyleUri.toString(),
            '{{codiconsUri}}': codiconsUri.toString(),
            '{{scriptUri}}': scriptUri.toString(),
            '{{approve}}': strings.approvePlanApprove || 'Approve',
            '{{reject}}': strings.approvePlanReject || 'Request Changes',
            '{{acknowledge}}': strings.planReviewAcknowledge || 'Acknowledge',
            '{{continue}}': strings.planReviewContinue || 'Continue',
            '{{done}}': strings.planReviewDone || 'Done',
            '{{close}}': strings.planReviewClose || 'Close',
            '{{export}}': strings.planReviewExport || 'Export',
            '{{readOnly}}': strings.planReviewReadOnly || 'Read Only',
            '{{readOnlyMessage}}': strings.planReviewReadOnlyMessage || 'This plan is in read-only mode',
            '{{rejectRequiresComments}}': strings.planReviewRejectRequiresComments || 'Add comments to explain the changes needed',
            '{{addComment}}': strings.approvePlanAddCommentAction || 'Add Comment',
            '{{editComment}}': strings.approvePlanEditComment || 'Edit',
            '{{removeComment}}': strings.approvePlanRemoveComment || 'Remove',
            '{{commentPlaceholder}}': strings.approvePlanCommentPlaceholder || 'Enter your feedback...',
            '{{save}}': strings.approvePlanSave || 'Save',
            '{{cancel}}': strings.approvePlanCancel || 'Cancel',
            '{{comments}}': strings.approvePlanComments || 'Comments',
            '{{noComments}}': strings.approvePlanNoComments || 'No comments yet. Hover over a line to add feedback.',
            '{{paneTitle}}': strings.planReviewTitle || 'Review Plan'
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
}
