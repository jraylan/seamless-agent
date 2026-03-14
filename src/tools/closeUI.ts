import type * as vscode from 'vscode';
import type { CloseUIInput, CloseUIToolResult } from './schemas';

export interface CloseUIPanelDependency {
    closeIfOpen(surfaceId: string): boolean | Promise<boolean>;
}

export interface CloseUIDependencies {
    panel: CloseUIPanelDependency;
}

async function createDefaultDependencies(): Promise<CloseUIDependencies> {
    const { A2UIPanel } = await import('../a2ui/panel');
    return {
        panel: {
            closeIfOpen: (surfaceId) => A2UIPanel.closeIfOpen(surfaceId),
        },
    };
}

/**
 * Core logic for the close_ui tool.
 * Closes an existing surface panel by surfaceId.
 */
export async function closeUI(
    params: CloseUIInput,
    deps?: Partial<CloseUIDependencies>,
    token?: vscode.CancellationToken,
): Promise<CloseUIToolResult> {
    if (token?.isCancellationRequested) {
        return { surfaceId: params.surfaceId, closed: false };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;

    const closed = await panel.closeIfOpen(params.surfaceId);

    return { surfaceId: params.surfaceId, closed };
}
