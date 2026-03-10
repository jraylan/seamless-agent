import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { A2UISurface, A2UIUserAction } from './types';
import { renderSurface } from './renderer';

export interface A2UIPanelResult {
    dismissed: boolean;
    userAction?: A2UIUserAction;
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
    private _resolvePromise?: (result: A2UIPanelResult) => void;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        surface: A2UISurface,
        surfaceKey: string,
        resolve: (result: A2UIPanelResult) => void,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._surface = surface;
        this._surfaceKey = surfaceKey;
        this._resolvePromise = resolve;

        this._panel.webview.html = this._getHtmlContent();
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
                existing._surface = surface;
                existing._panel.title = surface.title ?? 'UI Surface';
                existing._panel.webview.html = existing._getHtmlContent();
                existing._panel.reveal(column);
            } else {
                const webviewPanel = vscode.window.createWebviewPanel(
                    A2UIPanel.viewType,
                    surface.title ?? 'UI Surface',
                    column,
                    A2UIPanel._webviewOptions(extensionUri),
                );
                const instance = new A2UIPanel(webviewPanel, extensionUri, surface, key, () => { });
                A2UIPanel._panels.set(key, instance);
            }
            return { dismissed: false };
        }

        return new Promise<A2UIPanelResult>((resolve) => {
            const existing = A2UIPanel._panels.get(key);
            if (existing) {
                existing._resolve({ dismissed: true });
                existing._surface = surface;
                existing._panel.title = surface.title ?? 'UI Surface';
                existing._resolvePromise = resolve;
                existing._panel.webview.html = existing._getHtmlContent();
                existing._panel.reveal(column);
                return;
            }

            const webviewPanel = vscode.window.createWebviewPanel(
                A2UIPanel.viewType,
                surface.title ?? 'UI Surface',
                column,
                A2UIPanel._webviewOptions(extensionUri),
            );
            const instance = new A2UIPanel(webviewPanel, extensionUri, surface, key, resolve);
            A2UIPanel._panels.set(key, instance);
        });
    }

    public static closeIfOpen(surfaceId: string): boolean {
        const panel = A2UIPanel._panels.get(surfaceId);
        if (panel) {
            panel._panel.dispose();
            return true;
        }
        return false;
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
            this._resolve({ dismissed: false, userAction: action });
            this._panel.dispose();
        }
    }

    private _resolve(result: A2UIPanelResult): void {
        if (this._resolvePromise) {
            this._resolvePromise(result);
            this._resolvePromise = undefined;
        }
    }

    private _dispose(): void {
        A2UIPanel._panels.delete(this._surfaceKey);
        if (this._resolvePromise) {
            this._resolve({ dismissed: true });
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }

    private _getHtmlContent(): string {
        const webview = this._panel.webview;
        const nonce = crypto.randomBytes(16).toString('hex');

        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'a2ui.css'),
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'a2ui.js'),
        );
        const cspSource = webview.cspSource;

        let renderedHtml: string;
        try {
            renderedHtml = renderSurface(this._surface);
        } catch {
            renderedHtml = '<p class="a2ui-error">Failed to render surface.</p>';
        }

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

        return html;
    }
}
