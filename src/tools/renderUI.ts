import type * as vscode from 'vscode';
import type { AgentInteractionProvider } from '../webview/webviewProvider';
import type { A2UISurface, A2UIUserAction } from '../a2ui/types';
import { processA2UIComponents } from '../a2ui/engine';
import type { RenderUIInput, RenderUIToolResult } from './schemas';

export interface RenderUIPanelDependency {
    showSurface(
        extensionUri: vscode.Uri,
        surface: A2UISurface,
        waitForAction: boolean,
    ): Promise<{ dismissed: boolean; userAction?: A2UIUserAction }>;
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
    const shouldRunA2UI = params.enableA2UI ?? false;
    const a2uiLevel = params.a2uiLevel ?? 'basic';
    const processed = shouldRunA2UI
        ? processA2UIComponents(params.components, a2uiLevel)
        : undefined;
    const surface: A2UISurface = {
        surfaceId,
        title: params.title,
        components: processed?.components ?? params.components,
        ...(params.dataModel ? { dataModel: params.dataModel } : {}),
        ...(processed ? { a2uiReport: processed.report } : {}),
    };

    if (token.isCancellationRequested) {
        return {
            surfaceId,
            rendered: false,
            ...(processed ? { a2ui: processed.report } : {}),
        };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;
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

        return {
            surfaceId,
            rendered: true,
            ...(processed ? { a2ui: processed.report } : {}),
            ...(result.userAction ? { userAction: result.userAction } : {}),
        };
    } finally {
        cancellationDisposable.dispose();
    }
}
