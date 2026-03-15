import { fileURLToPath } from 'node:url';
import type * as vscode from 'vscode';
import {
    DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
    DEFAULT_WHITEBOARD_CANVAS_NAME,
    DEFAULT_WHITEBOARD_CANVAS_WIDTH,
    serializeBlankFabricCanvasState,
} from '../whiteboard/canvasState';
import {
    normalizeAndValidateLoadableFabricState,
    serializeSeedElementsAsFabricState,
} from '../whiteboard/seededCanvas';
import {
    mergeSubmittedWhiteboardCanvases,
    resolveWhiteboardSubmittedCanvases,
} from '../webview/types';
import type {
    WhiteboardCanvas,
    WhiteboardPanelOptions,
    WhiteboardPanelResult,
    WhiteboardReviewAction,
    WhiteboardSession,
    WhiteboardSessionStatus,
    WhiteboardSubmittedCanvas,
} from '../webview/types';
import type { AgentInteractionProvider } from '../webview/webviewProvider';
import type { WhiteboardExportedImage, WhiteboardInput, WhiteboardToolResult } from './schemas';
import { Logger } from '../logging';
import { getImageMimeType, readFileAsBuffer } from './utils/fileUtils';

export interface OpenWhiteboardDependencies {
    storage: {
        saveWhiteboardInteraction(data: {
            title?: string;
            context?: string;
            canvases?: WhiteboardCanvas[];
            activeCanvasId?: string;
            status?: WhiteboardSessionStatus;
            submittedAt?: number;
            submittedCanvases?: WhiteboardSubmittedCanvas[];
            isDebug?: boolean;
        }): Promise<string>;
        updateWhiteboardInteraction(interactionId: string, updates: {
            title?: string;
            whiteboardSession?: {
                status?: WhiteboardSessionStatus;
                submittedAt?: number;
                submittedCanvases?: WhiteboardSubmittedCanvas[];
                canvases?: WhiteboardCanvas[];
                activeCanvasId?: string;
            };
        }): void;
        getWhiteboardSession?(interactionId: string): WhiteboardSession | undefined;
    };
    panel: {
        showWithOptions(extensionUri: vscode.Uri, options: WhiteboardPanelOptions): Promise<WhiteboardPanelResult>;
        closeIfOpen(interactionId: string): boolean | Promise<boolean>;
    };
    now(): number;
}

export interface OpenWhiteboardExecutionOptions {
    isDebug?: boolean;
    dependencies?: Partial<OpenWhiteboardDependencies>;
}

function toWhiteboardSessionStatus(result: WhiteboardPanelResult): WhiteboardSessionStatus {
    if (!result.submitted) {
        return 'cancelled';
    }

    return result.action;
}

function toWhiteboardToolAction(result: WhiteboardPanelResult): WhiteboardReviewAction {
    return result.submitted ? result.action : 'cancelled';
}

function createWhiteboardInstruction(action: WhiteboardReviewAction): string {
    switch (action) {
        case 'approved':
            return 'The user approved the submitted whiteboard. Use the returned whiteboard images as confirmed visual input in your next response.';
        case 'recreateWithChanges':
            return 'The user requested changes to the submitted whiteboard. Address the annotated feedback and call open_whiteboard again with updated whiteboard images before concluding.';
        case 'cancelled':
        default:
            return 'The whiteboard was cancelled. Do not treat this submission as approved user input.';
    }
}

function createCanvasRecord(name: string, fabricState: string, index: number, now: number): WhiteboardCanvas {
    return {
        id: `canvas_${now}_${index + 1}`,
        name,
        fabricState,
        createdAt: now,
        updatedAt: now,
    };
}

function createImportedImageObject(
    image: NonNullable<WhiteboardInput['importImages']>[number],
    mimeType: string,
    dataUri: string,
    index: number,
): Record<string, unknown> {
    return {
        type: 'image',
        src: dataUri,
        left: 40 + (index % 3) * 80,
        top: 40 + index * 80,
        whiteboardId: `import_image_${index + 1}`,
        whiteboardObjectType: 'image',
        whiteboardSourceUri: image.uri,
        whiteboardMimeType: mimeType,
        ...(image.label ? { whiteboardLabel: image.label } : {}),
    };
}

