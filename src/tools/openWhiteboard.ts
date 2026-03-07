import type * as vscode from 'vscode';
import {
    DEFAULT_WHITEBOARD_CANVAS_NAME,
    serializeBlankFabricCanvasState,
} from '../whiteboard/canvasState';
import {
    createEmptyWhiteboardSceneSummary,
    summarizeWhiteboardScene,
} from '../whiteboard/sceneSummary';
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
import {
    WHITEBOARD_EXPLICIT_BLANK_MESSAGE,
} from './schemas';
import type { WhiteboardInput, WhiteboardToolResult } from './schemas';
import { Logger } from '../logging';

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
        }): string;
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
            return 'The user approved the submitted whiteboard. Use the sceneSummary and submitted canvases as confirmed input in your next response.';
        case 'recreateWithChanges':
            return 'The user requested changes to the submitted whiteboard. Address the annotated feedback and call open_whiteboard again with an updated sketch before concluding.';
        case 'cancelled':
        default:
            return 'The whiteboard was cancelled. Do not treat this submission as approved user input.';
    }
}

function createCanvas(
    initialCanvas: NonNullable<WhiteboardInput['initialCanvases']>[number],
    index: number,
    now: number,
): WhiteboardCanvas {
    const fabricState = initialCanvas.seedElements
        ? serializeSeedElementsAsFabricState(initialCanvas.seedElements)
        : normalizeAndValidateLoadableFabricState(initialCanvas.fabricState ?? '');

    return {
        id: `canvas_${now}_${index + 1}`,
        name: initialCanvas.name,
        fabricState,
        createdAt: now,
        updatedAt: now,
    };
}

function createInitialCanvasSeed(params: WhiteboardInput): NonNullable<WhiteboardInput['initialCanvases']> {
    if (params.initialCanvases?.length) {
        return params.initialCanvases;
    }

    if (params.blankCanvas !== true) {
        throw new Error(WHITEBOARD_EXPLICIT_BLANK_MESSAGE);
    }

    return [
        {
            name: DEFAULT_WHITEBOARD_CANVAS_NAME,
            fabricState: serializeBlankFabricCanvasState(),
        }
    ];
}

async function createDefaultDependencies(): Promise<OpenWhiteboardDependencies> {
    const [{ getChatHistoryStorage }, { WhiteboardPanel }] = await Promise.all([
        import('../storage/chatHistoryStorage'),
        import('../webview/whiteboardPanel'),
    ]);

    const storage = getChatHistoryStorage();
    return {
        storage: {
            saveWhiteboardInteraction: (data) => storage.saveWhiteboardInteraction(data),
            updateWhiteboardInteraction: (interactionId, updates) => storage.updateWhiteboardInteraction(interactionId, updates),
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
            canvases: [],
            interactionId: '',
            sceneSummary: createEmptyWhiteboardSceneSummary(),
        };
    }

    const hasAllDependencies = Boolean(
        options.dependencies?.storage
        && options.dependencies?.panel
        && options.dependencies?.now
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
    const canvases = createInitialCanvasSeed(params).map((canvas, index) => createCanvas(canvas, index, now));
    const activeCanvasId = canvases[0]?.id;

    const interactionId = dependencies.storage.saveWhiteboardInteraction({
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
    const cancellationDisposable = token.onCancellationRequested(() => {
        cancelledByAgent = true;
        dependencies.storage.updateWhiteboardInteraction(interactionId, {
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
                canvases: [],
                interactionId,
                sceneSummary: createEmptyWhiteboardSceneSummary(),
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

        dependencies.storage.updateWhiteboardInteraction(interactionId, {
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

        const sceneSummary = summarizeWhiteboardScene(resolvedCanvases.map((canvas) => ({
            id: canvas.id,
            name: canvas.name,
            fabricState: canvas.fabricState,
        })));

        return {
            submitted: result.submitted,
            action,
            instruction: createWhiteboardInstruction(action),
            canvases: submittedCanvases,
            interactionId,
            sceneSummary,
        };
    } catch (error) {
        Logger.error('Error showing whiteboard panel:', error);
        if (!cancelledByAgent) {
            dependencies.storage.updateWhiteboardInteraction(interactionId, {
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
            canvases: [],
            interactionId,
            sceneSummary: createEmptyWhiteboardSceneSummary(),
        };
    } finally {
        cancellationDisposable.dispose();
    }
}
