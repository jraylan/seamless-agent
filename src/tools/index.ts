import * as vscode from 'vscode';

import { AgentInteractionProvider } from '../webview/webviewProvider';
import { initializeChatHistoryStorage } from '../storage/chatHistoryStorage';

// Re-export schemas and types
export * from './schemas';

// Re-export tool functions
export { askUser } from './askUser';
export { planReview, planReviewApproval, walkthroughReview } from './planReview';
export { openWhiteboard } from './openWhiteboard';
export { renderUI } from './renderUI';

// Re-export utils
export * from './utils';

// Import for internal use
import { askUser } from './askUser';
import { planReviewApproval, walkthroughReview } from './planReview';
import { openWhiteboard } from './openWhiteboard';
import { renderUI } from './renderUI';
import { readFileAsBuffer, getImageMimeType, validateImageMagicNumber } from './utils';
import { createWhiteboardLanguageModelResultParts } from './whiteboardToolResult';
import {
    AskUserInput,
    ApprovePlanInput,
    PlanReviewInput,
    WalkthroughReviewInput,
    WhiteboardInput,
    RenderUIInput,
    parseAskUserInput,
    parseApprovePlanInput,
    parsePlanReviewInput,
    parseWalkthroughReviewInput,
    parseWhiteboardInput,
    parseRenderUIInput,
} from './schemas';
import { Logger } from '../logging';

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
                    Logger.log('[LM Tools] Parsed options from JSON string (LLM serialization workaround):', parsed);
                    input = { ...input, options: parsed };
                } catch (e) {
                    Logger.warn('[LM Tools] Failed to parse options as JSON string, validation may fail:', e);
                }
            }

            // Validate input with Zod
            let params: AskUserInput;
            try {
                params = parseAskUserInput(input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                const retryGuidance = "Retry with corrected ask_user options shape: keep 'label' concise and move long explanatory text to 'description'.";
                const errorParts: (vscode.LanguageModelTextPart)[] = [
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        responded: false,
                        response: `Validation error: ${errorMessage}. ${retryGuidance}`,
                        attachments: []
                    }))
                ];
                const errorAppendText = vscode.workspace.getConfiguration('seamless-agent').get<string>('askUserAppendText', '');
                if (errorAppendText) {
                    errorParts.push(new vscode.LanguageModelTextPart(errorAppendText));
                }
                return new vscode.LanguageModelToolResult(errorParts);
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
                                Logger.warn(`Image file ${filePath} does not match expected format for ${mimeType}`);
                                return null;
                            }

                            return vscode.LanguageModelDataPart.image(data, mimeType);
                        }

                        return null;
                    } catch (error) {
                        Logger.error('Failed to read image attachment:', error);
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

            // Append user-configured text as a separate tool result part
            const appendText = vscode.workspace.getConfiguration('seamless-agent').get<string>('askUserAppendText', '');
            if (appendText) {
                resultParts.push(new vscode.LanguageModelTextPart(appendText));
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
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    // Register the open_whiteboard tool (standalone whiteboard)
    const openWhiteboardTool = vscode.lm.registerTool('open_whiteboard', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<WhiteboardInput>, token: vscode.CancellationToken) {
            let params: WhiteboardInput;
            try {
                params = parseWhiteboardInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        submitted: false,
                        canvases: [],
                        interactionId: '',
                        error: `Validation error: ${errorMessage}`
                    }))
                ]);
            }

            const result = await openWhiteboard(params, context, provider, token);
            const resultParts = await createWhiteboardLanguageModelResultParts(result);

            return new vscode.LanguageModelToolResult(resultParts.map((part) =>
                new vscode.LanguageModelTextPart(part.value)
            ));
        },
        prepareInvocation(options) {
            return {
                invocationMessage: options.input.title || 'Open whiteboard'
            };
        },
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

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    // Register the render_ui tool (Phase 2 A2UI surface rendering)
    const renderUITool = vscode.lm.registerTool('render_ui', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<RenderUIInput>, token: vscode.CancellationToken) {
            let params: RenderUIInput;
            try {
                params = parseRenderUIInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        surfaceId: '',
                        rendered: false,
                        error: `Validation error: ${errorMessage}`,
                    }))
                ]);
            }

            const result = await renderUI(params, context, provider, token);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        },
        prepareInvocation(options) {
            return {
                invocationMessage: options.input.title || 'Render UI surface'
            };
        },
    });

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(
        confirmationTool,
        approvePlanTool,
        planReviewTool,
        openWhiteboardTool,
        walkthroughReviewTool,
        renderUITool,
    );

    // Initialize chat history storage
    initializeChatHistoryStorage(context);
}
