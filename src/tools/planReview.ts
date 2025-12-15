import * as vscode from 'vscode';
import { PlanReviewPanel } from '../webview/planReviewPanel';
import type { PlanReviewOptions } from '../webview/types';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { getChatHistoryStorage } from '../storage/chatHistoryStorage';
import { PlanReviewInput, PlanReviewToolResult, WalkthroughReviewInput } from './schemas';

export type PlanReviewApprovalInput = Pick<PlanReviewInput, 'plan' | 'title' | 'chatId'>;

/**
 * Core logic for plan review with extended modes
 * Supports: review, summary, progress, walkthrough, display
 * All modes support user comments
 */
export async function planReview(
    params: PlanReviewInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken
): Promise<PlanReviewToolResult> {
    const plan = params.plan;
    const title = params.title || 'Plan Review';
    const mode = params.mode || 'review';

    // Check if already cancelled
    if (token.isCancellationRequested) {
        return { status: 'cancelled', requiredRevisions: [], reviewId: '' };
    }

    // Get or initialize storage
    const storage = getChatHistoryStorage();

    // Save the interaction as pending (no chatId needed - each interaction is individual)
    const interactionId = storage.savePlanReviewInteraction({
        plan,
        title,
        mode,
        status: 'pending',
        requiredRevisions: []
    });

    console.log('[Seamless Agent] planReview saved with interactionId:', interactionId);

    // Refresh the webview to show the pending plan in the list
    provider.refreshHome();

    // Register cancellation handler - if agent stops, mark as cancelled
    const cancellationDisposable = token.onCancellationRequested(() => {
        console.log('[Seamless Agent] planReview cancelled by agent, closing:', interactionId);

        storage.updateInteraction(interactionId, { status: 'closed' });
        // Also close the panel if it's open
        PlanReviewPanel.closeIfOpen(interactionId);
        // Refresh webview to remove from pending list
        provider.refreshHome();
    });

    try {
        // Prepare options for the panel
        const options: PlanReviewOptions = {
            plan,
            title,
            mode,
            readOnly: false,
            existingComments: [],
            interactionId
        };

        // Show the plan review panel
        const result = await PlanReviewPanel.showWithOptions(context.extensionUri, options);


        const interactionState = ['approved', 'recreateWithChanges', 'acknowledged'].includes(result.action)
            ? result.action : 'closed'

        // Update the stored interaction with the result
        storage.updateInteraction(interactionId, {
            status: interactionState,
            requiredRevisions: result.requiredRevisions
        });

        // Refresh webview to update the pending list
        provider.refreshHome();

        // Map action to status for LLM response
        const status: 'approved' | 'recreateWithChanges' | 'cancelled' = [
            'approved',
            'recreateWithChanges',
            'cancelled'
        ].includes(result.action)
            ? result.action as 'approved' | 'recreateWithChanges' | 'cancelled'
            : 'cancelled';

        return {
            status,
            requiredRevisions: result.requiredRevisions,
            reviewId: interactionId
        };
    } catch (error) {
        console.error('Error showing plan review panel:', error);

        // Mark as closed on error
        storage.updateInteraction(interactionId, { status: 'closed' });
        // Refresh webview
        provider.refreshHome();

        return { status: 'cancelled', requiredRevisions: [], reviewId: '' };
    } finally {
        // Clean up cancellation listener
        cancellationDisposable.dispose();
    }
}

/**
 * Wrapper: explicit plan approval (review mode)
 */
export async function planReviewApproval(
    params: PlanReviewApprovalInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken
): Promise<PlanReviewToolResult> {
    return planReview(
        {
            plan: params.plan,
            title: params.title,
            mode: 'review',
            chatId: params.chatId
        },
        context,
        provider,
        token
    );
}

/**
 * Wrapper: explicit walkthrough review mode
 */
export async function walkthroughReview(
    params: WalkthroughReviewInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken
): Promise<PlanReviewToolResult> {
    return planReview(
        {
            plan: params.plan,
            title: params.title,
            mode: 'walkthrough',
            chatId: params.chatId
        },
        context,
        provider,
        token
    );
}
