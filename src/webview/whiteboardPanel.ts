import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { serializeBlankFabricCanvasState } from '../whiteboard/canvasState';
import {
    getChatHistoryStorage,
    getExtensionContext,
} from '../storage/chatHistoryStorage';
import {
    normalizeWhiteboardSubmittedCanvas,
} from './types';
import type {
    ExtensionToWhiteboardMessage as ToWebviewMessage,
    NormalizedWhiteboardCanvasSubmission,
    WhiteboardCanvas,
    WhiteboardCanvasSubmission,
    WhiteboardPanelOptions,
    WhiteboardPanelResult,
    WhiteboardToExtensionMessage as FromWebviewMessage,
} from './types';

const TEMP_IMAGE_DIRECTORY = 'temp-whiteboard-images';

export async function exportSubmittedWhiteboardCanvases(
    interactionId: string,
    canvases: WhiteboardCanvasSubmission[],
    storageRootPath: string,
): Promise<NormalizedWhiteboardCanvasSubmission[]> {
    cleanupWhiteboardTempImages(interactionId, storageRootPath);
    const tempDir = path.join(storageRootPath, TEMP_IMAGE_DIRECTORY);
    fs.mkdirSync(tempDir, { recursive: true });

    return canvases.map((canvasSubmission) => {
        const canvas = normalizeWhiteboardSubmittedCanvas(canvasSubmission);
        if (!canvas.imageUri.startsWith('data:image/png;base64,')) {
            return canvas;
        }

        const fileName = `${interactionId}_${canvas.id}_${Date.now()}.png`;
        const filePath = path.join(tempDir, fileName);
        const base64 = canvas.imageUri.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

        return {
            ...canvas,
            imageUri: vscode.Uri.file(filePath).toString(),
        };
    });
}

export function cleanupWhiteboardTempImages(interactionId: string, storageRootPath: string): void {
    const tempDir = path.join(storageRootPath, TEMP_IMAGE_DIRECTORY);
    if (!fs.existsSync(tempDir)) {
        return;
    }

    for (const file of fs.readdirSync(tempDir)) {
        if (!file.startsWith(`${interactionId}_`)) {
            continue;
        }
        fs.rmSync(path.join(tempDir, file), { force: true });
    }
}

export class WhiteboardPanel {
    public static readonly viewType = 'seamlessAgent.whiteboard';

    private static _panels: Map<string, WhiteboardPanel> = new Map();
    private static _pendingResolvers: Map<string, (result: WhiteboardPanelResult) => void> = new Map();

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _options: WhiteboardPanelOptions;
    private _disposables: vscode.Disposable[] = [];
    private _resolvePromise?: (result: WhiteboardPanelResult) => void;
    private _closedByAgent = false;
    private _webviewReady = false;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        options: WhiteboardPanelOptions,
        resolve: (result: WhiteboardPanelResult) => void,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._options = options;
        this._resolvePromise = resolve;

