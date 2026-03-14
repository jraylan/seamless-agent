import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { A2UIComponent, A2UIDataModel, A2UIRenderIssue, A2UISurface, A2UIUserAction, DroppedStyleEntry } from './types';
import { renderSurface } from './renderer';

export interface A2UIPanelResult {
    dismissed: boolean;
    renderErrors?: A2UIRenderIssue[];
    userAction?: A2UIUserAction;
    droppedStyles?: DroppedStyleEntry[];
}

export interface A2UIPanelUpdateResult {
    found: boolean;
    renderErrors?: A2UIRenderIssue[];
    droppedStyles?: DroppedStyleEntry[];
}

type FromWebviewMessage =
    | { type: 'userAction'; name: string; data: Record<string, unknown> };

function escHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderA2UIDiagnostics(surface: A2UISurface): string {
    const report = surface.a2uiReport;
    if (!report) {
        return '';
    }

    const issuesHtml = report.issues.length > 0
        ? `<ul class="a2ui-diagnostics-list">${report.issues.map((issue) => `<li><strong>${escHtml(issue.principle)}</strong>: ${escHtml(issue.message)}</li>`).join('')}</ul>`
        : '<p class="a2ui-diagnostics-empty">No validation findings.</p>';
    const enhancementsHtml = report.appliedEnhancements.length > 0
        ? `<ul class="a2ui-diagnostics-list">${report.appliedEnhancements.map((item) => `<li>${escHtml(item)}</li>`).join('')}</ul>`
        : '<p class="a2ui-diagnostics-empty">No automatic enhancements applied.</p>';

    return `<section class="a2ui-diagnostics" aria-label="A2UI diagnostics"><div class="a2ui-diagnostics-header"><span class="a2ui-diagnostics-title">A2UI Diagnostics</span><span class="a2ui-diagnostics-score">Score ${escHtml(String(Math.round(report.score * 100)))}%</span></div><div class="a2ui-diagnostics-body"><div><h2>Findings</h2>${issuesHtml}</div><div><h2>Enhancements</h2>${enhancementsHtml}</div></div></section>`;
}

export class A2UIPanel {
    public static readonly viewType = 'seamlessAgent.a2ui';

    private static _panels: Map<string, A2UIPanel> = new Map();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _surface: A2UISurface;
    private readonly _surfaceKey: string;
    private _disposables: vscode.Disposable[] = [];
    private _lastRenderErrors: A2UIRenderIssue[] = [];
    private _lastDroppedStyles: DroppedStyleEntry[] = [];
    private _pendingResult?: Promise<A2UIPanelResult>;
    private _resolvePromise?: (result: A2UIPanelResult) => void;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        surface: A2UISurface,
        surfaceKey: string,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._surface = surface;
        this._surfaceKey = surfaceKey;

