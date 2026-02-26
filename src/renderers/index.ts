/**
 * Central registration for all Chat Output Renderers.
 * 
 * Called from `activate()` in extension.ts. Feature-gated behind a
 * runtime check for the proposed `chatOutputRenderer` API.
 */

import * as vscode from 'vscode';
import { registerAskUserRenderer } from './askUserRenderer';
import { registerPlanReviewRenderer } from './planReviewRenderer';

/**
 * Registers all chat output renderers if the proposed API is available.
 * 
 * On VS Code versions without the `chatOutputRenderer` proposal,
 * this function is a no-op — the existing text-based output continues to work.
 */
export function registerChatOutputRenderers(context: vscode.ExtensionContext): void {
    // Feature gate: check if the proposed API exists
    if (typeof vscode.chat?.registerChatOutputRenderer !== 'function') {
        console.log('Chat Output Renderer API not available — using text-only output');
        return;
    }

    console.log('Registering chat output renderers');

    const askUserDisposable = registerAskUserRenderer();
    const planReviewDisposable = registerPlanReviewRenderer();

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(
        askUserDisposable,
        planReviewDisposable
    );

    console.log('Chat output renderers registered successfully');
}
