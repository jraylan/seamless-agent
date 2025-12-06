import * as vscode from 'vscode';
import { strings } from './localization';
import { AgentInteractionProvider } from './webviewProvider';


interface Input {
    question: string;
    title?: string;
    agentName?: string;
}

/**
 * Registers the native VS Code LM Tools
 */


export function registerNativeTools(context: vscode.ExtensionContext, provider: AgentInteractionProvider) {

    // Register the tool defined in package.json
    const confirmationTool = vscode.lm.registerTool('ask_user', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<Input>, token: vscode.CancellationToken) {

            // 1. Parse parameters
            const params = options.input;
            const question = params.question;
            const agentName = params.agentName || 'Agent';
            const baseTitle = params.title || strings.confirmationRequired;
            const title = `${agentName}: ${baseTitle}`;

            // 2. Execute Logic - Try webview first, fall back to VS Code dialogs
            const result = await askViaWebview(provider, question, title);

            // 3. Return result to the AI
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                    JSON.stringify({
                        responded: result.responded,
                        response: result.response
                    })
                )
            ]);
        }
    });

    context.subscriptions.push(confirmationTool);
}

/**
 * Shows the question in the Agent Console webview panel
 * Falls back to VS Code dialogs if the webview is not available
 */
async function askViaWebview(
    provider: AgentInteractionProvider,
    question: string,
    title: string
): Promise<{ responded: boolean; response: string }> {
    // Try to use the webview provider
    const result = await provider.waitForUserResponse(question, title);
    
    // If webview wasn't available, fall back to the old dialog approach
    if (!result.responded && result.response === 'Agent Console view is not available.') {
        return askViaVSCode(question, title);
    }
    
    return result;
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