        this._renderIntoWebview();
        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (message: FromWebviewMessage) => void this._handleMessage(message),
            null,
            this._disposables,
        );
    }

    /**
     * Shows a surface panel.
     * If waitForAction is false, returns immediately after creating the panel.
     * If waitForAction is true, blocks until the user fires an action or closes the panel.
     */
    public static async showSurface(
        extensionUri: vscode.Uri,
        surface: A2UISurface,
        waitForAction: boolean,
    ): Promise<A2UIPanelResult> {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        const key = surface.surfaceId ?? crypto.randomBytes(8).toString('hex');

        if (!waitForAction) {
            const existing = A2UIPanel._panels.get(key);
            if (existing) {
                const renderErrors = existing._setSurface(surface);
                const droppedStyles = existing._lastDroppedStyles;
                existing._panel.reveal(column);
                return {
                    dismissed: false,
                    ...(renderErrors.length > 0 ? { renderErrors } : {}),
                    ...(droppedStyles.length > 0 ? { droppedStyles } : {}),
                };
            } else {
                const webviewPanel = vscode.window.createWebviewPanel(
                    A2UIPanel.viewType,
                    surface.title ?? 'UI Surface',
                    column,
                    A2UIPanel._webviewOptions(extensionUri),
                );
                const instance = new A2UIPanel(webviewPanel, extensionUri, surface, key);
                A2UIPanel._panels.set(key, instance);
                return {
                    dismissed: false,
                    ...(instance._lastRenderErrors.length > 0 ? { renderErrors: instance._lastRenderErrors } : {}),
                    ...(instance._lastDroppedStyles.length > 0 ? { droppedStyles: instance._lastDroppedStyles } : {}),
                };
            }
        }

        const existing = A2UIPanel._panels.get(key);
        if (existing) {
            existing._setSurface(surface);
            existing._panel.reveal(column);
            return existing._ensurePendingResult();
        }

        const webviewPanel = vscode.window.createWebviewPanel(
            A2UIPanel.viewType,
            surface.title ?? 'UI Surface',
            column,
            A2UIPanel._webviewOptions(extensionUri),
        );
        const instance = new A2UIPanel(webviewPanel, extensionUri, surface, key);
        A2UIPanel._panels.set(key, instance);
        return instance._ensurePendingResult();
    }

    public static closeIfOpen(surfaceId: string): boolean {
        const panel = A2UIPanel._panels.get(surfaceId);
        if (panel) {
            panel._panel.dispose();
            return true;
        }
        return false;
    }

    /**
     * Lists all currently active surfaces with their metadata.
     */
    public static listSurfaces(): Array<{ surfaceId: string; title: string; created: string }> {
        const surfaces: Array<{ surfaceId: string; title: string; created: string }> = [];

        for (const [surfaceId, panel] of A2UIPanel._panels.entries()) {
            surfaces.push({
                surfaceId,
                title: panel._surface.title ?? '',
                created: new Date().toISOString(), // Use current time since we don't track creation time
            });
        }

        return surfaces;
    }

    /**
     * Updates only the `dataModel` of an existing surface and re-renders it.
     * Returns `{ found: false }` when no surface with the given id is open.
     * The pending waiter (if any) is preserved unchanged.
     */
    public static updateDataModel(surfaceId: string, dataModel: A2UIDataModel): A2UIPanelUpdateResult {
        const panel = A2UIPanel._panels.get(surfaceId);
        if (!panel) {
            return { found: false };
        }
        panel._surface = { ...panel._surface, dataModel };
        const renderErrors = panel._renderIntoWebview();
        const droppedStyles = panel._lastDroppedStyles;
        return { found: true, ...(renderErrors.length > 0 ? { renderErrors } : {}), ...(droppedStyles.length > 0 ? { droppedStyles } : {}) };
    }

    /**
     * Updates only the title of an existing surface panel and re-renders the webview.
     * Returns `{ found: false }` when no surface with the given id is open.
     */
    public static updateTitle(surfaceId: string, title: string): A2UIPanelUpdateResult {
        const panel = A2UIPanel._panels.get(surfaceId);
        if (!panel) {
            return { found: false };
        }
        panel._surface = { ...panel._surface, title };
        panel._panel.title = title;
        const renderErrors = panel._renderIntoWebview();
        const droppedStyles = panel._lastDroppedStyles;
        return { found: true, ...(renderErrors.length > 0 ? { renderErrors } : {}), ...(droppedStyles.length > 0 ? { droppedStyles } : {}) };
    }

    /**
     * Appends `components` to the existing component list of a surface and re-renders.
     * Returns `{ found: false }` when no surface with the given id is open.
     * Prior components are preserved. The pending waiter (if any) is preserved unchanged.
     */
    public static appendComponents(surfaceId: string, components: A2UIComponent[], finalize?: boolean): A2UIPanelUpdateResult {
        const panel = A2UIPanel._panels.get(surfaceId);
        if (!panel) {
            return { found: false };
        }
        const updatedSurface = { ...panel._surface, components: [...panel._surface.components, ...components] };
        if (finalize) {
            updatedSurface.streaming = false;
        }
        panel._surface = updatedSurface;
        const renderErrors = panel._renderIntoWebview();
        const droppedStyles = panel._lastDroppedStyles;
        return { found: true, ...(renderErrors.length > 0 ? { renderErrors } : {}), ...(droppedStyles.length > 0 ? { droppedStyles } : {}) };
    }

    private static _webviewOptions(extensionUri: vscode.Uri): vscode.WebviewPanelOptions & vscode.WebviewOptions {
        return {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(extensionUri, 'media'),
                vscode.Uri.joinPath(extensionUri, 'dist'),
            ],
        };
    }

    private async _handleMessage(message: FromWebviewMessage): Promise<void> {
        if (message.type === 'userAction') {
            const action: A2UIUserAction = {
                name: message.name,
                data: message.data,
            };
            this._resolve({
                dismissed: false,
                ...(this._lastRenderErrors.length > 0 ? { renderErrors: this._lastRenderErrors } : {}),
                ...(this._lastDroppedStyles.length > 0 ? { droppedStyles: this._lastDroppedStyles } : {}),
                userAction: action,
            });
            this._panel.dispose();
        }
    }

    private _ensurePendingResult(): Promise<A2UIPanelResult> {
        if (!this._pendingResult) {
            this._pendingResult = new Promise<A2UIPanelResult>((resolve) => {
                this._resolvePromise = resolve;
            });
        }

        return this._pendingResult;
    }

    private _resolve(result: A2UIPanelResult): void {
        if (this._resolvePromise) {
            this._resolvePromise(result);
            this._resolvePromise = undefined;
            this._pendingResult = undefined;
        }
    }

    private _dispose(): void {
        A2UIPanel._panels.delete(this._surfaceKey);
        if (this._resolvePromise) {
            this._resolve({
                dismissed: true,
                ...(this._lastRenderErrors.length > 0 ? { renderErrors: this._lastRenderErrors } : {}),
                ...(this._lastDroppedStyles.length > 0 ? { droppedStyles: this._lastDroppedStyles } : {}),
            });
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }

    private _setSurface(surface: A2UISurface): A2UIRenderIssue[] {
        this._surface = surface;
        this._panel.title = surface.title ?? 'UI Surface';
        return this._renderIntoWebview();
    }

    private _renderIntoWebview(): A2UIRenderIssue[] {
        const { html, renderErrors, droppedStyles } = this._getHtmlContent();
        this._lastRenderErrors = renderErrors;
        this._lastDroppedStyles = droppedStyles;
        this._panel.webview.html = html;
        return renderErrors;
    }

    private _getHtmlContent(): { html: string; renderErrors: A2UIRenderIssue[]; droppedStyles: DroppedStyleEntry[] } {
        const webview = this._panel.webview;
        const nonce = crypto.randomBytes(16).toString('hex');
        const renderErrors: A2UIRenderIssue[] = [];

        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'a2ui.css'),
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'a2ui.js'),
        );
        const cspSource = webview.cspSource;

        const droppedMap = new Map<string, string[]>();
        let renderedHtml: string;
        try {
            renderedHtml = renderSurface(this._surface, droppedMap);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to render surface.';
            renderErrors.push({
                source: 'renderer',
                message,
            });
            renderedHtml = `<p class="a2ui-error">${escHtml(message)}</p>`;
        }

        const droppedStyles: DroppedStyleEntry[] = Array.from(droppedMap.entries()).map(([componentId, properties]) => ({ componentId, properties }));

        const streamingIndicatorHtml = this._surface.streaming
            ? '<div class="a2ui-streaming-indicator" aria-live="polite" aria-label="Generating content"><span class="a2ui-streaming-dot"></span><span class="a2ui-streaming-dot"></span><span class="a2ui-streaming-dot"></span><span class="a2ui-streaming-label">Generating…</span></div>'
            : '';

        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'a2ui.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        html = html
            .replace(/\{\{nonce\}\}/g, nonce)
            .replace(/\{\{cspSource\}\}/g, cspSource)
            .replace(/\{\{styleUri\}\}/g, cssUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{title\}\}/g, escHtml(this._surface.title ?? 'UI Surface'))
            .replace(/\{\{surfaceId\}\}/g, escHtml(this._surfaceKey));

        html = html.replace(/\{\{diagnosticsHtml\}\}/g, () => renderA2UIDiagnostics(this._surface));
        html = html.replace(/\{\{surfaceHtml\}\}/g, () => renderedHtml);
        html = html.replace(/\{\{streamingIndicatorHtml\}\}/g, () => streamingIndicatorHtml);

        return {
            html,
            renderErrors,
            droppedStyles,
        };
    }
}
