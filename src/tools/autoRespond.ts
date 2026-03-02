import * as vscode from 'vscode';
import type { AutoPilotConfig } from '../webview/types';
import { Logger } from '../logging';

/** Delay (ms) before auto-responding, giving the user time to see the request. */
const AUTO_RESPOND_DELAY_MS = 1_500;

/**
 * Manages the Auto-Pilot feature — automatic responses to incoming
 * `ask_user` and `plan_review` requests using a configurable chain
 * of pre-defined responses.
 *
 * State is persisted in VS Code globalState so the response chain
 * survives across sessions while the enabled flag resets to off.
 */
export class AutoRespondManager implements vscode.Disposable {
    private _enabled = false;
    private _responses: string[] = [];
    private _currentIndex = 0;
    private _exhaustedBehavior: 'loop' | 'stop' | 'repeatLast' = 'loop';
    private _pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    /** Fired whenever the configuration changes (so the webview can update). */
    private readonly _onDidChange = new vscode.EventEmitter<AutoPilotConfig>();
    public readonly onDidChange = this._onDidChange.event;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._loadState();
    }

    // ── State persistence ───────────────────────────────────────

    private _loadState(): void {
        const state = this._context.globalState;
        this._responses = state.get<string[]>('autoPilot.responses', []);
        this._exhaustedBehavior = state.get<'loop' | 'stop' | 'repeatLast'>('autoPilot.exhaustedBehavior', 'loop');
        // enabled + currentIndex intentionally NOT restored (reset per session)
        this._enabled = false;
        this._currentIndex = 0;
    }

    private _persistState(): void {
        const state = this._context.globalState;
        state.update('autoPilot.responses', this._responses);
        state.update('autoPilot.exhaustedBehavior', this._exhaustedBehavior);
    }

    // ── Public API ──────────────────────────────────────────────

    public getConfig(): AutoPilotConfig {
        return {
            enabled: this._enabled,
            responses: [...this._responses],
            currentIndex: this._currentIndex,
            exhaustedBehavior: this._exhaustedBehavior,
        };
    }

    public setEnabled(enabled: boolean): void {
        this._enabled = enabled;
        if (enabled) {
            this._currentIndex = 0;
        } else {
            // Cancel any pending timers immediately so toggling off stops automation now
            for (const timer of this._pendingTimers.values()) {
                clearTimeout(timer);
            }
            this._pendingTimers.clear();
        }
        Logger.log(`[AutoPilot] ${enabled ? 'Enabled' : 'Disabled'}`);
        this._fireChange();
    }

    public get isEnabled(): boolean {
        return this._enabled && this._responses.length > 0;
    }

    public setResponses(responses: string[]): void {
        this._responses = responses;
        this._currentIndex = 0;
        this._persistState();
        this._fireChange();
    }

    public addResponse(text: string): void {
        if (!text.trim()) return;
        this._responses.push(text.trim());
        this._persistState();
        this._fireChange();
    }

    public removeResponse(index: number): void {
        if (index < 0 || index >= this._responses.length) return;
        this._responses.splice(index, 1);
        if (this._currentIndex >= this._responses.length) {
            this._currentIndex = 0;
        }
        this._persistState();
        this._fireChange();
    }

    public setExhaustedBehavior(behavior: 'loop' | 'stop' | 'repeatLast'): void {
        this._exhaustedBehavior = behavior;
        this._persistState();
        this._fireChange();
    }

    // ── Auto-response logic ─────────────────────────────────────

    /**
     * Schedule an auto-response for the given request ID.
     * Returns `true` if an auto-response was scheduled, `false` otherwise.
     *
     * @param requestId - The pending request ID
     * @param resolve   - Callback to resolve the request with a response
     */
    public scheduleResponse(
        requestId: string,
        resolve: (response: string) => void,
    ): boolean {
        if (!this.isEnabled) return false;

        // Peek ahead: if 'stop' behavior and queue is exhausted, disable Auto-Pilot and decline
        if (this._exhaustedBehavior === 'stop' && this._currentIndex >= this._responses.length) {
            this._enabled = false;
            this._persistState();
            this._fireChange();
            return false;
        }

        Logger.log(`[AutoPilot] Scheduling response for ${requestId}`);

        // Guard against duplicate scheduling for the same id
        this.cancelScheduled(requestId);

        const timer = setTimeout(() => {
            this._pendingTimers.delete(requestId);
            const response = this._nextResponse();
            if (response !== null) {
                resolve(response);
            }
            this._fireChange();
        }, AUTO_RESPOND_DELAY_MS);

        this._pendingTimers.set(requestId, timer);
        return true;
    }

    /**
     * Schedule an auto-approve for a plan review.
     * Returns `true` if an auto-approval was scheduled.
     */
    public scheduleApproval(
        interactionId: string,
        approve: () => void,
    ): boolean {
        if (!this.isEnabled) return false;

        Logger.log(`[AutoPilot] Scheduling auto-approve for plan review ${interactionId}`);

        // Guard against duplicate scheduling for the same id
        this.cancelScheduled(interactionId);

        const timer = setTimeout(() => {
            this._pendingTimers.delete(interactionId);
            approve();
        }, AUTO_RESPOND_DELAY_MS);

        this._pendingTimers.set(interactionId, timer);
        return true;
    }

    /**
     * Cancel a scheduled auto-response (e.g. if the user manually responds first).
     */
    public cancelScheduled(requestId: string): void {
        const timer = this._pendingTimers.get(requestId);
        if (timer) {
            clearTimeout(timer);
            this._pendingTimers.delete(requestId);
        }
    }

    // ── Internal helpers ────────────────────────────────────────

    private _nextResponse(): string | null {
        if (this._responses.length === 0) return null;

        if (this._currentIndex < this._responses.length) {
            const response = this._responses[this._currentIndex];
            this._currentIndex++;
            return response;
        }

        // Queue exhausted
        switch (this._exhaustedBehavior) {
            case 'loop':
                this._currentIndex = 1;
                return this._responses[0];
            case 'repeatLast':
                return this._responses[this._responses.length - 1];
            case 'stop':
                this._enabled = false;
                Logger.log('[AutoPilot] Queue exhausted — auto-pilot stopped');
                this._fireChange();
                return null;
        }
    }

    private _fireChange(): void {
        this._onDidChange.fire(this.getConfig());
    }

    // ── Lifecycle ───────────────────────────────────────────────

    dispose(): void {
        for (const timer of this._pendingTimers.values()) {
            clearTimeout(timer);
        }
        this._pendingTimers.clear();
        this._onDidChange.dispose();
    }
}