async function createInitialCanvases(
    params: WhiteboardInput,
    now: number,
): Promise<WhiteboardCanvas[]> {
    const baseState = JSON.parse(serializeBlankFabricCanvasState()) as {
        version?: string;
        width?: number;
        height?: number;
        backgroundColor?: string;
        objects?: unknown[];
    };

    const initialCanvases = (params.initialCanvases ?? []).map((canvas, index) => createCanvasRecord(
        canvas.name,
        typeof canvas.fabricState === 'string'
            ? normalizeAndValidateLoadableFabricState(canvas.fabricState)
            : serializeSeedElementsAsFabricState(canvas.seedElements ?? []),
        index,
        now,
    ));

    const importedImages = params.importImages ?? [];
    if (importedImages.length === 0) {
        if (initialCanvases.length > 0) {
            return initialCanvases;
        }

        return [createCanvasRecord(DEFAULT_WHITEBOARD_CANVAS_NAME, JSON.stringify(baseState), 0, now)];
    }

    const objects: Record<string, unknown>[] = [];
    for (const [index, image] of importedImages.entries()) {
        let filePath: string;
        try {
            const parsedUri = new URL(image.uri);
            if (parsedUri.protocol !== 'file:') {
                throw new Error(`Import image uri must use the file scheme: ${image.uri}`);
            }
            filePath = fileURLToPath(parsedUri);
        } catch (error) {
            if (error instanceof Error && error.message.includes('Import image uri must use the file scheme')) {
                throw error;
            }
            throw new Error(`Import image uri must be a valid file URI: ${image.uri}`);
        }

        const mimeType = getImageMimeType(filePath);
        if (mimeType === 'application/octet-stream') {
            throw new Error(`Unsupported import image type: ${image.uri}`);
        }

        const fileData = await readFileAsBuffer(filePath);
        const dataUri = `data:${mimeType};base64,${Buffer.from(fileData).toString('base64')}`;
        objects.push(createImportedImageObject(image, mimeType, dataUri, index));
    }

    const importedImageCanvas = createCanvasRecord(
        initialCanvases.length > 0 ? 'Imported Images' : DEFAULT_WHITEBOARD_CANVAS_NAME,
        JSON.stringify({
            ...baseState,
            objects,
        }),
        initialCanvases.length,
        now,
    );

    return initialCanvases.length > 0
        ? [...initialCanvases, importedImageCanvas]
        : [importedImageCanvas];
}

function getCanvasDimensions(fabricState?: string): { width: number; height: number } {
    if (!fabricState) {
        return {
            width: DEFAULT_WHITEBOARD_CANVAS_WIDTH,
            height: DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
        };
    }

    try {
        const parsed = JSON.parse(fabricState) as { width?: unknown; height?: unknown };
        return {
            width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_WHITEBOARD_CANVAS_WIDTH,
            height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
        };
    } catch {
        return {
            width: DEFAULT_WHITEBOARD_CANVAS_WIDTH,
            height: DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
        };
    }
}

function resolveWhiteboardExportedImages(
    submittedCanvases: WhiteboardSubmittedCanvas[],
    resolvedCanvases: WhiteboardCanvas[],
): WhiteboardExportedImage[] {
    return submittedCanvases.map((canvas) => {
        const storedCanvas = resolvedCanvases.find((candidate) => candidate.id === canvas.id);
        const { width, height } = getCanvasDimensions(storedCanvas?.fabricState);
        return {
            canvasId: canvas.id,
            canvasName: canvas.name,
            imageUri: canvas.imageUri,
            width,
            height,
        };
    });
}

async function createDefaultDependencies(): Promise<OpenWhiteboardDependencies> {
    const [{ getChatHistoryStorage }, { WhiteboardPanel }] = await Promise.all([
        import('../storage/chatHistoryStorage'),
        import('../webview/whiteboardPanel'),
    ]);

    const storage = getChatHistoryStorage();
    return {
        storage: {
            saveWhiteboardInteraction: async (data) => await storage.saveWhiteboardInteraction(data),
            updateWhiteboardInteraction: async (interactionId, updates) => await storage.updateWhiteboardInteraction(interactionId, updates),
            getWhiteboardSession: (interactionId) => storage.getWhiteboardSession(interactionId),
        },
        panel: {
            showWithOptions: (extensionUri, options) => WhiteboardPanel.showWithOptions(extensionUri, options),
            closeIfOpen: (interactionId) => WhiteboardPanel.closeIfOpen(interactionId),
        },
        now: () => Date.now(),
    };
}

