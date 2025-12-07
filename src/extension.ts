import * as vscode from 'vscode';
import { registerNativeTools, askUser } from './tools';
import { AgentInteractionProvider } from './webviewProvider';
import { ApiServiceManager } from './apiService';

const PARTICIPANT_ID = 'seamless-agent.agent';
let apiServiceManager: ApiServiceManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Seamless Agent extension active');

    // Create provider
    const provider = new AgentInteractionProvider(context.extensionUri);

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AgentInteractionProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    // Initialize API Service (replaces MCP Server)
    apiServiceManager = new ApiServiceManager(context, provider);
    await apiServiceManager.start();

    // Register restart command
    context.subscriptions.push(
        vscode.commands.registerCommand('seamless-agent.restartMcpServer', async () => {
            await apiServiceManager?.restart();
        })
    );

    // Create Status Bar Item
    const restartStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    restartStatusBarItem.command = 'seamless-agent.restartMcpServer';
    restartStatusBarItem.text = '$(sync) Restart API';
    restartStatusBarItem.tooltip = 'Restart the Seamless Agent API Service';
    restartStatusBarItem.show();
    context.subscriptions.push(restartStatusBarItem);

    // Register chat participant
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
        // Chat handler implementation...

        try {
            await askUser({
                question: "This is a test question from the chat participant. Do you accept?",
                title: "Chat Confirmation"
            }, provider, token);

            stream.markdown('User accepted the prompt!');
        } catch (err) {
            stream.markdown('User declined or request failed.');
        }

        return { metadata: { command: '' } };
    };

    const transcriptParticipant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    transcriptParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'icon.png');
    context.subscriptions.push(transcriptParticipant);

    // Keep the registerNativeTools for backward compatibility or direct usage
    try {
        registerNativeTools(context, provider);
    } catch (e) {
        console.warn('Failed to register native tools:', e);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    if (apiServiceManager) {
        apiServiceManager.dispose();
    }
}
