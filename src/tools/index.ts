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
    ASK_USER_RESULT_MIME,
    PLAN_REVIEW_RESULT_MIME,
} from './schemas';
import { AskUserRendererData, PlanReviewRendererData, encodeRendererData, truncatePlan } from '../renderers/types';
import { getImageMimeType as getMimeType } from './utils';

/**
 * Registers the native VS Code LM Tools
 */
export function registerNativeTools(context: vscode.ExtensionContext, provider: AgentInteractionProvider) {

    // Register the tool defined in package.json
    const confirmationTool = vscode.lm.registerTool('ask_user', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<AskUserInput>, token: vscode.CancellationToken) {
            let input = options.input;
            if (input.options && typeof input.options === 'string') {
                try {
                    const parsed = JSON.parse(input.options as string);
                    console.log('[LM Tools] Parsed options from JSON string (LLM serialization workaround):', parsed);
                    input = { ...input, options: parsed };
                } catch (e) {
                    console.warn('[LM Tools] Failed to parse options as JSON string, validation may fail:', e);
                }
            }

            // Validate input with Zod
            let params: AskUserInput;
            try {
                params = parseAskUserInput(input);
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
            const toolResult = new vscode.LanguageModelToolResult(resultParts);

            // Attach renderer data for Chat Output Renderer (rich inline card)
            try {
                const rendererData: AskUserRendererData = {
                    question: params.question,
                    response: result.response,
                    responded: result.responded,
                    agentName: params.agentName,
                    title: params.title,
                    timestamp: Date.now(),
                    attachments: (result.attachments || []).map(uri => {
                        const name = uri.split('/').pop() || uri;
                        const mime = getMimeType(vscode.Uri.parse(uri).fsPath);
                        return {
                            name,
                            uri,
                            isImage: mime !== 'application/octet-stream'
                        };
                    })
                };
                (toolResult as vscode.ExtendedLanguageModelToolResult2).toolResultDetails2 = {
                    mime: ASK_USER_RESULT_MIME,
                    value: encodeRendererData(rendererData)
                };
            } catch (e) {
                console.warn('Failed to attach renderer data to ask_user result:', e);
            }

            return toolResult;
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
                context,
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
                context,
                provider,
                token
            );

            // Return result to the AI
            const toolResult = new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);

            // Attach renderer data for Chat Output Renderer (rich inline card)
            try {
                const { content: planContent, truncated } = truncatePlan(params.plan);
                const rendererData: PlanReviewRendererData = {
                    title: params.title || 'Plan Review',
                    status: result.status,
                    mode: 'review',
                    plan: planContent,
                    timestamp: Date.now(),
                    requiredRevisions: result.requiredRevisions || [],
                    reviewId: result.reviewId
                };
                (toolResult as vscode.ExtendedLanguageModelToolResult2).toolResultDetails2 = {
                    mime: PLAN_REVIEW_RESULT_MIME,
                    value: encodeRendererData(rendererData)
                };
            } catch (e) {
                console.warn('Failed to attach renderer data to plan_review result:', e);
            }

            return toolResult;
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
                context,
                provider,
                token
            );

            const toolResult = new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);

            // Attach renderer data for Chat Output Renderer (rich inline card)
            try {
                const { content: planContent, truncated } = truncatePlan(params.plan);
                const rendererData: PlanReviewRendererData = {
                    title: params.title || 'Walkthrough Review',
                    status: result.status,
                    mode: 'walkthrough',
                    plan: planContent,
                    timestamp: Date.now(),
                    requiredRevisions: result.requiredRevisions || [],
                    reviewId: result.reviewId
                };
                (toolResult as vscode.ExtendedLanguageModelToolResult2).toolResultDetails2 = {
                    mime: PLAN_REVIEW_RESULT_MIME,
                    value: encodeRendererData(rendererData)
                };
            } catch (e) {
                console.warn('Failed to attach renderer data to walkthrough_review result:', e);
            }

            return toolResult;
        }
    });

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(
        confirmationTool,
        approvePlanTool,
        planReviewTool,
        walkthroughReviewTool
    );

    // Initialize chat history storage
    initializeChatHistoryStorage(context);
}
