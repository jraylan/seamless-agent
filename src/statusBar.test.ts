/**
 * Unit Tests for StatusBarManager
 *
 * Tests the status bar item that shows pending agent request count,
 * including display states, update behavior, and pending item tracking.
 *
 * Requires the vscode mock (loaded via --require ./test/vscode-mock.cjs).
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { StatusBarManager } from './statusBar';

describe('StatusBarManager', () => {
    let manager: StatusBarManager;

    beforeEach(() => {
        manager = new StatusBarManager();
    });

    // ========================
    // Initial state
    // ========================
    describe('initial state', () => {
        it('should start with empty pending items', () => {
            const items = manager.getPendingItems();
            assert.strictEqual(items.length, 0);
        });
    });

    // ========================
    // update()
    // ========================
    describe('update', () => {
        it('should store pending items after update', () => {
            manager.update([
                { id: 'req_1', title: 'Test Request', createdAt: Date.now() },
            ]);

            const items = manager.getPendingItems();
            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].id, 'req_1');
            assert.strictEqual(items[0].title, 'Test Request');
        });

        it('should replace previous items on update', () => {
            manager.update([
                { id: 'req_1', title: 'First', createdAt: Date.now() },
            ]);
            manager.update([
                { id: 'req_2', title: 'Second', createdAt: Date.now() },
                { id: 'req_3', title: 'Third', createdAt: Date.now() },
            ]);

            const items = manager.getPendingItems();
            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].id, 'req_2');
        });

        it('should handle update with empty array', () => {
            manager.update([
                { id: 'req_1', title: 'First', createdAt: Date.now() },
            ]);
            manager.update([]);

            const items = manager.getPendingItems();
            assert.strictEqual(items.length, 0);
        });

        it('should preserve agentName when provided', () => {
            manager.update([
                { id: 'req_1', title: 'Test', agentName: 'Main Orchestrator', createdAt: Date.now() },
            ]);

            const items = manager.getPendingItems();
            assert.strictEqual(items[0].agentName, 'Main Orchestrator');
        });

        it('should handle items without agentName', () => {
            manager.update([
                { id: 'req_1', title: 'Test', createdAt: Date.now() },
            ]);

            const items = manager.getPendingItems();
            assert.strictEqual(items[0].agentName, undefined);
        });
    });

    // ========================
    // getPendingItems()
    // ========================
    describe('getPendingItems', () => {
        it('should return all items in order', () => {
            const now = Date.now();
            manager.update([
                { id: 'req_a', title: 'Alpha', createdAt: now - 2000 },
                { id: 'req_b', title: 'Bravo', createdAt: now - 1000 },
                { id: 'req_c', title: 'Charlie', createdAt: now },
            ]);

            const items = manager.getPendingItems();
            assert.strictEqual(items.length, 3);
            assert.strictEqual(items[0].id, 'req_a');
            assert.strictEqual(items[1].id, 'req_b');
            assert.strictEqual(items[2].id, 'req_c');
        });
    });

    // ========================
    // dispose()
    // ========================
    describe('dispose', () => {
        it('should not throw when disposed', () => {
            assert.doesNotThrow(() => manager.dispose());
        });

        it('should not throw when disposed twice', () => {
            manager.dispose();
            assert.doesNotThrow(() => manager.dispose());
        });
    });
});
