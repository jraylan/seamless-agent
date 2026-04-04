import type * as vscode from 'vscode';
import type { A2UIRenderIssue, DroppedStyleEntry } from '../a2ui/types';
import type { UpdateUIInput, UpdateUIToolResult } from './schemas';

export interface UpdateUIPanelDependency {
    updateTitle(surfaceId: string, title: string): { found: boolean; renderErrors?: A2UIRenderIssue[] };
    updateDataModel(
        surfaceId: string,
        dataModel: Record<string, unknown>,
    ): { found: boolean; renderErrors?: A2UIRenderIssue[]; droppedStyles?: DroppedStyleEntry[] };
}

export interface UpdateUIDependencies {
    panel: UpdateUIPanelDependency;
}

async function createDefaultDependencies(): Promise<UpdateUIDependencies> {
    const { A2UIPanel } = await import('../a2ui/panel');
    return {
        panel: {
            updateTitle: (surfaceId, title) =>
                A2UIPanel.updateTitle(surfaceId, title),
            updateDataModel: (surfaceId, dataModel) =>
                A2UIPanel.updateDataModel(surfaceId, dataModel),
        },
    };
}

/**
 * Core logic for the update_ui tool.
 * Applies `title` and/or `dataModel` to an existing surface and triggers a re-render when
 * `dataModel` is provided. At least one of `title` or `dataModel` must be supplied (enforced
 * by schema validation).
 */
export async function updateUI(
    params: UpdateUIInput,
    deps?: Partial<UpdateUIDependencies>,
    token?: vscode.CancellationToken,
): Promise<UpdateUIToolResult> {
    if (token?.isCancellationRequested) {
        return { surfaceId: params.surfaceId, applied: false };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;

    // Title-only path: no dataModel means we only update the panel title.
    if (params.dataModel === undefined) {
        const result = panel.updateTitle(params.surfaceId, params.title!);
        if (!result.found) {
            return { surfaceId: params.surfaceId, applied: false, notFound: true };
        }
        return {
            surfaceId: params.surfaceId,
            applied: true,
            ...(result.renderErrors && result.renderErrors.length > 0
                ? { renderErrors: result.renderErrors }
                : {}),
        };
    }

    // Apply title first (if provided), then update data model and re-render.
    let titleErrors: A2UIRenderIssue[] = [];
    if (params.title !== undefined) {
        const titleResult = panel.updateTitle(params.surfaceId, params.title);
        if (!titleResult.found) {
            return { surfaceId: params.surfaceId, applied: false, notFound: true };
        }
        titleErrors = titleResult.renderErrors ?? [];
    }

    const result = panel.updateDataModel(params.surfaceId, params.dataModel);

    if (!result.found) {
        return { surfaceId: params.surfaceId, applied: false, notFound: true };
    }

    const allErrors = [...titleErrors, ...(result.renderErrors ?? [])];

    return {
        surfaceId: params.surfaceId,
        applied: true,
        ...(allErrors.length > 0 ? { renderErrors: allErrors } : {}),
        ...(result.droppedStyles?.length ? { droppedStyles: result.droppedStyles } : {}),
    };
}
