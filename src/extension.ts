import * as vscode from 'vscode';
import { registerNativeTools } from './tools';
import { AgentInteractionProvider } from './webview/webviewProvider';
import { initializeChatHistoryStorage, getChatHistoryStorage } from './storage/chatHistoryStorage';
import { strings } from './localization';

const PARTICIPANT_ID = 'seamless-agent.agent';

// Store provider reference for cleanup on deactivation
let agentProvider: AgentInteractionProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Seamless Agent extension active');

    // Initialize the chat history storage (must be done before tools are registered)
    initializeChatHistoryStorage(context);

    // Register the webview provider for the Agent Console panel
    const provider = new AgentInteractionProvider(context);
    provider.loadSessionsFromDisk(); // Restore interaction history from disk
    agentProvider = provider; // Store reference for deactivation cleanup

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(
        vscode.window.registerWebviewViewProvider(AgentInteractionProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Register the ask_user tool with the webview provider
    registerNativeTools(context, provider);

    // Register command to cancel pending plans
    const cancelPendingPlansCommand = vscode.commands.registerCommand('seamless-agent.cancelPendingPlans', async () => {
        const storage = getChatHistoryStorage();
        const pendingReviews = storage.getPendingPlanReviews();

        if (pendingReviews.length === 0) {
            vscode.window.showInformationMessage('No pending plan reviews to cancel.');
            return;
        }

        // Create QuickPick items
        const items = pendingReviews.map(review => ({
            label: review.title || 'Plan Review',
            description: `Created: ${new Date(review.timestamp).toLocaleString()}`,
            detail: review.plan?.substring(0, 100) + (review.plan && review.plan.length > 100 ? '...' : ''),
            id: review.id
        }));

        // Show QuickPick with multi-select
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select pending plans to cancel',
            canPickMany: true,
            title: 'Cancel Pending Plans'
        });

        if (selected && selected.length > 0) {
            // Import PlanReviewPanel to close any open panels
            const { PlanReviewPanel } = await import('./webview/planReviewPanel');

            // Mark selected plans as cancelled and close their panels
            for (const item of selected) {
                storage.updateInteraction(item.id, { status: 'cancelled' });
                // Close the panel if it's open
                PlanReviewPanel.closeIfOpen(item.id);
            }

            vscode.window.showInformationMessage(`Cancelled ${selected.length} pending plan(s).`);

            // Refresh the panel if it's visible
            provider.refreshHome();
        }
    });

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(cancelPendingPlansCommand);

    // Register command to show pending requests
    const showPendingCommand = vscode.commands.registerCommand('seamless-agent.showPending', () => {
        provider.switchTab('pending');
    });
    (context.subscriptions as unknown as Array<vscode.Disposable>).push(showPendingCommand);

    // Register command to show history
    const showHistoryCommand = vscode.commands.registerCommand('seamless-agent.showHistory', () => {
        provider.switchTab('history');
    });
    (context.subscriptions as unknown as Array<vscode.Disposable>).push(showHistoryCommand);

    // Register command to show task lists
    const showTaskListsCommand = vscode.commands.registerCommand('seamless-agent.showTaskLists', () => {
        provider.switchTab('tasks');
    });
    (context.subscriptions as unknown as Array<vscode.Disposable>).push(showTaskListsCommand);

    // Register command to clear history
    const clearHistoryCommand = vscode.commands.registerCommand('seamless-agent.clearHistory', async () => {
        const result = await vscode.window.showWarningMessage(
            strings.confirmClearHistory,
            { modal: true },
            strings.confirm
        );
        if (result === strings.confirm) {
            provider.clearHistory();
        }
    });
    (context.subscriptions as unknown as Array<vscode.Disposable>).push(clearHistoryCommand);

    // Create a Chat Participant that uses our tool
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        // Get our ask_user tool
        const askUserTool = vscode.lm.tools.find(t => t.name === 'ask_user');

        // Get all available tools including ours
        const tools = askUserTool ? [askUserTool] : [];

        // Build the prompt with instruction to use the tool
        const systemPrompt = `You are a helpful assistant. 
IMPORTANT: You have access to an "ask_user" tool. You MUST use this tool before completing any task to confirm with the user that their request was fulfilled correctly.
Never finish a response without first calling the ask_user tool to verify with the user.`;

        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(request.prompt)
        ];

        // Get the model
        let model = request.model;

        const options: vscode.LanguageModelChatRequestOptions = {
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema
            })),
        };

        try {
            const response = await model.sendRequest(messages, options, token);

            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    stream.markdown(part.value);
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    // Handle tool calls
                    stream.progress(`Calling ${part.name}...`);
                    const toolResult = await vscode.lm.invokeTool(part.name, {
                        input: part.input,
                        toolInvocationToken: request.toolInvocationToken
                    }, token);

                    // Show tool result
                    for (const resultPart of toolResult.content) {
                        if (resultPart instanceof vscode.LanguageModelTextPart) {
                            stream.markdown(`\n\n**User Response:** ${resultPart.value}\n\n`);
                        }
                    }
                }
            }
        } catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                stream.markdown(`Error: ${err.message}`);
            } else {
                throw err;
            }
        }

        return;
    };

    // Register the chat participant
    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    participant.iconPath = new vscode.ThemeIcon('question');

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(participant);
}

export function deactivate() {
    // Clean up any orphaned temp files on extension deactivation
    if (agentProvider) {
        agentProvider.cleanupAllTempFiles();
        agentProvider = null;
    }
    console.log('Seamless Agent extension deactivated');
}