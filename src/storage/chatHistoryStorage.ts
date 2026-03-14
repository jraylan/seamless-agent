import * as vscode from 'vscode';
import {
    isCompletedStoredInteraction,
    isPendingStoredInteraction,
    type RequiredPlanRevisions,
    type RenderUISession,
    type StoredInteraction,
    type WhiteboardCanvas,
    type WhiteboardSession,
    type WhiteboardSessionStatus,
    type WhiteboardSubmittedCanvas,
} from '../webview/types';
import { getStorageContext } from '../config/storage';
import { Logger } from '../logging';

/**
 * Storage keys for global state
 */
const STORAGE_KEYS = {
    INTERACTIONS: 'seamless-agent.interactions',
};

const DEFAULT_WHITEBOARD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;
const DEFAULT_STORAGE_QUOTA_THRESHOLD = 0.9;

export interface ChatHistoryStorageOptions {
    now?: () => number;
    whiteboardSessionMaxAgeMs?: number;
    maxStorageBytes?: number;
    quotaCleanupThreshold?: number;
}

export class StorageQuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StorageQuotaExceededError';
    }
}


/**
 * Whiteboard sessions should be stored on StoredInteraction.whiteboardSession so
 * session-scoped canvases follow the same workspace/global storage lifecycle as
 * ask_user and plan_review interactions. Dedicated whiteboard save/update helpers
 * will build on this shared interaction record in a later task.
 */

/**
 * Manages persistence of interactions
 * Uses VS Code's globalState for cross-session persistence
 * Simplified: each interaction is individual, no chat grouping
 */
export class ChatHistoryStorage {
    private context: vscode.ExtensionContext;
    private config: vscode.WorkspaceConfiguration;
    private readonly options: Required<ChatHistoryStorageOptions>;

    constructor(context: vscode.ExtensionContext, options: ChatHistoryStorageOptions = {}) {
        this.context = context;
        this.config = vscode.workspace.getConfiguration('seamless-agent');
        this.options = {
            now: options.now ?? (() => Date.now()),
            whiteboardSessionMaxAgeMs: options.whiteboardSessionMaxAgeMs ?? DEFAULT_WHITEBOARD_SESSION_MAX_AGE_MS,
            maxStorageBytes: options.maxStorageBytes ?? DEFAULT_STORAGE_QUOTA_BYTES,
            quotaCleanupThreshold: options.quotaCleanupThreshold ?? DEFAULT_STORAGE_QUOTA_THRESHOLD,
        };
    }

    // ========================
    // Interaction Methods
    // ========================


    get storage(): vscode.Memento {
        if (getStorageContext() === 'workspace') {
            return this.context.workspaceState;
        }
        return this.context.globalState;
    }

