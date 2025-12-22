import * as vscode from 'vscode';
import { registerNativeTools } from '../tools';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { initializeChatHistoryStorage, getChatHistoryStorage } from '../storage/chatHistoryStorage';
import { strings } from '../localization';
import { OrchestrationAgent } from '../agent';
import { ExtensionCoreOptions, IExtensionCore } from './types';
import { SeamlessAgentAPI, createSeamlessAgentAPI } from '../api';
import { AddonRegistry } from '../addons/registry';


const PARTICIPANT_ID = 'seamless-agent.agent';


/**
 * Core class for the Seamless Agent extension.
 * Manages initialization, lifecycle, and provides access to core services.
 */
export class ExtensionCore implements IExtensionCore {
    private provider: AgentInteractionProvider;
    private api: SeamlessAgentAPI;
    public readonly subscriptions: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext, options?: ExtensionCoreOptions) {
        // Initialize the public API first (creates event emitter and registry)
        this.api = createSeamlessAgentAPI(context);
        this.subscriptions.push(this.api);

        // Initialize the chat history storage (must be done before tools are registered)
        initializeChatHistoryStorage(this);

        if (options?.createMcpServer) {
            this.setupMCPServer().then(() => {
                console.log('MCP Server initialized');
            }).catch((err) => {
                console.error('Error initializing MCP Server:', err);
            });
        }

        // Register the webview provider for the Agent Console panel
        this.provider = new AgentInteractionProvider(this);

        this.subscriptions.push(
            vscode.window.registerWebviewViewProvider(AgentInteractionProvider.viewType, this.provider, {
                webviewOptions: { retainContextWhenHidden: true }
            })
        );

        // Register the ask_user tool with the webview provider
        // This also sets up the native tool functions in the API
        registerNativeTools(this, this.provider);

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
                const { PlanReviewPanel } = await import('../webview/planReviewPanel');

                // Mark selected plans as cancelled and close their panels
                for (const item of selected) {
                    storage.updateInteraction(item.id, { status: 'cancelled' });
                    // Close the panel if it's open
                    PlanReviewPanel.closeIfOpen(item.id);
                }

                vscode.window.showInformationMessage(`Cancelled ${selected.length} pending plan(s).`);

                // Refresh the panel if it's visible
                this.provider.refreshHome();
            }
        });

        this.subscriptions.push(cancelPendingPlansCommand);

        // Register command to show pending requests
        const showPendingCommand = vscode.commands.registerCommand('seamless-agent.showPending', () => {
            this.provider.switchTab('pending');
        });
        this.subscriptions.push(showPendingCommand);

        // Register command to show history
        const showHistoryCommand = vscode.commands.registerCommand('seamless-agent.showHistory', () => {
            this.provider.switchTab('history');
        });
        this.subscriptions.push(showHistoryCommand);

        // Register command to clear history
        const clearHistoryCommand = vscode.commands.registerCommand('seamless-agent.clearHistory', async () => {
            const result = await vscode.window.showWarningMessage(
                strings.confirmClearHistory,
                { modal: true },
                strings.confirm
            );
            if (result === strings.confirm) {
                this.provider.clearHistory();
            }
        });

        this.subscriptions.push(clearHistoryCommand);

        const orchestrationAgent = new OrchestrationAgent();

        const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, orchestrationAgent.handler);
        participant.iconPath = new vscode.ThemeIcon('question');

        this.subscriptions.push(participant, orchestrationAgent);
    }

    /**
     * Get the VS Code extension context
     */
    getContext(): vscode.ExtensionContext {
        return this.context;
    }

    /**
     * Get the public API instance for addon integration
     */
    getAPI(): SeamlessAgentAPI {
        return this.api;
    }

    /**
     * Get the addon registry
     */
    getAddonRegistry(): AddonRegistry {
        return this.api.registry;
    }

    /**
     * Get the webview provider
     */
    getProvider(): AgentInteractionProvider {
        return this.provider;
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.subscriptions.forEach(sub => sub.dispose());
    }

    private async setupMCPServer(): Promise<void> {
        const { ApiServiceManager } = await import('../mcp/apiService');
        const apiServiceManager = new ApiServiceManager(this, this.provider);
        apiServiceManager.start().then(() => {
            // Register restart command
            this.subscriptions.push(
                vscode.commands.registerCommand('seamless-agent.restartMcpServer', async () => {
                    await apiServiceManager?.restart();
                })
            );
        });
    }

}