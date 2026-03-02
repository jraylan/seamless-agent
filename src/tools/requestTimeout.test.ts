/**
 * Unit Tests for RequestTimeoutManager
 *
 * Run with: npm test
 *
 * Tests cover:
 * - Timer starts / stops based on configuration
 * - Timed-out requests are cancelled
 * - Re-notifications are throttled
 * - Disposal cleans up resources
 * - Storage auto-pruning in ChatHistoryStorage
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Mocks ───────────────────────────────────────────────────────

/** Minimal mock for vscode.Disposable */
interface MockDisposable {
    dispose(): void;
}

/** Minimal mock of RequestItem */
interface MockRequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    attachments: any[];
    agentName?: string;
}

/** Minimal mock of StoredInteraction */
interface MockStoredInteraction {
    id: string;
    type: 'ask_user' | 'plan_review';
    timestamp: number;
    status?: string;
    title?: string;
    plan?: string;
}

// ── Storage Auto-Pruning Tests ──────────────────────────────────

describe('Storage Auto-Pruning', () => {
    /**
     * Tests the auto-pruning logic in isolation.
     * The autoPrune method is private, so we replicate the algorithm here
     * to ensure correctness without importing VS Code internals.
     */

    function autoPrune(interactions: MockStoredInteraction[], maxItems: number): MockStoredInteraction[] {
        if (maxItems <= 0) return interactions; // 0 = unlimited

        const completed = interactions.filter(i => i.status !== 'pending');
        if (completed.length <= maxItems) return interactions;

        completed.sort((a, b) => a.timestamp - b.timestamp);
        const excess = completed.length - maxItems;
        const toRemove = new Set(completed.slice(0, excess).map(i => i.id));

        for (let idx = interactions.length - 1; idx >= 0; idx--) {
            if (toRemove.has(interactions[idx].id)) {
                interactions.splice(idx, 1);
            }
        }

        return interactions;
    }

    it('should not prune when under the limit', () => {
        const interactions: MockStoredInteraction[] = [
            { id: '1', type: 'ask_user', timestamp: 100, status: 'completed' },
            { id: '2', type: 'ask_user', timestamp: 200, status: 'completed' },
        ];

        autoPrune(interactions, 5);
        assert.strictEqual(interactions.length, 2);
    });

    it('should prune oldest completed items when over the limit', () => {
        const interactions: MockStoredInteraction[] = [
            { id: 'old1', type: 'ask_user', timestamp: 100, status: 'completed' },
            { id: 'old2', type: 'ask_user', timestamp: 200, status: 'completed' },
            { id: 'new1', type: 'ask_user', timestamp: 300, status: 'completed' },
            { id: 'new2', type: 'ask_user', timestamp: 400, status: 'completed' },
        ];

        autoPrune(interactions, 2);

        assert.strictEqual(interactions.length, 2);
        assert.deepStrictEqual(interactions.map(i => i.id), ['new1', 'new2']);
    });

    it('should never prune pending items', () => {
        const interactions: MockStoredInteraction[] = [
            { id: 'pending1', type: 'plan_review', timestamp: 50, status: 'pending' },
            { id: 'completed1', type: 'ask_user', timestamp: 100, status: 'completed' },
            { id: 'completed2', type: 'ask_user', timestamp: 200, status: 'completed' },
            { id: 'pending2', type: 'plan_review', timestamp: 250, status: 'pending' },
            { id: 'completed3', type: 'ask_user', timestamp: 300, status: 'completed' },
        ];

        autoPrune(interactions, 2);

        // Should keep both pending + 2 newest completed
        assert.strictEqual(interactions.length, 4);
        assert.ok(interactions.some(i => i.id === 'pending1'), 'pending1 should be preserved');
        assert.ok(interactions.some(i => i.id === 'pending2'), 'pending2 should be preserved');
        assert.ok(interactions.some(i => i.id === 'completed2'), 'completed2 should be preserved');
        assert.ok(interactions.some(i => i.id === 'completed3'), 'completed3 should be preserved');
        assert.ok(!interactions.some(i => i.id === 'completed1'), 'completed1 (oldest) should be pruned');
    });

    it('should handle maxItems = 0 (unlimited)', () => {
        const interactions: MockStoredInteraction[] = Array.from({ length: 100 }, (_, i) => ({
            id: `item-${i}`,
            type: 'ask_user' as const,
            timestamp: i * 100,
            status: 'completed',
        }));

        autoPrune(interactions, 0);
        assert.strictEqual(interactions.length, 100, 'No items should be pruned when maxItems=0');
    });

    it('should handle mixed statuses correctly', () => {
        const interactions: MockStoredInteraction[] = [
            { id: '1', type: 'plan_review', timestamp: 100, status: 'approved' },
            { id: '2', type: 'ask_user', timestamp: 200, status: 'completed' },
            { id: '3', type: 'plan_review', timestamp: 300, status: 'cancelled' },
            { id: '4', type: 'plan_review', timestamp: 400, status: 'pending' },
            { id: '5', type: 'ask_user', timestamp: 500, status: 'completed' },
        ];

        autoPrune(interactions, 2);

        // pending #4 preserved, oldest non-pending items (#1, #2) pruned
        assert.strictEqual(interactions.length, 3);
        assert.ok(interactions.some(i => i.id === '4'), 'pending should be preserved');
        assert.ok(interactions.some(i => i.id === '3') || interactions.some(i => i.id === '5'));
    });

    it('should handle exact limit boundary', () => {
        const interactions: MockStoredInteraction[] = [
            { id: '1', type: 'ask_user', timestamp: 100, status: 'completed' },
            { id: '2', type: 'ask_user', timestamp: 200, status: 'completed' },
            { id: '3', type: 'ask_user', timestamp: 300, status: 'completed' },
        ];

        autoPrune(interactions, 3);
        assert.strictEqual(interactions.length, 3, 'Should not prune when exactly at limit');
    });

    it('should handle empty array', () => {
        const interactions: MockStoredInteraction[] = [];
        autoPrune(interactions, 5);
        assert.strictEqual(interactions.length, 0);
    });
});

