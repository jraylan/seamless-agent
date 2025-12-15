import * as vscode from 'vscode';
import { registerNativeTools, askUser } from './tools';
import { AgentInteractionProvider } from './webview/webviewProvider';
import { ApiServiceManager } from './mcp/apiService';
import { initializeChatHistoryStorage, getChatHistoryStorage } from './storage/chatHistoryStorage';
import { strings } from './localization';

const PARTICIPANT_ID = 'seamless-agent.agent';
let apiServiceManager: ApiServiceManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Seamless Agent extension active');

    // Initialize the chat history storage (must be done before provider is created)
    initializeChatHistoryStorage(context);

    // Create provider
    const provider = new AgentInteractionProvider(context);
    provider.loadSessionsFromDisk(); // Restore interaction history from disk

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

    // Register command to cancel pending plans
    const cancelPendingPlansCommand = vscode.commands.registerCommand('seamless-agent.cancelPendingPlans', async () => {
        const storage = getChatHistoryStorage();
        const pendingReviews = storage.getPendingPlanReviews();

        if (pendingReviews.length === 0) {
            vscode.window.showInformationMessage('No pending plan reviews to cancel.');
            return;
        }

        const items = pendingReviews.map(review => ({
            label: review.title || 'Plan Review',
            description: `Created: ${new Date(review.timestamp).toLocaleString()}`,
            detail: review.plan?.substring(0, 100) + (review.plan && review.plan.length > 100 ? '...' : ''),
            id: review.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select pending plans to cancel',
            canPickMany: true,
            title: 'Cancel Pending Plans'
        });

        if (selected && selected.length > 0) {
            const { PlanReviewPanel } = await import('./webview/planReviewPanel');
            for (const item of selected) {
                storage.updateInteraction(item.id, { status: 'cancelled' });
                PlanReviewPanel.closeIfOpen(item.id);
            }
            vscode.window.showInformationMessage(`Cancelled ${selected.length} pending plan(s).`);
            provider.refreshHome();
        }
    });
    context.subscriptions.push(cancelPendingPlansCommand);

    // Register command to show pending requests
    const showPendingCommand = vscode.commands.registerCommand('seamless-agent.showPending', () => {
        provider.switchTab('pending');
    });
    context.subscriptions.push(showPendingCommand);

    // Register command to show history
    const showHistoryCommand = vscode.commands.registerCommand('seamless-agent.showHistory', () => {
        provider.switchTab('history');
    });
    context.subscriptions.push(showHistoryCommand);

    // Register command to clear history
    const clearHistoryCommand = vscode.commands.registerCommand('seamless-agent.clearHistory', async () => {
        const result = await vscode.window.showWarningMessage(
            strings.confirmClearHistory,
            { modal: true },
            strings.confirm
        );
        if (result === strings.confirm) {
            const storage = getChatHistoryStorage();
            storage.clearAll();
            provider.refreshHome();
        }
    });
    context.subscriptions.push(clearHistoryCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {
    if (apiServiceManager) {
        apiServiceManager.dispose();
    }
}
