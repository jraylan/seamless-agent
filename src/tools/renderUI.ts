import type * as vscode from 'vscode';
import type { AgentInteractionProvider } from '../webview/webviewProvider';
import type { A2UIRenderIssue, A2UISurface, A2UIUserAction } from '../a2ui/types';
import { processA2UIComponents } from '../a2ui/engine';
import type { RenderUIInput, RenderUIToolResult } from './schemas';

export interface RenderUIPanelDependency {
    showSurface(
        extensionUri: vscode.Uri,
        surface: A2UISurface,
        waitForAction: boolean,
    ): Promise<{ dismissed: boolean; renderErrors?: A2UIRenderIssue[]; userAction?: A2UIUserAction; droppedStyles?: import('../a2ui/types').DroppedStyleEntry[] }>;
    closeIfOpen(surfaceId: string): boolean | Promise<boolean>;
}

export interface RenderUIDependencies {
    panel: RenderUIPanelDependency;
}

function createSurfaceId(): string {
    return `surface_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createDefaultDependencies(): Promise<RenderUIDependencies> {
    const { A2UIPanel } = await import('../a2ui/panel');
    return {
        panel: {
            showSurface: (extensionUri, surface, waitForAction) =>
                A2UIPanel.showSurface(extensionUri, surface, waitForAction),
            closeIfOpen: (surfaceId) => A2UIPanel.closeIfOpen(surfaceId),
        },
    };
}

/**
 * Core logic for the render_ui tool.
 * Renders an A2UI surface in a webview panel using the flat component list contract.
 */
export async function renderUI(
    params: RenderUIInput,
    context: vscode.ExtensionContext,
    _provider: AgentInteractionProvider,
    token: vscode.CancellationToken,
    deps?: Partial<RenderUIDependencies>,
): Promise<RenderUIToolResult> {
    const surfaceId = params.surfaceId ?? createSurfaceId();

    if (token.isCancellationRequested) {
        return {
            surfaceId,
            rendered: false,
        };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;

    if (params.deleteSurface) {
        const deleted = await panel.closeIfOpen(surfaceId);
        return {
            surfaceId,
            rendered: false,
            deleted,
        };
    }

    const shouldRunA2UI = params.enableA2UI ?? true;
    const a2uiLevel = params.a2uiLevel ?? 'basic';
    const processed = shouldRunA2UI
        ? processA2UIComponents(params.components ?? [], a2uiLevel)
        : undefined;
    const surface: A2UISurface = {
        surfaceId,
        title: params.title,
        components: processed?.components ?? params.components ?? [],
        ...(params.dataModel ? { dataModel: params.dataModel } : {}),
        ...(processed ? { a2uiReport: processed.report } : {}),
        ...(params.streaming ? { streaming: true } : {}),
    };

    let cancelledByAgent = false;
    const cancellationDisposable = token.onCancellationRequested(() => {
        cancelledByAgent = true;
        void panel.closeIfOpen(surfaceId);
    });

    try {
        const result = await panel.showSurface(
            context.extensionUri,
            surface,
            params.waitForAction ?? false,
        );

        if (cancelledByAgent) {
            return {
                surfaceId,
                rendered: false,
                ...(processed ? { a2ui: processed.report } : {}),
            };
        }

        // Save the renderUI interaction to history
        try {
            const { getChatHistoryStorage } = await import('../storage/chatHistoryStorage');
            const storage = getChatHistoryStorage();
            storage.saveRenderUIInteraction({
                title: params.title,
                surfaceId,
                components: params.components,
                dataModel: params.dataModel,
                userAction: result.userAction,
                dismissed: result.dismissed,
                renderErrors: result.renderErrors,
            });
        } catch (error) {
            // Non-critical: log but don't fail the tool call
            console.warn('Failed to save renderUI interaction to history:', error);
        }

        return {
            surfaceId,
            rendered: true,
            ...(processed ? { a2ui: processed.report } : {}),
            ...(result.renderErrors && result.renderErrors.length > 0 ? { renderErrors: result.renderErrors } : {}),
            ...(result.userAction ? { userAction: result.userAction } : {}),
            ...(result.droppedStyles && result.droppedStyles.length > 0 ? { droppedStyles: result.droppedStyles } : {}),
        };
    } finally {
        cancellationDisposable.dispose();
    }
}