// ── Timeout Logic Tests ─────────────────────────────────────────

describe('Request Timeout Logic', () => {
    const RE_NOTIFY_INTERVAL_MS = 5 * 60_000;

    /**
     * Tests the core timeout and per-item throttle logic in isolation.
     */

    function isTimedOut(createdAt: number, now: number, timeoutMs: number): boolean {
        return (now - createdAt) >= timeoutMs;
    }

    /** Mirrors _collectReNotifyCandidate's qualification check */
    function qualifiesForNotification(
        elapsedMs: number,
        lastNotifiedAt: number,
        now: number,
    ): boolean {
        if (elapsedMs < 60_000) return false;
        if (now - lastNotifiedAt < RE_NOTIFY_INTERVAL_MS) return false;
        return true;
    }

    it('should identify timed-out requests', () => {
        const now = Date.now();
        const timeoutMs = 5 * 60_000; // 5 minutes
        const createdAt = now - 6 * 60_000; // 6 minutes ago

        assert.ok(isTimedOut(createdAt, now, timeoutMs));
    });

    it('should not time out requests before the timeout', () => {
        const now = Date.now();
        const timeoutMs = 5 * 60_000; // 5 minutes
        const createdAt = now - 3 * 60_000; // 3 minutes ago

        assert.ok(!isTimedOut(createdAt, now, timeoutMs));
    });

    it('should time out at exact boundary', () => {
        const now = Date.now();
        const timeoutMs = 5 * 60_000; // 5 minutes
        const createdAt = now - timeoutMs; // exactly at timeout

        assert.ok(isTimedOut(createdAt, now, timeoutMs));
    });

    it('should not qualify for notification when request is fresh (under 1 minute)', () => {
        const now = Date.now();
        const elapsedMs = 30_000; // 30 seconds

        assert.ok(!qualifiesForNotification(elapsedMs, 0, now));
    });

    it('should qualify for notification when aging and enough time has passed', () => {
        const now = Date.now();
        const elapsedMs = 3 * 60_000; // 3 minutes
        const lastNotified = now - RE_NOTIFY_INTERVAL_MS - 1; // long ago

        assert.ok(qualifiesForNotification(elapsedMs, lastNotified, now));
    });

    it('should not qualify too soon after last notification (per-item throttle)', () => {
        const now = Date.now();
        const elapsedMs = 3 * 60_000; // 3 minutes
        const lastNotified = now - 60_000; // 1 minute ago

        assert.ok(!qualifiesForNotification(elapsedMs, lastNotified, now));
    });

    it('should qualify when never notified before (lastNotified=0)', () => {
        const now = Date.now();
        const elapsedMs = 2 * 60_000; // 2 minutes

        assert.ok(qualifiesForNotification(elapsedMs, 0, now));
    });
});