export async function openWhiteboard(
    params: WhiteboardInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider,
    token: vscode.CancellationToken,
    options: OpenWhiteboardExecutionOptions = {},
): Promise<WhiteboardToolResult> {
    if (token.isCancellationRequested) {
        return {
            submitted: false,
            action: 'cancelled',
            instruction: createWhiteboardInstruction('cancelled'),
            images: [],
            interactionId: '',
            userComment: undefined,
        };
    }

    const hasAllDependencies = Boolean(
        options.dependencies?.storage
        && options.dependencies?.panel
        && options.dependencies?.now,
    );
    const defaultDependencies = hasAllDependencies
        ? undefined
        : await createDefaultDependencies();
    const dependencies: OpenWhiteboardDependencies = {
        ...(defaultDependencies || {}),
        ...options.dependencies,
        storage: {
            ...(defaultDependencies?.storage || {}),
            ...options.dependencies?.storage,
        } as OpenWhiteboardDependencies['storage'],
        panel: {
            ...(defaultDependencies?.panel || {}),
            ...options.dependencies?.panel,
        } as OpenWhiteboardDependencies['panel'],
        now: options.dependencies?.now ?? defaultDependencies?.now ?? Date.now,
    };

    const now = dependencies.now();
    const title = params.title || 'Whiteboard';
    const canvases = await createInitialCanvases(params, now);
    const activeCanvasId = canvases[0]?.id;

    const interactionId = await dependencies.storage.saveWhiteboardInteraction({
        title,
        context: params.context,
        canvases,
        activeCanvasId,
        status: 'pending',
        isDebug: options.isDebug,
    });

    provider.refreshHome();

    const session = {
        id: interactionId,
        interactionId,
        context: params.context,
        title,
        canvases,
        activeCanvasId,
        status: 'pending' as const,
    };

    let cancelledByAgent = false;
    const cancellationDisposable = token.onCancellationRequested(async () => {
        cancelledByAgent = true;
        await dependencies.storage.updateWhiteboardInteraction(interactionId, {
            whiteboardSession: {
                status: 'cancelled',
            },
        });
        void dependencies.panel.closeIfOpen(interactionId);
        provider.refreshHome();
    });

    try {
        const result = await dependencies.panel.showWithOptions(context.extensionUri, {
            interactionId,
            title,
            session,
        });

        if (cancelledByAgent) {
            return {
                submitted: false,
                action: 'cancelled',
                instruction: createWhiteboardInstruction('cancelled'),
                images: [],
                interactionId,
                userComment: undefined,
            };
        }

        const latestSession = dependencies.storage.getWhiteboardSession?.(interactionId);
        const resolvedCanvases = result.submitted
            ? mergeSubmittedWhiteboardCanvases(result.canvases, latestSession?.canvases ?? session.canvases)
            : latestSession?.canvases ?? session.canvases;
        const submittedCanvases = result.submitted
            ? resolveWhiteboardSubmittedCanvases(result.canvases, resolvedCanvases)
            : [];

        const status = toWhiteboardSessionStatus(result);
        const action = toWhiteboardToolAction(result);
        const submittedAt = result.submitted ? dependencies.now() : undefined;

        await dependencies.storage.updateWhiteboardInteraction(interactionId, {
            whiteboardSession: {
                status,
                submittedAt,
                submittedCanvases,
                ...(result.submitted
                    ? {
                        canvases: resolvedCanvases,
                        activeCanvasId: latestSession?.activeCanvasId ?? session.activeCanvasId,
                    }
                    : {}),
            },
        });
        provider.refreshHome();

        return {
            submitted: result.submitted,
            action,
            instruction: createWhiteboardInstruction(action),
            images: resolveWhiteboardExportedImages(submittedCanvases, resolvedCanvases),
            interactionId,
            userComment: result.userComment,
        };
    } catch (error) {
        Logger.error('Error showing whiteboard panel:', error);
        if (!cancelledByAgent) {
            await dependencies.storage.updateWhiteboardInteraction(interactionId, {
                whiteboardSession: {
                    status: 'cancelled',
                },
            });
            provider.refreshHome();
        }
        return {
            submitted: false,
            action: 'cancelled',
            instruction: createWhiteboardInstruction('cancelled'),
            images: [],
            interactionId,
            userComment: undefined,
        };
    } finally {
        cancellationDisposable.dispose();
    }
}
