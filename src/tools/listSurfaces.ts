import type * as vscode from 'vscode';
import type { ListSurfacesInput, ListSurfacesToolResult } from './schemas';

export interface ListSurfacesPanelDependency {
    listSurfaces(): Array<{
        surfaceId: string;
        title: string;
        created: string;
    }>;
}

export interface ListSurfacesDependencies {
    panel: ListSurfacesPanelDependency;
}

async function createDefaultDependencies(): Promise<ListSurfacesDependencies> {
    const { A2UIPanel } = await import('../a2ui/panel');
    return {
        panel: {
            listSurfaces: () => A2UIPanel.listSurfaces(),
        },
    };
}

/**
 * Core logic for the list_surfaces tool.
 * Lists all currently active surface panels with their metadata.
 */
export async function listSurfaces(
    _params: ListSurfacesInput,
    deps?: Partial<ListSurfacesDependencies>,
    token?: vscode.CancellationToken,
): Promise<ListSurfacesToolResult> {
    if (token?.isCancellationRequested) {
        return { surfaces: [] };
    }

    const defaultDeps = deps?.panel ? undefined : await createDefaultDependencies();
    const panel = deps?.panel ?? defaultDeps!.panel;

    const surfaces = panel.listSurfaces();

    return { surfaces };
}
