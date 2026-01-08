import * as vscode from 'vscode';

import { AgentInteractionProvider } from '../webview/webviewProvider';
import { initializeChatHistoryStorage } from '../storage/chatHistoryStorage';

// Re-export schemas and types
export * from './schemas';

// Re-export tool functions
export { askUser } from './askUser';
export { planReview, planReviewApproval, walkthroughReview } from './planReview';

// Re-export utils
export * from './utils';

// Import for internal use
import { askUser } from './askUser';
import { planReviewApproval, walkthroughReview } from './planReview';
import { readFileAsBuffer, getImageMimeType, validateImageMagicNumber } from './utils';
import {
    AskUserInput,
    ApprovePlanInput,
    PlanReviewInput,
    WalkthroughReviewInput,
    parseAskUserInput,
    parseApprovePlanInput,
    parsePlanReviewInput,
    parseWalkthroughReviewInput,
} from './schemas';
import { IExtensionCore } from '../core/types';

/**
 * Registers the native VS Code LM Tools
 */
export function registerNativeTools(core: IExtensionCore, provider: AgentInteractionProvider) {

    // Register the tool defined in package.json
    const confirmationTool = vscode.lm.registerTool('ask_user', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<AskUserInput>, token: vscode.CancellationToken) {
            // Validate input with Zod
            let params: AskUserInput;
            try {
                params = parseAskUserInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        responded: false,
                        response: `Validation error: ${errorMessage}`,
                        attachments: []
                    }))
                ]);
            }

            // Build result with attachments
            const result = await askUser(params, provider, token);

            // Build the result parts - text first, then any image attachments
            const resultParts: (vscode.LanguageModelTextPart | vscode.LanguageModelDataPart)[] = [
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ];

            // Add image attachments as LanguageModelDataPart for vision models
            // Process all images in parallel for better performance
            if (result.attachments && result.attachments.length > 0) {
                const imagePromises = result.attachments.map(async (uri) => {
                    try {
                        const fileUri = vscode.Uri.parse(uri);
                        const filePath = fileUri.fsPath;
                        const mimeType = getImageMimeType(filePath);

                        // Only process image files
                        if (mimeType !== 'application/octet-stream') {
                            const data = await readFileAsBuffer(filePath);

                            // Validate that file content matches claimed MIME type (security check)
                            if (!validateImageMagicNumber(data, mimeType)) {
                                console.warn(`Image file ${filePath} does not match expected format for ${mimeType}`);
                                return null;
                            }

                            return vscode.LanguageModelDataPart.image(data, mimeType);
                        }

                        return null;
                    } catch (error) {
                        console.error('Failed to read image attachment:', error);
                        return null;
                    }
                });

                const imageParts = await Promise.all(imagePromises);

                // Filter out nulls and add valid image parts
                for (const part of imageParts) {
                    if (part !== null) {
                        resultParts.push(part);
                    }
                }
            }

            // Return result to the AI with both text and image parts
            return new vscode.LanguageModelToolResult(resultParts);
        },
        prepareInvocation(options) {
            return {
                invocationMessage: options.input.question
            };
        },
    });

    // Register the approve_plan tool (deprecated - calls planReview internally)
    const approvePlanTool = vscode.lm.registerTool('approve_plan', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<ApprovePlanInput>, token: vscode.CancellationToken) {
            // Validate input with Zod
            let params: ApprovePlanInput;
            try {
                params = parseApprovePlanInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        status: 'cancelled',
                        comments: [],
                        error: `Validation error: ${errorMessage}`
                    }))
                ]);
            }

            // Call plan review approval wrapper (approve_plan is deprecated)
            const result = await planReviewApproval(
                {
                    plan: params.plan,
                    title: params.title,
                    chatId: undefined
                },
                core,
                provider,
                token
            );

            // Return result to the AI (without reviewId for backwards compatibility)
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify({
                    status: result.status,
                    requiredRevisions: result.requiredRevisions
                }))
            ]);
        }
    });

    // Register the plan_review tool (explicit: plan approval)
    const planReviewTool = vscode.lm.registerTool('plan_review', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<PlanReviewInput>, token: vscode.CancellationToken) {
            // Validate input with Zod
            let params: PlanReviewInput;
            try {
                params = parsePlanReviewInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        status: 'cancelled',
                        comments: [],
                        reviewId: '',
                        error: `Validation error: ${errorMessage}`
                    }))
                ]);
            }

            const result = await planReviewApproval(
                {
                    plan: params.plan,
                    title: params.title,
                    chatId: params.chatId
                },
                core,
                provider,
                token
            );

            // Return result to the AI
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    // Register the walkthrough_review tool (explicit: walkthrough review mode)
    const walkthroughReviewTool = vscode.lm.registerTool('walkthrough_review', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<WalkthroughReviewInput>, token: vscode.CancellationToken) {
            let params: WalkthroughReviewInput;
            try {
                params = parseWalkthroughReviewInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        status: 'cancelled',
                        comments: [],
                        reviewId: '',
                        error: `Validation error: ${errorMessage}`
                    }))
                ]);
            }

            const result = await walkthroughReview(
                {
                    plan: params.plan,
                    title: params.title,
                    chatId: params.chatId
                },
                core,
                provider,
                token
            );

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    core.subscriptions.push(
        confirmationTool,
        approvePlanTool,
        planReviewTool,
        walkthroughReviewTool
    );

    // Initialize chat history storage
    initializeChatHistoryStorage(core);

    // Set up native tool functions in the API for addon access
    const api = core.getAPI();

    // Configure askUser implementation (internal - addons call api.tools.askUser())
    api._setAskUserFunction(async (params) => {
        const result = await askUser(
            { question: params.question, title: params.title, agentName: params.agentName },
            provider,
            new vscode.CancellationTokenSource().token
        );
        return result;
    });

    // Configure planReview implementation (internal - addons call api.tools.planReview())
    api._setPlanReviewFunction(async (params) => {
        const { planReviewApproval: planReviewFn } = await import('./planReview');
        const result = await planReviewFn(
            { plan: params.plan, title: params.title, chatId: params.chatId },
            core,
            provider,
            new vscode.CancellationTokenSource().token
        );
        return {
            status: result.status,
            requiredRevisions: result.requiredRevisions,
            reviewId: result.reviewId
        };
    });
    // Configure switchTab implementation (internal - addons call api.ui.selectTab())
    api._setSwitchTabFunction((tabId) => {
        provider.switchTab(tabId);
    });

    console.log('[Seamless Agent] Native tools registered and API functions configured');
}