        this._panel.webview.html = this._getHtmlContent();
        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            (message: FromWebviewMessage) => void this._handleMessage(message),
            null,
            this._disposables,
        );
    }

    public static async showWithOptions(
        extensionUri: vscode.Uri,
        options: WhiteboardPanelOptions,
    ): Promise<WhiteboardPanelResult> {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        const existingPanel = WhiteboardPanel._panels.get(options.interactionId);

        if (existingPanel) {
            existingPanel._applyOptions(options);
            existingPanel._panel.reveal(column);
        }

        return new Promise<WhiteboardPanelResult>((resolve) => {
            WhiteboardPanel._pendingResolvers.set(options.interactionId, resolve);

            if (existingPanel) {
                existingPanel._resolvePromise = resolve;
                void existingPanel._postInitialize();
                return;
            }

            WhiteboardPanel._createPanel(extensionUri, options, resolve, column);
        });
    }

    public static closeIfOpen(interactionId: string): boolean {
        const panel = WhiteboardPanel._panels.get(interactionId);
        if (panel) {
            panel._closedByAgent = true;
            panel._panel.dispose();
            return true;
        }

        const pendingResolver = WhiteboardPanel._pendingResolvers.get(interactionId);
        if (pendingResolver) {
            pendingResolver({ submitted: false, action: 'cancelled', canvases: [] });
            WhiteboardPanel._pendingResolvers.delete(interactionId);
            return true;
        }

        return false;
    }

    public static hasPendingResolver(interactionId: string): boolean {
        return WhiteboardPanel._pendingResolvers.has(interactionId);
    }

    public static reopenPending(
        extensionUri: vscode.Uri,
        interactionId: string,
        options: WhiteboardPanelOptions,
    ): boolean {
        const existingPanel = WhiteboardPanel._panels.get(interactionId);
        if (existingPanel) {
            const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
            existingPanel._applyOptions(options);
            existingPanel._panel.reveal(column);
            void existingPanel._postInitialize();
            return true;
        }

        const pendingResolver = WhiteboardPanel._pendingResolvers.get(interactionId);
        if (!pendingResolver) {
            return false;
        }

        WhiteboardPanel._createPanel(extensionUri, options, pendingResolver);
        return true;
    }

    private async _handleMessage(message: FromWebviewMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                this._webviewReady = true;
                await this._postInitialize();
                return;
            case 'saveCanvas':
                this._saveCanvas(message);
                return;
            case 'createCanvas':
                this._createCanvas(message);
                return;
            case 'deleteCanvas':
                this._deleteCanvas(message.canvasId);
                return;
            case 'switchCanvas':
                this._switchCanvas(message.canvasId);
                return;
            case 'submit': {
                try {
                    const exportedCanvases = await exportSubmittedWhiteboardCanvases(
                        this._options.interactionId,
                        message.canvases,
                        getExtensionContext().globalStorageUri.fsPath,
                    );
                    this._resolve({
                        submitted: true,
                        action: message.action,
                        canvases: exportedCanvases,
                    });
                } catch (error) {
                    await this._showError(`Failed to export whiteboard images: ${error instanceof Error ? error.message : String(error)}`);
                }
                return;
            }
            case 'cancel':
                cleanupWhiteboardTempImages(this._options.interactionId, getExtensionContext().globalStorageUri.fsPath);
                this._resolve({ submitted: false, action: 'cancelled', canvases: [] });
                return;
            default:
                return;
        }
    }

    private _saveCanvas(message: Extract<FromWebviewMessage, { type: 'saveCanvas' }>): void {
        const canvasIndex = this._options.session.canvases.findIndex((canvas) => canvas.id === message.canvasId);
        const currentTimestamp = Date.now();
        const existingCanvas = canvasIndex >= 0 ? this._options.session.canvases[canvasIndex] : undefined;
        const nextCanvas: WhiteboardCanvas = {
            id: message.canvasId,
            name: message.name ?? existingCanvas?.name ?? `Canvas ${this._options.session.canvases.length + 1}`,
            fabricState: message.fabricState,
            thumbnail: message.thumbnail,
            createdAt: existingCanvas?.createdAt ?? currentTimestamp,
            updatedAt: currentTimestamp,
            shapes: message.shapes,
            images: message.images,
        };

        const nextCanvases = [...this._options.session.canvases];
        if (canvasIndex >= 0) {
            nextCanvases[canvasIndex] = nextCanvas;
        } else {
            nextCanvases.push(nextCanvas);
        }

        this._options = {
            ...this._options,
            session: {
                ...this._options.session,
                canvases: nextCanvases,
                activeCanvasId: message.canvasId,
            },
        };
        this._persistSession();
    }

    private _createCanvas(message: Extract<FromWebviewMessage, { type: 'createCanvas' }>): void {
        const canvasId = message.canvasId ?? `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        if (!this._options.session.canvases.some((canvas) => canvas.id === canvasId)) {
            const currentTimestamp = Date.now();
            this._options = {
                ...this._options,
                session: {
                    ...this._options.session,
                    canvases: [
                        ...this._options.session.canvases,
                        {
                            id: canvasId,
                            name: message.name,
                            fabricState: message.fabricState ?? serializeBlankFabricCanvasState(),
                            createdAt: currentTimestamp,
                            updatedAt: currentTimestamp,
                        },
                    ],
                    activeCanvasId: canvasId,
                },
            };
            this._persistSession();
        }
    }

    private _deleteCanvas(canvasId: string): void {
        const nextCanvases = this._options.session.canvases.filter((canvas) => canvas.id !== canvasId);
        this._options = {
            ...this._options,
            session: {
                ...this._options.session,
                canvases: nextCanvases,
                activeCanvasId: this._options.session.activeCanvasId === canvasId
                    ? nextCanvases[0]?.id
                    : this._options.session.activeCanvasId,
            },
        };
        this._persistSession();
    }

    private _switchCanvas(canvasId: string): void {
        if (!this._options.session.canvases.some((canvas) => canvas.id === canvasId)) {
            return;
        }

        this._options = {
            ...this._options,
            session: {
                ...this._options.session,
                activeCanvasId: canvasId,
            },
        };
        this._persistSession();
    }

    private _persistSession(): void {
        getChatHistoryStorage().updateWhiteboardInteraction(this._options.interactionId, {
            title: this._options.title,
            whiteboardSession: {
                title: this._options.title,
                context: this._options.session.context,
                canvases: this._options.session.canvases,
                activeCanvasId: this._options.session.activeCanvasId,
            },
        });
    }

    private _resolve(result: WhiteboardPanelResult): void {
        if (this._resolvePromise) {
            this._resolvePromise(result);
            this._resolvePromise = undefined;
            WhiteboardPanel._pendingResolvers.delete(this._options.interactionId);
        }

        this._panel.dispose();
    }

    private _dispose(): void {
        if (this._closedByAgent && this._resolvePromise) {
            this._resolvePromise({ submitted: false, action: 'cancelled', canvases: [] });
            WhiteboardPanel._pendingResolvers.delete(this._options.interactionId);
        }
        this._resolvePromise = undefined;

        while (this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }
    }

    private _applyOptions(options: WhiteboardPanelOptions): void {
        this._options = options;
        this._panel.title = options.title;
        if (this._webviewReady) {
            void this._postInitialize();
        }
    }

    private async _postInitialize(): Promise<void> {
        if (!this._webviewReady) {
            return;
        }

        await this._panel.webview.postMessage({
            type: 'initialize',
            title: this._options.title,
            session: this._options.session,
        } as ToWebviewMessage);
    }

    private async _showError(message: string): Promise<void> {
        await this._panel.webview.postMessage({ type: 'error', message } as ToWebviewMessage);
    }

    private _getHtmlContent(): string {
        const webview = this._panel.webview;
        const nonce = getNonce();
        const templatePath = path.join(this._extensionUri.fsPath, 'media', 'whiteboard.html');
        let template = fs.readFileSync(templatePath, 'utf8');

        const replacements: Record<string, string> = {
            '{{cspSource}}': webview.cspSource,
            '{{nonce}}': nonce,
            '{{title}}': escapeHtml(this._options.title),
            '{{styleUri}}': webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'whiteboard.css')).toString(),
            '{{scriptUri}}': webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'whiteboard.js')).toString(),
            '{{codiconsUri}}': webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')).toString(),
        };

        for (const [placeholder, value] of Object.entries(replacements)) {
            template = template.split(placeholder).join(value);
        }

        return template;
    }

    private static _createPanel(
        extensionUri: vscode.Uri,
        options: WhiteboardPanelOptions,
        resolve: (result: WhiteboardPanelResult) => void,
        column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
    ): void {
        const panel = vscode.window.createWebviewPanel(
            WhiteboardPanel.viewType,
            options.title,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
                ],
            },
        );

        const whiteboardPanel = new WhiteboardPanel(panel, extensionUri, options, resolve);
        WhiteboardPanel._panels.set(options.interactionId, whiteboardPanel);
        panel.onDidDispose(() => {
            WhiteboardPanel._panels.delete(options.interactionId);
        });
    }
}

function getNonce(): string {
    let value = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let index = 0; index < 32; index += 1) {
        value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return value;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