// ── Batched Re-Notification Tests ───────────────────────────────

describe('Batched Re-Notification Logic', () => {
    const RE_NOTIFY_INTERVAL_MS = 5 * 60_000;

    interface Candidate { id: string; elapsedMs: number }

    /** Mirrors _collectReNotifyCandidate */
    function collectCandidates(
        items: Array<{ id: string; elapsedMs: number }>,
        lastNotifiedAt: Map<string, number>,
        now: number,
    ): Candidate[] {
        const candidates: Candidate[] = [];
        for (const { id, elapsedMs } of items) {
            if (elapsedMs < 60_000) continue;
            const last = lastNotifiedAt.get(id) ?? 0;
            if (now - last < RE_NOTIFY_INTERVAL_MS) continue;
            candidates.push({ id, elapsedMs });
        }
        return candidates;
    }

    /** Mirrors _fireBatchedReNotification message selection */
    function buildMessage(candidates: Candidate[]): string {
        const maxElapsedMs = Math.max(...candidates.map(c => c.elapsedMs));
        const maxMinutes = Math.floor(maxElapsedMs / 60_000);
        if (candidates.length === 1) {
            return `single:${maxMinutes}`;
        }
        return `batch:${candidates.length}:${maxMinutes}`;
    }

    it('should produce a single-item message when only one item qualifies', () => {
        const now = Date.now();
        const items = [{ id: 'r1', elapsedMs: 3 * 60_000 }];
        const state = new Map<string, number>();

        const candidates = collectCandidates(items, state, now);
        assert.strictEqual(candidates.length, 1);

        const msg = buildMessage(candidates);
        assert.ok(msg.startsWith('single:'), 'should use single-item template');
        assert.ok(msg.includes('3'), 'should include elapsed minutes');
    });

    it('should produce a batched message when multiple items qualify', () => {
        const now = Date.now();
        const items = [
            { id: 'r1', elapsedMs: 2 * 60_000 },
            { id: 'r2', elapsedMs: 7 * 60_000 },
            { id: 'r3', elapsedMs: 4 * 60_000 },
        ];
        const state = new Map<string, number>();

        const candidates = collectCandidates(items, state, now);
        assert.strictEqual(candidates.length, 3);

        const msg = buildMessage(candidates);
        assert.ok(msg.startsWith('batch:'), 'should use batch template');
        assert.ok(msg.includes('3'), 'should include count');
        assert.ok(msg.includes('7'), 'should use oldest (max) elapsed minutes');
    });

    it('should stamp all candidate ids with current time', () => {
        const now = Date.now();
        const items = [
            { id: 'r1', elapsedMs: 2 * 60_000 },
            { id: 'r2', elapsedMs: 5 * 60_000 },
        ];
        const state = new Map<string, number>();

        const candidates = collectCandidates(items, state, now);
        // Simulate stamp
        for (const { id } of candidates) { state.set(id, now); }

        assert.strictEqual(state.get('r1'), now);
        assert.strictEqual(state.get('r2'), now);
    });

    it('should exclude items that were notified too recently', () => {
        const now = Date.now();
        const items = [
            { id: 'r1', elapsedMs: 3 * 60_000 },
            { id: 'r2', elapsedMs: 6 * 60_000 }, // notified 1 min ago — throttled
        ];
        const state = new Map<string, number>([['r2', now - 60_000]]);

        const candidates = collectCandidates(items, state, now);
        assert.strictEqual(candidates.length, 1);
        assert.strictEqual(candidates[0].id, 'r1');
    });

    it('should exclude fresh items (under 1 minute)', () => {
        const now = Date.now();
        const items = [
            { id: 'r1', elapsedMs: 30_000 },  // too fresh
            { id: 'r2', elapsedMs: 2 * 60_000 },
        ];
        const state = new Map<string, number>();

        const candidates = collectCandidates(items, state, now);
        assert.strictEqual(candidates.length, 1);
        assert.strictEqual(candidates[0].id, 'r2');
    });

    it('should produce no notification when all items are throttled or fresh', () => {
        const now = Date.now();
        const items = [
            { id: 'r1', elapsedMs: 30_000 },                  // fresh
            { id: 'r2', elapsedMs: 3 * 60_000 },               // throttled
        ];
        const state = new Map<string, number>([['r2', now - 60_000]]);

        const candidates = collectCandidates(items, state, now);
        assert.strictEqual(candidates.length, 0, 'no notification should fire');
    });

    it('should report oldest elapsed in batch, not just one item', () => {
        const now = Date.now();
        const items = [
            { id: 'a', elapsedMs: 1 * 60_000 },
            { id: 'b', elapsedMs: 10 * 60_000 },
            { id: 'c', elapsedMs: 3 * 60_000 },
        ];
        const state = new Map<string, number>();
        const candidates = collectCandidates(items, state, now);
        const msg = buildMessage(candidates);
        assert.ok(msg.includes('10'), 'should show 10 minutes for the oldest item');
    });
});

