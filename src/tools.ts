import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { strings } from './localization';
import { AgentInteractionProvider, AttachmentInfo, UserResponseResult } from './webview/webviewProvider';
import { ApprovePlanPanel, ApprovePlanResult, PlanComment } from './webview/approvePlanPanel';


export interface Input {
    question: string;
    title?: string;
    agentName?: string;
}

export interface ApprovePlanInput {
    plan: string;
    title?: string;
}

// Result structure returned to the AI
export interface AskUserToolResult {
    responded: boolean;
    response: string;
    attachments: string[];  // Array of file URIs
}

// Result structure for approve_plan tool
export interface ApprovePlanToolResult {
    approved: boolean;
    comments: PlanComment[];
}

/**
 * Reads a file as Uint8Array for efficient binary handling
 */
async function readFileAsBuffer(filePath: string): Promise<Uint8Array> {
    const buffer = await fs.promises.readFile(filePath);
    return new Uint8Array(buffer);
}

/**
 * Gets the MIME type for an image file based on its extension
 */
function getImageMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Validates that image file content matches its claimed MIME type using magic numbers
 * This provides additional security against files with spoofed extensions
 */
function validateImageMagicNumber(buffer: Uint8Array, mimeType: string): boolean {
    if (buffer.length < 8) return false;

    // Magic number signatures for common image formats
    const signatures: Record<string, number[][]> = {
        'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        'image/jpeg': [[0xFF, 0xD8, 0xFF]],
        'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a, GIF89a
        'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF....WEBP)
        'image/bmp': [[0x42, 0x4D]], // BM
        'image/x-icon': [[0x00, 0x00, 0x01, 0x00], [0x00, 0x00, 0x02, 0x00]], // ICO, CUR
        'image/tiff': [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]], // Little-endian, Big-endian
    };

    // SVG is text-based, check for XML/SVG start
    if (mimeType === 'image/svg+xml') {
        const text = new TextDecoder().decode(buffer.slice(0, 500));
        return text.includes('<svg') || text.includes('<?xml');
    }

    const expectedSignatures = signatures[mimeType];
    if (!expectedSignatures) {
        // Unknown MIME type - allow but log warning
        console.warn(`No magic number validation for MIME type: ${mimeType}`);
        return true;
    }

    // Check if buffer starts with any of the expected signatures
    for (const signature of expectedSignatures) {
        let matches = true;
        for (let i = 0; i < signature.length; i++) {
            if (buffer[i] !== signature[i]) {
                matches = false;
                break;
            }
        }
        if (matches) return true;
    }

    return false;
}

/**
 * Registers the native VS Code LM Tools
 */
export function registerNativeTools(context: vscode.ExtensionContext, provider: AgentInteractionProvider) {

    // Register the tool defined in package.json
    const confirmationTool = vscode.lm.registerTool('ask_user', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<Input>, token: vscode.CancellationToken) {
            const params = options.input;

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
        }
    });

    // Register the approve_plan tool
    const approvePlanTool = vscode.lm.registerTool('approve_plan', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<ApprovePlanInput>, token: vscode.CancellationToken) {
            const params = options.input;

            // Show the approve plan panel and wait for user response
            const result = await approvePlan(params, context, token);

            // Return result to the AI
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result))
            ]);
        }
    });

    (context.subscriptions as unknown as Array<vscode.Disposable>).push(confirmationTool, approvePlanTool);
}

/**
 * Core logic to ask user, reusable by MCP server
 */
export async function askUser(
    params: Input,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken
): Promise<AskUserToolResult> {
    const question = params.question;
    const agentName = params.agentName || 'Agent';
    const baseTitle = params.title || strings.confirmationRequired;
    const title = `${agentName}: ${baseTitle}`;

    // Generate request ID to track this specific request
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Register cancellation handler - if agent stops, cancel the request
    const cancellationDisposable = token.onCancellationRequested(() => {
        provider.cancelRequest(requestId, 'Agent stopped the request');
    });

    try {
        // Execute Logic - Try webview first, fall back to VS Code dialogs
        const result = await askViaWebview(provider, question, title, requestId, token);

        return {
            responded: result.responded,
            response: result.responded ? result.response : 'Request was cancelled',
            attachments: result.attachments.map(att => att.uri)
        };
    } finally {
        // Clean up cancellation listener
        cancellationDisposable.dispose();
    }
}

/**
 * Shows the question in the Agent Console webview panel
 * Falls back to VS Code dialogs if the webview is not available
 */
async function askViaWebview(
    provider: AgentInteractionProvider,
    question: string,
    title: string,
    requestId: string,
    token: vscode.CancellationToken
): Promise<UserResponseResult> {
    // Check if already cancelled
    if (token.isCancellationRequested) {
        return { responded: false, response: 'Request was cancelled', attachments: [] };
    }

    // Create a promise that rejects on cancellation
    return new Promise<UserResponseResult>((resolve) => {
        // Listen for cancellation
        const cancellationListener = token.onCancellationRequested(() => {
            // Try to find and cancel this request in the provider
            const pendingRequests = provider.getPendingRequests();
            const thisRequest = pendingRequests.find(r =>
                r.question === question && r.title === title
            );
            if (thisRequest) {
                provider.cancelRequest(thisRequest.id, 'Agent stopped the request');
            }
            cancellationListener.dispose();
            resolve({ responded: false, response: 'Request was cancelled', attachments: [] });
        });

        // Start the actual request
        provider.waitForUserResponse(question, title).then(result => {
            cancellationListener.dispose();

            // If webview wasn't available, fall back to the old dialog approach
            if (!result.responded && result.response === 'Agent Console view is not available.') {
                askViaVSCode(question, title).then(fallbackResult => {
                    resolve({ ...fallbackResult, attachments: [] });
                });
                return;
            }

            resolve(result);
        });
    });
}

/**
 * Shows a visible warning notification, then opens the input box
 * (Fallback method when webview is not available)
 */
async function askViaVSCode(question: string, title: string): Promise<{ responded: boolean; response: string }> {
    const buttonText = strings.respond;

    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');

    const selection = await vscode.window.showWarningMessage(
        `${strings.confirmationRequired}: ${question}`,
        { modal: false },
        buttonText
    );

    // If user dismissed notification
    if (selection !== buttonText) {
        return { responded: false, response: '' };
    }

    // Show Input Box
    const response = await vscode.window.showInputBox({
        title: title,
        prompt: question,
        placeHolder: strings.inputPlaceholder,
        ignoreFocusOut: true
    });

    if (response === undefined) {
        return { responded: false, response: '' };
    }

    return { responded: response.trim().length > 0, response };
}

/**
 * Core logic to approve plan, opens a webview panel for user review
 */
export async function approvePlan(
    params: ApprovePlanInput,
    context: vscode.ExtensionContext,
    token: vscode.CancellationToken
): Promise<ApprovePlanToolResult> {
    const plan = params.plan;
    const title = params.title || 'Review Plan';

    // Check if already cancelled
    if (token.isCancellationRequested) {
        return { approved: false, comments: [] };
    }

    try {
        // Show the approve plan panel
        const result = await ApprovePlanPanel.show(context.extensionUri, plan, title);

        return {
            approved: result.approved,
            comments: result.comments
        };
    } catch (error) {
        console.error('Error showing approve plan panel:', error);
        return { approved: false, comments: [] };
    }
}
