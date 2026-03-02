import * as vscode from 'vscode';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { ChatHistoryStorage } from '../storage/chatHistoryStorage';
import { Logger } from '../logging';
import { strings } from '../localization';

/**
 * Interval (ms) at which the manager checks pending requests.
 * Also the interval for sending elapsed-time updates to the webview.
 */
const TICK_INTERVAL_MS = 15_000; // 15 seconds

/**
 * Minimum interval (ms) between re-notifications for the same request.
 * Prevents notification spam while still reminding the user.
 */
const RE_NOTIFY_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Manages timeouts and re-notifications for pending requests.
 *
 * When enabled via the `seamless-agent.requestTimeoutMinutes` setting:
 * - Auto-cancels pending `ask_user` requests after the configured timeout.
 * - Auto-cancels pending `plan_review` interactions after the configured timeout.
 * - Re-notifies the user periodically about aging requests.
 * - Sends elapsed-time updates to the webview for live display.
 */
export class RequestTimeoutManager implements vscode.Disposable {
    private _timer: ReturnType<typeof setInterval> | undefined;
    private _disposables: vscode.Disposable[] = [];

    /** Tracks the last time a re-notification was sent for each request. */
    private _lastNotifiedAt: Map<string, number> = new Map();

    constructor(
        private readonly _provider: AgentInteractionProvider,
        private readonly _storage: ChatHistoryStorage,
    ) {
        // React to configuration changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('seamless-agent.requestTimeoutMinutes')) {
                    this._applyConfiguration();
                }
            }),
        );

        this._applyConfiguration();
    }

    // ─── Configuration ──────────────────────────────────────────

    private _getTimeoutMs(): number {
        const minutes = vscode.workspace
            .getConfiguration('seamless-agent')
            .get<number>('requestTimeoutMinutes', 0);
        return minutes > 0 ? minutes * 60_000 : 0;
    }

    /**
     * Start or stop the timer based on current configuration.
     */
    private _applyConfiguration(): void {
        const timeoutMs = this._getTimeoutMs();

        if (timeoutMs > 0 && !this._timer) {
            Logger.log(`[Timeout] Enabled – timeout set to ${timeoutMs / 60_000} min`);
            this._timer = setInterval(() => this._tick(), TICK_INTERVAL_MS);
        } else if (timeoutMs <= 0 && this._timer) {
            Logger.log('[Timeout] Disabled – clearing timer');
            clearInterval(this._timer);
            this._timer = undefined;
        }
    }

    // ─── Tick Logic ─────────────────────────────────────────────

    /**
     * Called every TICK_INTERVAL_MS.
     * 1. Identifies timed-out requests and cancels them.
     * 2. Collects aging items and fires a single batched re-notification.
     * 3. Pushes elapsed-time data to the webview.
     */
    private _tick(): void {
        const now = Date.now();
        const timeoutMs = this._getTimeoutMs();
        if (timeoutMs <= 0) return;

        // ── 1. ask_user pending requests ────────────────────────
        const pendingRequests = this._provider.getPendingRequests();
        const timedOutRequestIds: string[] = [];
        const elapsedUpdates: Array<{ id: string; elapsedMs: number }> = [];

        /** Items eligible for a batched re-notification this tick. */
        const reNotifyCandidates: Array<{ id: string; elapsedMs: number }> = [];

        for (const req of pendingRequests) {
            const elapsed = now - req.createdAt;
            elapsedUpdates.push({ id: req.id, elapsedMs: elapsed });

            if (elapsed >= timeoutMs) {
                timedOutRequestIds.push(req.id);
            } else {
                this._collectReNotifyCandidate(req.id, elapsed, now, reNotifyCandidates);
            }
        }

        // Cancel timed-out ask_user requests
        for (const id of timedOutRequestIds) {
            Logger.log(`[Timeout] ask_user request ${id} timed out after ${timeoutMs / 60_000} min`);
            this._provider.cancelRequest(id, strings.requestTimedOut);
            this._lastNotifiedAt.delete(id);
        }

        // ── 2. plan_review pending interactions ─────────────────
        const pendingReviews = this._storage.getPendingPlanReviews();
        const timedOutReviewIds: string[] = [];

        for (const review of pendingReviews) {
            const elapsed = now - review.timestamp;
            elapsedUpdates.push({ id: review.id, elapsedMs: elapsed });

            if (elapsed >= timeoutMs) {
                timedOutReviewIds.push(review.id);
            } else {
                this._collectReNotifyCandidate(review.id, elapsed, now, reNotifyCandidates);
            }
        }

        // Cancel timed-out plan reviews
        for (const id of timedOutReviewIds) {
            Logger.log(`[Timeout] plan_review ${id} timed out after ${timeoutMs / 60_000} min`);
            this._cancelPlanReview(id);
            this._lastNotifiedAt.delete(id);
        }

        // ── 3. Fire single batched notification (if any candidates) ─
        if (reNotifyCandidates.length > 0) {
            this._fireBatchedReNotification(reNotifyCandidates, now);
        }

        // ── 4. Push elapsed-time updates to webview ─────────────
        if (elapsedUpdates.length > 0) {
            this._provider.postElapsedTimeUpdates(elapsedUpdates);
        }

        // Clean up notification state for requests that no longer exist
        this._pruneNotificationState(pendingRequests, pendingReviews);
    }

    /**
     * Check whether a single item qualifies for re-notification this tick,
     * and if so push it onto `candidates`. Does NOT fire any notification.
     *
     * Per-item throttling is checked here so notification state stays accurate
     * even when only a subset of items qualify.
     */
    private _collectReNotifyCandidate(
        requestId: string,
        elapsedMs: number,
        now: number,
        candidates: Array<{ id: string; elapsedMs: number }>,
    ): void {
        // Must have been pending for at least 1 minute
        if (elapsedMs < 60_000) return;

        // Must not have been notified too recently (per-item throttle)
        const lastNotified = this._lastNotifiedAt.get(requestId) ?? 0;
        if (now - lastNotified < RE_NOTIFY_INTERVAL_MS) return;

        candidates.push({ id: requestId, elapsedMs });
    }

    /**
     * Fire a single batched notification summarising all qualifying items,
     * then stamp each item's last-notified time.
     *
     * Single item  → "A request has been waiting for X minute(s)."
     * Multiple items → "N requests are pending. Oldest has been waiting X minute(s)."
     */
    private _fireBatchedReNotification(
        candidates: Array<{ id: string; elapsedMs: number }>,
        now: number,
    ): void {
        // Stamp all candidates now — they are included in this notification
        for (const { id } of candidates) {
            this._lastNotifiedAt.set(id, now);
        }

        // Find the oldest elapsed time
        const maxElapsedMs = Math.max(...candidates.map(c => c.elapsedMs));
        const maxMinutes = Math.floor(maxElapsedMs / 60_000);

        let message: string;
        if (candidates.length === 1) {
            message = strings.requestPendingReminder.replace('{0}', String(maxMinutes));
        } else {
            message = strings.requestsPendingBatch
                .replace('{0}', String(candidates.length))
                .replace('{1}', String(maxMinutes));
        }

        Logger.log(`[Timeout] Re-notification: ${candidates.length} item(s), oldest ${maxMinutes} min`);

        vscode.window.showInformationMessage(message, strings.openConsole).then(selection => {
            if (selection === strings.openConsole) {
                vscode.commands.executeCommand('seamlessAgentView.focus');
            }
        });
    }

    /**
     * Cancel a pending plan review by closing its panel and updating storage.
     */
    private async _cancelPlanReview(interactionId: string): Promise<void> {
        try {
            const { PlanReviewPanel } = await import('../webview/planReviewPanel');
            PlanReviewPanel.closeIfOpen(interactionId);
            // Always update storage — closeIfOpen only closes the panel/resolver,
            // it does not write to ChatHistoryStorage.
            this._storage.updateInteraction(interactionId, { status: 'cancelled' });
            this._provider.refreshHome();
        } catch (e) {
            Logger.error('[Timeout] Failed to cancel plan review:', e);
        }
    }

    /**
     * Remove notification state for requests that are no longer pending.
     */
    private _pruneNotificationState(
        pendingRequests: Array<{ id: string }>,
        pendingReviews: Array<{ id: string }>,
    ): void {
        const activeIds = new Set([
            ...pendingRequests.map(r => r.id),
            ...pendingReviews.map(r => r.id),
        ]);

        for (const id of this._lastNotifiedAt.keys()) {
            if (!activeIds.has(id)) {
                this._lastNotifiedAt.delete(id);
            }
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────

    dispose(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = undefined;
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
        this._lastNotifiedAt.clear();
    }
}
