import * as vscode from 'vscode';
import type { RequiredPlanRevisions, StoredInteraction } from '../webview/types';

/**
 * Storage keys for global state
 */
const STORAGE_KEYS = {
    INTERACTIONS: 'seamless-agent.interactions',
};

/**
 * Manages persistence of interactions
 * Uses VS Code's globalState for cross-session persistence
 * Simplified: each interaction is individual, no chat grouping
 */
export class ChatHistoryStorage {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ========================
    // Interaction Methods
    // ========================

    /**
     * Get all interactions, sorted by timestamp (most recent first)
     */
    getAllInteractions(): StoredInteraction[] {
        const interactions = this.context.globalState.get<StoredInteraction[]>(STORAGE_KEYS.INTERACTIONS, []);
        return interactions.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get a specific interaction by ID
     */
    getInteraction(interactionId: string): StoredInteraction | undefined {
        const interactions = this.getAllInteractions();
        return interactions.find(i => i.id === interactionId);
    }

    /**
     * Save a new ask_user interaction
     */
    saveAskUserInteraction(data: {
        question: string;
        title?: string;
        agentName?: string;
        response?: string;
        attachments?: string[];
    }): string {
        const interactionId = this.generateId('ask');
        const interaction: StoredInteraction = {
            id: interactionId,
            type: 'ask_user',
            timestamp: Date.now(),
            question: data.question,
            title: data.title,
            agentName: data.agentName,
            response: data.response,
            attachments: data.attachments,
        };

        this.saveInteraction(interaction);
        return interactionId;
    }

    /**
     * Save a new plan_review interaction
     */
    savePlanReviewInteraction(data: {
        plan: string;
        title?: string;
        mode?: 'review' | 'walkthrough';
        status?: 'pending' | 'approved' | 'recreateWithChanges' | 'acknowledged' | 'closed' | 'cancelled';
        requiredRevisions?: RequiredPlanRevisions[];
    }): string {
        const interactionId = this.generateId('review');
        const interaction: StoredInteraction = {
            id: interactionId,
            type: 'plan_review',
            timestamp: Date.now(),
            plan: data.plan,
            title: data.title,
            mode: data.mode || 'review',
            status: data.status || 'pending',
            requiredRevisions: data.requiredRevisions || [],
        };

        this.saveInteraction(interaction);
        return interactionId;
    }

    /**
     * Save an interaction to storage
     */
    private saveInteraction(interaction: StoredInteraction): void {
        const interactions = this.context.globalState.get<StoredInteraction[]>(STORAGE_KEYS.INTERACTIONS, []);
        const existingIndex = interactions.findIndex(i => i.id === interaction.id);

        if (existingIndex >= 0) {
            interactions[existingIndex] = interaction;
        } else {
            interactions.push(interaction);
        }

        this.context.globalState.update(STORAGE_KEYS.INTERACTIONS, interactions);
    }

    /**
     * Update an existing interaction
     */
    updateInteraction(interactionId: string, updates: Partial<StoredInteraction>): void {
        const interaction = this.getInteraction(interactionId);
        if (interaction) {
            const updated = { ...interaction, ...updates };
            this.saveInteraction(updated);
        }
    }

    /**
     * Delete an interaction
     */
    deleteInteraction(interactionId: string): void {
        const interactions = this.getAllInteractions().filter(i => i.id !== interactionId);
        this.context.globalState.update(STORAGE_KEYS.INTERACTIONS, interactions);
    }

    /**
     * Clear all completed interactions (preserves pending items)
     * Pending items can only be removed via the cancel command
     */
    clearAll(): void {
        const allInteractions = this.getAllInteractions();
        // Keep only pending interactions - they should only be cancelled via command
        const pendingInteractions = allInteractions.filter(i => i.status === 'pending');
        this.context.globalState.update(STORAGE_KEYS.INTERACTIONS, pendingInteractions);
    }

    // ========================
    // Filtered Queries
    // ========================

    /**
     * Get all pending plan reviews (status === 'pending')
     */
    getPendingPlanReviews(): StoredInteraction[] {
        return this.getAllInteractions()
            .filter(i => i.type === 'plan_review' && i.status === 'pending');
    }

    /**
     * Get all completed interactions (not pending)
     */
    getCompletedInteractions(): StoredInteraction[] {
        return this.getAllInteractions()
            .filter(i => i.type === 'ask_user' || (i.type === 'plan_review' && i.status !== 'pending'));
    }

    /**
     * Get interactions by type
     */
    getInteractionsByType(type: 'ask_user' | 'plan_review'): StoredInteraction[] {
        return this.getAllInteractions().filter(i => i.type === type);
    }

    // ========================
    // File Export
    // ========================

    /**
     * Export a plan review to a Markdown file
     */
    async exportPlanToFile(
        interactionId: string,
        targetPath?: string
    ): Promise<string | undefined> {
        const interaction = this.getInteraction(interactionId);
        if (!interaction || interaction.type !== 'plan_review' || !interaction.plan) {
            return undefined;
        }

        // Build markdown content with comments
        let content = `# ${interaction.title || 'Plan Review'}\n\n`;
        content += `**Mode:** ${interaction.mode || 'review'}\n`;
        content += `**Status:** ${interaction.status || 'pending'}\n`;
        content += `**Date:** ${new Date(interaction.timestamp).toLocaleString()}\n\n`;
        content += `---\n\n`;
        content += interaction.plan;

        // Add comments section if any
        if (interaction.requiredRevisions && interaction.requiredRevisions.length > 0) {
            content += `\n\n---\n\n## Comments\n\n`;
            for (const comment of interaction.requiredRevisions) {
                content += `> ${comment.revisedPart}\n\n`;
                content += `${comment.revisorInstructions}\n\n`;
            }
        }

        // Determine file path
        if (!targetPath) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open');
                return undefined;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `plan-review-${timestamp}.md`;
            targetPath = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName).fsPath;
        }

        // Write file
        try {
            const uri = vscode.Uri.file(targetPath);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
            vscode.window.showInformationMessage(`Plan exported to ${targetPath}`);
            return targetPath;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export plan: ${error}`);
            return undefined;
        }
    }

    // ========================
    // Utility Methods
    // ========================

    /**
     * Generate a unique ID with a prefix
     */
    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Get storage statistics
     */
    getStats(): { interactions: number; pendingReviews: number } {
        return {
            interactions: this.getAllInteractions().length,
            pendingReviews: this.getPendingPlanReviews().length,
        };
    }
}

// Singleton instance
let storageInstance: ChatHistoryStorage | undefined;

/**
 * Initialize the storage with extension context
 */
export function initializeChatHistoryStorage(context: vscode.ExtensionContext): ChatHistoryStorage {
    storageInstance = new ChatHistoryStorage(context);
    return storageInstance;
}

/**
 * Get the storage instance (must be initialized first)
 */
export function getChatHistoryStorage(): ChatHistoryStorage {
    if (!storageInstance) {
        throw new Error('ChatHistoryStorage not initialized. Call initializeChatHistoryStorage first.');
    }
    return storageInstance;
}
