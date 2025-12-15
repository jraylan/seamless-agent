import * as vscode from 'vscode';

import { AgentInteractionProvider } from '../webview/webviewProvider';
import { initializeChatHistoryStorage } from '../storage/chatHistoryStorage';

// Re-export schemas and types
export * from './schemas';
export * from './taskListSchemas';

// Re-export tool functions
export { askUser } from './askUser';
export { planReview, planReviewApproval, walkthroughReview } from './planReview';
export { initializeTaskListStorage, getTaskListStorage } from './taskList';
export { createTaskList, getNextTask, updateTaskStatus, closeTaskList } from './taskListFlow';

// Re-export utils
export * from './utils';

// Import for internal use
import { askUser } from './askUser';
import { planReviewApproval, walkthroughReview } from './planReview';
import { initializeTaskListStorage } from './taskList';
import { createTaskList, getNextTask, updateTaskStatus, closeTaskList } from './taskListFlow';
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


import {
    CreateTaskListInput,
    GetNextTaskInput,
    UpdateTaskStatusInput,
    CloseTaskListInput,
    parseCreateTaskListInput,
    parseGetNextTaskInput,
    parseUpdateTaskStatusInput,
    parseCloseTaskListInput
} from './taskListFlowSchemas';

/**
 * Registers the native VS Code LM Tools
 */
export function registerNativeTools(context: vscode.ExtensionContext, provider: AgentInteractionProvider) {

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

    // New Task List Flow Tools (recommended)
    const createTaskListTool = vscode.lm.registerTool('createTaskList', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<CreateTaskListInput>, _token: vscode.CancellationToken) {
            let params: CreateTaskListInput;
            try {
                params = parseCreateTaskListInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ error: `Validation error: ${errorMessage}` }))
                ]);
            }

            const result = await createTaskList(params, context, provider);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    const getNextTaskTool = vscode.lm.registerTool('getNextTask', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<GetNextTaskInput>, _token: vscode.CancellationToken) {
            let params: GetNextTaskInput;
            try {
                params = parseGetNextTaskInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ error: `Validation error: ${errorMessage}` }))
                ]);
            }

            const result = await getNextTask(params, context, provider);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    const updateTaskStatusTool = vscode.lm.registerTool('updateTaskStatus', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<UpdateTaskStatusInput>, _token: vscode.CancellationToken) {
            let params: UpdateTaskStatusInput;
            try {
                params = parseUpdateTaskStatusInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ error: `Validation error: ${errorMessage}` }))
                ]);
            }

            const result = await updateTaskStatus(params, context, provider);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    const closeTaskListTool = vscode.lm.registerTool('closeTaskList', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<CloseTaskListInput>, _token: vscode.CancellationToken) {
            let params: CloseTaskListInput;
            try {
                params = parseCloseTaskListInput(options.input);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Invalid input';
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({ error: `Validation error: ${errorMessage}` }))
                ]);
            }

            const result = await closeTaskList(params, context, provider);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(
        confirmationTool,
        approvePlanTool,
        planReviewTool,
        walkthroughReviewTool,
        createTaskListTool,
        getNextTaskTool,
        updateTaskStatusTool,
        closeTaskListTool
    );

    // Initialize chat history storage
    initializeChatHistoryStorage(context);

    // Initialize task list storage
    initializeTaskListStorage(context);
}
