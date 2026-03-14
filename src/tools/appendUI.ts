import type * as vscode from 'vscode';
import type { A2UIComponent, A2UIRenderIssue, DroppedStyleEntry } from '../a2ui/types';
import type { AppendUIInput, AppendUIToolResult } from './schemas';

export interface AppendUIPanelDependency {
    updateTitle(surfaceId: string, title: string): { found: boolean; renderErrors?: A2UIRenderIssue[]; droppedStyles?: DroppedStyleEntry[] };
    appendComponents(
        surfaceId: string,
        components: A2UIComponent[],
        finalize?: boolean,
    ): { found: boolean; renderErrors?: A2UIRenderIssue[]; droppedStyles?: DroppedStyleEntry[] };
}

export interface AppendUIDependencies {
    panel: AppendUIPanelDependency;
}

async function createDefaultDependencies(): Promise<AppendUIDependencies> {
    const { A2UIPanel } = await import('../a2ui/panel');
    return {
        panel: {
            updateTitle: (surfaceId, title) =>
                A2UIPanel.updateTitle(surfaceId, title),
            appendComponents: (surfaceId, components, finalize) =>
                A2UIPanel.appendComponents(surfaceId, components, finalize),
        },
    };
}

/**
 * Core logic for the append_ui tool.
 * Appends components to an existing surface without replacing the current component tree.
 * If `title` is provided, applies it to the panel title before appending.
 * If `finalize` is true, the streaming loading indicator is dismissed after appending.
 */
export async function appendUI(
    params: AppendUIInput,
    deps?: Partial<AppendUIDependencies>,
    token?: vscode.CancellationToken,
): Promise<AppendUIToolResult> {
    if (token?.isCancellationRequested) {
        return { surfaceId: params.surfaceId, applied: false };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;

    let titleErrors: A2UIRenderIssue[] = [];
    if (params.title !== undefined) {
        const titleResult = panel.updateTitle(params.surfaceId, params.title);
        if (!titleResult.found) {
            return { surfaceId: params.surfaceId, applied: false, notFound: true };
        }
        titleErrors = titleResult.renderErrors ?? [];
    }

    const result = panel.appendComponents(params.surfaceId, params.components as A2UIComponent[], params.finalize);

    if (!result.found) {
        return { surfaceId: params.surfaceId, applied: false, notFound: true };
    }

    const allErrors = [...titleErrors, ...(result.renderErrors ?? [])];
    const allDropped = [...(result.droppedStyles ?? [])];

    return {
        surfaceId: params.surfaceId,
        applied: true,
        ...(allErrors.length > 0 ? { renderErrors: allErrors } : {}),
        ...(allDropped.length > 0 ? { droppedStyles: allDropped } : {}),
    };
}
