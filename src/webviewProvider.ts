import * as vscode from 'vscode';
import { strings } from './localization';

// Message types for communication between Extension Host and Webview
type ToWebviewMessage = 
    | { type: 'showQuestion'; question: string; title: string }
    | { type: 'clear' };

type FromWebviewMessage = 
    | { type: 'submit'; response: string }
    | { type: 'cancel' };

// Result type for user responses
export interface UserResponseResult {
    responded: boolean;
    response: string;
}

export class AgentInteractionProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'seamlessAgentView';
    
    private _view?: vscode.WebviewView;
    
    // Pending request state for promise-based handling
    private _pendingRequest: {
        resolve: (result: UserResponseResult) => void;
    } | null = null;
    
    constructor(private readonly _extensionUri: vscode.Uri) {}
    
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
                vscode.Uri.joinPath(this._extensionUri, 'dist')
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
        
        // Handle view disposal - resolve any pending request as cancelled
        webviewView.onDidDispose(() => {
            this._resolvePendingRequest({ responded: false, response: 'View was closed' });
        });
    }
    
    /**
     * Wait for a user response to a question.
     * Returns a promise that resolves when the user submits or cancels.
     */
    public async waitForUserResponse(question: string, title?: string): Promise<UserResponseResult> {
        // If there's already a pending request, reject it
        if (this._pendingRequest) {
            return { responded: false, response: 'Another request is already pending.' };
        }
        
        // If the view isn't available, try to show it
        if (!this._view) {
            // View not yet resolved - register and wait might help in future phases
            return { responded: false, response: 'Agent Console view is not available.' };
        }
        
        return new Promise<UserResponseResult>((resolve) => {
            this._pendingRequest = { resolve };
            this.showQuestion(question, title || strings.confirmationRequired);
            
            // Show badge to indicate pending request
            this._setBadge(1);
            
            // Reveal the panel to get user's attention
            this._view?.show(true); // preserveFocus = true
            
            // Show notification as additional visibility
            this._showNotification();
        });
    }
    
    /**
     * Send a question to the webview for display
     */
    public showQuestion(question: string, title: string): void {
        const message: ToWebviewMessage = { type: 'showQuestion', question, title };
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
                console.log('[AgentInteractionProvider] Submit received:', message.response);
                this._resolvePendingRequest({ responded: true, response: message.response });
                break;
            case 'cancel':
                console.log('[AgentInteractionProvider] Cancel received');
                this._resolvePendingRequest({ responded: false, response: '' });
                break;
        }
    }
    
    /**
     * Resolve the pending request and clean up state
     */
    private _resolvePendingRequest(result: UserResponseResult): void {
        if (this._pendingRequest) {
            this._pendingRequest.resolve(result);
            this._pendingRequest = null;
            // Clear the badge when request is resolved
            this._setBadge(0);
        }
    }
    
    /**
     * Set the badge count on the view
     */
    private _setBadge(count: number): void {
        if (this._view) {
            this._view.badge = count > 0 
                ? { value: count, tooltip: strings.inputRequired } 
                : undefined;
        }
    }
    
    /**
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
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );
        
        // Generate nonce for CSP
        const nonce = this._getNonce();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <link href="${highlightStyleUri}" rel="stylesheet">
    <title>${strings.consoleTitle}</title>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${strings.consoleTitle}</h1>
        </div>
        
        <!-- Empty state - shown when no request pending -->
        <div id="empty-state">
            <p class="placeholder">${strings.noPendingRequests}</p>
        </div>
        
        <!-- Request form - hidden until a question arrives -->
        <div id="request-form" class="hidden">
            <div class="question-section">
                <div class="question-title" id="question-title">${strings.confirmationRequired}</div>
                <div class="question-content" id="question-content"></div>
            </div>
            
            <div class="response-section">
                <label class="response-label" for="response-input">${strings.yourResponse}</label>
                <textarea 
                    id="response-input" 
                    placeholder="${strings.inputPlaceholder}"
                    rows="5"
                ></textarea>
            </div>
            
            <div class="button-group">
                <button type="button" id="submit-btn" class="btn-primary">${strings.submit}</button>
                <button type="button" id="cancel-btn" class="btn-secondary">${strings.cancel}</button>
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