    /**
     * Get all interactions, sorted by timestamp (most recent first)
     */
    getAllInteractions(): StoredInteraction[] {
        const interactions = [...this.storage.get<StoredInteraction[]>(STORAGE_KEYS.INTERACTIONS, [])];
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
     * Get a pending interaction by ID
     * Only returns if the interaction is still pending
     **/
    getPendingInteraction(interactionId: string): StoredInteraction | undefined {
        const interaction = this.getInteraction(interactionId);
        if (interaction && isPendingStoredInteraction(interaction)) {
            return interaction;
        }
    }

    /**
     * Save a new ask_user interaction
     */
    saveAskUserInteraction(data: {
        question: string;
        title?: string;
        agentName?: string;
        response?: string;
        attachments?: import('../webview/types').AttachmentInfo[];
        options?: import('../webview/types').AskUserOptions;
        selectedOptionLabels?: Record<string, string[]>;
        isDebug?: boolean;
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
            options: data.options,
            selectedOptionLabels: data.selectedOptionLabels,
            isDebug: data.isDebug,
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
        isDebug?: boolean;
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
            isDebug: data.isDebug,
        };

        this.saveInteraction(interaction);
        return interactionId;
    }

    /**
     * Save a new whiteboard interaction
     */
    saveWhiteboardInteraction(data: {
        title?: string;
        context?: string;
        canvases?: WhiteboardCanvas[];
        activeCanvasId?: string;
        status?: WhiteboardSessionStatus;
        submittedAt?: number;
        submittedCanvases?: WhiteboardSubmittedCanvas[];
        isDebug?: boolean;
    }): string {
        const interactionId = this.generateId('wb');
        const interaction: StoredInteraction = {
            id: interactionId,
            type: 'whiteboard',
            timestamp: Date.now(),
            title: data.title,
            isDebug: data.isDebug,
            whiteboardSession: {
                id: interactionId,
                interactionId,
                context: data.context,
                title: data.title,
                canvases: data.canvases || [],
                activeCanvasId: data.activeCanvasId,
                status: data.status || 'pending',
                submittedAt: data.submittedAt,
                submittedCanvases: data.submittedCanvases,
            },
        };

        this.saveInteraction(interaction);
        return interactionId;
    }

    /**
     * Save a new renderUI interaction
     */
    saveRenderUIInteraction(data: {
        title?: string;
        surfaceId: string;
        components?: unknown[];
        dataModel?: Record<string, unknown>;
        userAction?: { name: string; data: Record<string, unknown> };
        dismissed?: boolean;
        renderErrors?: Array<{ source: string; message: string }>;
        isDebug?: boolean;
    }): string {
        const interactionId = this.generateId('ui');
        const interaction: StoredInteraction = {
            id: interactionId,
            type: 'renderUI',
            timestamp: Date.now(),
            title: data.title,
            isDebug: data.isDebug,
            renderUISession: {
                id: interactionId,
                interactionId,
                title: data.title,
                surfaceId: data.surfaceId,
                components: data.components,
                dataModel: data.dataModel,
                userAction: data.userAction,
                dismissed: data.dismissed ?? false,
                renderErrors: data.renderErrors,
            },
        };

        this.saveInteraction(interaction);
        return interactionId;
    }

    /**
     * Save an interaction to storage
     */
    private saveInteraction(interaction: StoredInteraction): void {
        const interactions = [...this.storage.get<StoredInteraction[]>(STORAGE_KEYS.INTERACTIONS, [])];
        const existingIndex = interactions.findIndex(i => i.id === interaction.id);

        if (existingIndex >= 0) {
            interactions[existingIndex] = interaction;
        } else {
            interactions.push(interaction);
        }

        this.storage.update(STORAGE_KEYS.INTERACTIONS, this.prepareInteractionsForStorage(interactions));
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
     * Update an existing whiteboard interaction by merging whiteboard session fields.
     */
    updateWhiteboardInteraction(interactionId: string, updates: {
        title?: string;
        whiteboardSession?: Partial<NonNullable<StoredInteraction['whiteboardSession']>>;
    }): void {
        const interaction = this.getInteraction(interactionId);
        if (!interaction) {
            Logger.warn(`Cannot update missing whiteboard interaction: ${interactionId}`);
            return;
        }

        if (interaction.type !== 'whiteboard') {
            Logger.warn(`Cannot update non-whiteboard interaction as whiteboard: ${interactionId}`);
            return;
        }

        const updatedSession = updates.whiteboardSession
            ? {
                ...(interaction.whiteboardSession || {
                    id: interactionId,
                    interactionId,
                    canvases: [],
                    status: 'pending' as const,
                }),
                ...updates.whiteboardSession,
            }
            : interaction.whiteboardSession;

        this.saveInteraction({
            ...interaction,
            ...(updates.title !== undefined ? { title: updates.title } : {}),
            ...(updatedSession ? { whiteboardSession: updatedSession } : {}),
        });
    }

    /**
     * Get a whiteboard session by interaction ID.
     */
    getWhiteboardSession(interactionId: string): WhiteboardSession | undefined {
        const interaction = this.getInteraction(interactionId);
        if (!interaction || interaction.type !== 'whiteboard') {
            return undefined;
        }

        return interaction.whiteboardSession;
    }

    /**
     * Update the stored whiteboard session for a whiteboard interaction.
     */
    updateWhiteboardSession(interactionId: string, updates: Partial<WhiteboardSession>): void {
        this.updateWhiteboardInteraction(interactionId, {
            whiteboardSession: updates,
        });
    }

    /**
     * Remove stale whiteboard sessions that were abandoned and never submitted.
     */
    cleanupOldWhiteboardSessions(): void {
        const interactions = [...this.storage.get<StoredInteraction[]>(STORAGE_KEYS.INTERACTIONS, [])];
        const cleanedInteractions = this.pruneOldWhiteboardSessions(interactions);

        if (cleanedInteractions.length !== interactions.length) {
            this.storage.update(STORAGE_KEYS.INTERACTIONS, cleanedInteractions);
        }
    }

    /**
     * Delete an interaction
     */
    deleteInteraction(interactionId: string): void {
        const interactions = this.getAllInteractions().filter(i => i.id !== interactionId);
        this.storage.update(STORAGE_KEYS.INTERACTIONS, interactions);
    }

    /**
     * Delete multiple interactions at once
     */
    deleteMultipleInteractions(interactionIds: string[]): void {
        const idsToDelete = new Set(interactionIds);
        const interactions = this.getAllInteractions().filter(i => !idsToDelete.has(i.id));
        this.storage.update(STORAGE_KEYS.INTERACTIONS, interactions);
    }

    /**
     * Clear all completed interactions (preserves pending items)
     * Pending items can only be removed via the cancel command
     */
    clearAll(): void {
        const allInteractions = this.getAllInteractions();
        // Keep only pending interactions - they should only be cancelled via command
        const pendingInteractions = allInteractions.filter(isPendingStoredInteraction);
        this.storage.update(STORAGE_KEYS.INTERACTIONS, pendingInteractions);
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
     * Get all pending whiteboard interactions.
     */
    getPendingWhiteboards(): StoredInteraction[] {
        return this.getAllInteractions()
            .filter(i => i.type === 'whiteboard' && isPendingStoredInteraction(i));
    }

    /**
     * Get all completed interactions (not pending)
     */
    getCompletedInteractions(): StoredInteraction[] {
        return this.getAllInteractions()
            .filter(isCompletedStoredInteraction);
    }

    /**
     * Get interactions by type
     */
    getInteractionsByType(type: 'ask_user' | 'plan_review' | 'whiteboard' | 'renderUI'): StoredInteraction[] {
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

    private prepareInteractionsForStorage(interactions: StoredInteraction[]): StoredInteraction[] {
        const totalSize = this.getSerializedSize(interactions);
        if (totalSize <= this.getQuotaCleanupThresholdBytes()) {
            return interactions;
        }

        const cleanedInteractions = this.pruneOldWhiteboardSessions(interactions);
        const removedCount = interactions.length - cleanedInteractions.length;

        if (removedCount > 0) {
            Logger.warn(
                `Whiteboard storage quota threshold reached (${totalSize} bytes); cleaned ${removedCount} stale session(s).`
            );
        } else {
            Logger.warn(
                `Whiteboard storage quota threshold reached (${totalSize} bytes); no stale whiteboard sessions were eligible for cleanup.`
            );
        }

        const cleanedSize = this.getSerializedSize(cleanedInteractions);
        if (cleanedSize > this.options.maxStorageBytes) {
            const message = `Whiteboard storage quota exceeded (${cleanedSize} bytes after cleanup; limit ${this.options.maxStorageBytes}); refusing to persist oversized payload.`;
            Logger.error(message);
            throw new StorageQuotaExceededError(message);
        }

        return cleanedInteractions;
    }

    private pruneOldWhiteboardSessions(interactions: StoredInteraction[]): StoredInteraction[] {
        const staleBefore = this.options.now() - this.options.whiteboardSessionMaxAgeMs;
        return interactions.filter((interaction) => !this.shouldCleanupWhiteboardInteraction(interaction, staleBefore));
    }

    private shouldCleanupWhiteboardInteraction(interaction: StoredInteraction, staleBefore: number): boolean {
        if (interaction.type !== 'whiteboard') {
            return false;
        }

        if (interaction.timestamp >= staleBefore) {
            return false;
        }

        const session = interaction.whiteboardSession;
        if (!session) {
            return true;
        }

        if (session.status === 'approved' || session.status === 'recreateWithChanges' || session.status === 'cancelled') {
            return false;
        }

        return (session.submittedCanvases?.length ?? 0) === 0;
    }

    private getQuotaCleanupThresholdBytes(): number {
        return Math.floor(this.options.maxStorageBytes * this.options.quotaCleanupThreshold);
    }

    private getSerializedSize(interactions: StoredInteraction[]): number {
        return JSON.stringify(interactions).length;
    }
}

// Singleton instance
let storageInstance: ChatHistoryStorage | undefined;
let extensionContextInstance: vscode.ExtensionContext | undefined;

/**
 * Initialize the storage with extension context
 */
export function initializeChatHistoryStorage(context: vscode.ExtensionContext): ChatHistoryStorage {
    extensionContextInstance = context;
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

export function getExtensionContext(): vscode.ExtensionContext {
    if (!extensionContextInstance) {
        throw new Error('Extension context not initialized. Call initializeChatHistoryStorage first.');
    }
    return extensionContextInstance;
}
