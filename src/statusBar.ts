import * as vscode from 'vscode';
import { strings, localize } from './localization';

/**
 * Manages a status bar item that shows the count of pending agent requests.
 *
 * - Displays a persistent indicator in the VS Code status bar
 * - Clicking opens a quick pick to select and navigate to a pending request
 * - Color changes to warning state when requests are waiting
 */
export class StatusBarManager implements vscode.Disposable {
    private _statusBarItem: vscode.StatusBarItem;
    private _pendingItems: Array<{ id: string; title: string; agentName?: string; createdAt: number }> = [];

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this._statusBarItem.command = 'seamless-agent.showPendingQuickPick';
        this._updateDisplay();
        this._statusBarItem.show();
    }

    /**
     * Update the status bar with the current pending requests.
     */
    public update(pendingItems: Array<{ id: string; title: string; agentName?: string; createdAt: number }>): void {
        this._pendingItems = pendingItems;
        this._updateDisplay();
    }

    /**
     * Get the currently tracked pending items (for the quick pick command).
     */
    public getPendingItems(): Array<{ id: string; title: string; agentName?: string; createdAt: number }> {
        return this._pendingItems;
    }

    private _updateDisplay(): void {
        const count = this._pendingItems.length;

        if (count === 0) {
            this._statusBarItem.text = '$(check) Seamless Agent';
            this._statusBarItem.tooltip = localize('statusBar.noRequests');
            this._statusBarItem.backgroundColor = undefined;
        } else {
            this._statusBarItem.text = `$(bell~spin) ${count} ${localize('statusBar.pending')}`;
            this._statusBarItem.tooltip = localize('statusBar.pendingTooltip', count);
            this._statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }
    }

    public dispose(): void {
        this._statusBarItem.dispose();
    }
}