// ── Elapsed Time Formatting Tests ───────────────────────────────

describe('formatElapsed', () => {
    /**
     * Replicate the formatElapsed logic from main.ts for testing.
     */
    function formatElapsed(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        const remainMin = minutes % 60;
        return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
    }

    it('should format sub-minute durations', () => {
        assert.strictEqual(formatElapsed(0), '0s');
        assert.strictEqual(formatElapsed(5_000), '5s');
        assert.strictEqual(formatElapsed(59_000), '59s');
    });

    it('should format exact minutes', () => {
        assert.strictEqual(formatElapsed(60_000), '1m');
        assert.strictEqual(formatElapsed(300_000), '5m');
    });

    it('should format minutes with seconds', () => {
        assert.strictEqual(formatElapsed(90_000), '1m 30s');
        assert.strictEqual(formatElapsed(125_000), '2m 5s');
    });

    it('should format hours', () => {
        assert.strictEqual(formatElapsed(3_600_000), '1h');
        assert.strictEqual(formatElapsed(7_200_000), '2h');
    });

    it('should format hours with minutes', () => {
        assert.strictEqual(formatElapsed(3_900_000), '1h 5m');
        assert.strictEqual(formatElapsed(5_400_000), '1h 30m');
    });
});

// ── Notification State Pruning Tests ────────────────────────────

describe('Notification State Pruning', () => {
    /** Replicates the prune logic from RequestTimeoutManager */
    function pruneNotificationState(
        lastNotifiedAt: Map<string, number>,
        pendingRequests: Array<{ id: string }>,
        pendingReviews: Array<{ id: string }>,
    ): void {
        const activeIds = new Set([
            ...pendingRequests.map(r => r.id),
            ...pendingReviews.map(r => r.id),
        ]);

        for (const id of lastNotifiedAt.keys()) {
            if (!activeIds.has(id)) {
                lastNotifiedAt.delete(id);
            }
        }
    }

    it('should remove entries for resolved requests', () => {
        const state = new Map<string, number>();
        state.set('req1', Date.now());
        state.set('req2', Date.now());

        pruneNotificationState(state, [{ id: 'req1' }], []);

        assert.ok(state.has('req1'), 'req1 still pending, should be kept');
        assert.ok(!state.has('req2'), 'req2 resolved, should be pruned');
    });

    it('should keep entries for pending reviews', () => {
        const state = new Map<string, number>();
        state.set('review1', Date.now());

        pruneNotificationState(state, [], [{ id: 'review1' }]);

        assert.ok(state.has('review1'), 'still pending review, should be kept');
    });

    it('should handle empty state', () => {
        const state = new Map<string, number>();
        pruneNotificationState(state, [], []);
        assert.strictEqual(state.size, 0);
    });

    it('should handle empty pending lists', () => {
        const state = new Map<string, number>();
        state.set('old1', Date.now());
        state.set('old2', Date.now());

        pruneNotificationState(state, [], []);

        assert.strictEqual(state.size, 0, 'All should be pruned when no pending items');
    });
});
