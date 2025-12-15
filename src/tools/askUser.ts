import * as vscode from 'vscode';
import { strings } from '../localization';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { UserResponseResult } from '../webview/types';
import { getChatHistoryStorage } from '../storage/chatHistoryStorage';
import { AskUserInput, AskUserToolResult } from './schemas';

/**
 * Core logic to ask user, reusable by MCP server
 */
export async function askUser(
    params: AskUserInput,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken
): Promise<AskUserToolResult> {
    const question = params.question;
    const agentName = params.agentName || 'Agent';
    const baseTitle = params.title || strings.confirmationRequired;

    const title = `${agentName}: ${baseTitle}`;

    // Generate request ID to track this specific request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Get storage instance
    const storage = getChatHistoryStorage();

    // Register cancellation handler - if agent stops, cancel the request
    const cancellationDisposable = token.onCancellationRequested(() => {
        provider.cancelRequest(requestId, strings.cancelled);
    });

    try {
        // Execute Logic - Try webview first, fall back to VS Code dialogs
        const result = await askViaWebview(provider, question, title, requestId, token);

        // Save the interaction to storage (no chatId needed - each interaction is individual)
        storage.saveAskUserInteraction({
            question,
            title,
            agentName,
            response: result.responded ? result.response : strings.cancelled,
            attachments: result.attachments.map(att => att.uri)
        });

        return {
            responded: result.responded,
            response: result.responded ? result.response : strings.cancelled,
            attachments: result.attachments.map(att => att.uri)
        };
    } finally {
        // Clean up cancellation listener
        cancellationDisposable.dispose();
    }
}

/**
 * Shows the question in the Agent Console webview panel
 * Falls back to VS Code dialogs if the webview is not available
 */
async function askViaWebview(
    provider: AgentInteractionProvider,
    question: string,
    title: string,
    requestId: string,
    token: vscode.CancellationToken
): Promise<UserResponseResult> {

    // Check if already cancelled
    if (token.isCancellationRequested) {
        return { responded: false, response: strings.cancelled, attachments: [] };
    }

    // Create a promise that rejects on cancellation
    return new Promise<UserResponseResult>((resolve) => {

        // Listen for cancellation
        const cancellationListener = token.onCancellationRequested(() => {
            // Try to find and cancel this request in the provider
            const pendingRequests = provider.getPendingRequests();
            const thisRequest = pendingRequests.find(r => r.question === question && r.title === title);

            if (thisRequest) {
                provider.cancelRequest(thisRequest.id, strings.cancelled);
            }

            cancellationListener.dispose();

            resolve({ responded: false, response: strings.cancelled, attachments: [] });
        });

        // Start the actual request
        provider.waitForUserResponse(question, title).then(result => {
            cancellationListener.dispose();

            // If webview wasn't available, fall back to the old dialog approach
            if (!result.responded && result.response === 'Agent Console view is not available.') {
                askViaVSCode(question, title).then(fallbackResult => {
                    resolve({ ...fallbackResult, attachments: [] });
                });
                return;
            }

            resolve(result);
        });
    });
}

/**
 * Shows a visible warning notification, then opens the input box
 * (Fallback method when webview is not available)
 */
async function askViaVSCode(question: string, title: string): Promise<{ responded: boolean; response: string }> {
    const buttonText = strings.respond;

    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');

    const selection = await vscode.window.showWarningMessage(
        `${strings.confirmationRequired}: ${question}`,
        { modal: false },
        buttonText
    );

    // If user dismissed notification
    if (selection !== buttonText) {
        return { responded: false, response: '' };
    }

    // Show Input Box
    const response = await vscode.window.showInputBox({
        title: title,
        prompt: question,
        placeHolder: strings.inputPlaceholder,
        ignoreFocusOut: true
    });

    if (response === undefined) {
        return { responded: false, response: '' };
    }

    return { responded: response.trim().length > 0, response };
}
