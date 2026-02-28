/**
 * Unit Tests for ChatHistoryStorage
 *
 * Tests CRUD operations, filtered queries, statistics, and ID generation
 * for the persistent interaction history manager.
 *
 * Requires the vscode mock (loaded via --require ./test/vscode-mock.cjs).
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ChatHistoryStorage } from './chatHistoryStorage';

// Access mock helpers from the vscode mock
const vscode = require('vscode') as any;
const { createMockExtensionContext, setConfig, clearConfig } = vscode.__test__;

describe('ChatHistoryStorage', () => {
    let storage: ChatHistoryStorage;
    let context: any;

    beforeEach(() => {
        clearConfig();
        // Default to workspace storage
        setConfig('seamless-agent.storageContext', 'workspace');
        context = createMockExtensionContext();
        storage = new ChatHistoryStorage(context);
    });

    // ========================
    // saveAskUserInteraction
    // ========================
    describe('saveAskUserInteraction', () => {
        it('should save and return an interaction ID', () => {
            const id = storage.saveAskUserInteraction({
                question: 'Continue with the deployment?',
                title: 'Deploy Confirmation',
                agentName: 'Main Orchestrator',
            });

            assert.ok(id.startsWith('ask_'));
            assert.ok(id.length > 5);
        });

        it('should persist the interaction in storage', () => {
            const id = storage.saveAskUserInteraction({
                question: 'Proceed?',
                response: 'Yes',
            });

            const retrieved = storage.getInteraction(id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved!.type, 'ask_user');
            assert.strictEqual(retrieved!.question, 'Proceed?');
            assert.strictEqual(retrieved!.response, 'Yes');
        });

        it('should save optional fields', () => {
            const id = storage.saveAskUserInteraction({
                question: 'Pick one',
                title: 'Selection',
                agentName: 'TestAgent',
                response: 'Option A',
                attachments: [{ id: 'a1', name: 'file.ts', uri: 'file:///file.ts' }],
                options: ['A', 'B', 'C'],
                selectedOptionLabels: { default: ['A'] },
                isDebug: true,
            });

            const retrieved = storage.getInteraction(id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved!.title, 'Selection');
            assert.strictEqual(retrieved!.agentName, 'TestAgent');
            assert.strictEqual(retrieved!.isDebug, true);
            assert.ok(Array.isArray(retrieved!.attachments));
            assert.strictEqual(retrieved!.attachments!.length, 1);
        });

        it('should generate unique IDs for different interactions', () => {
            const id1 = storage.saveAskUserInteraction({ question: 'Q1' });
            // Small delay to ensure different timestamps
            const id2 = storage.saveAskUserInteraction({ question: 'Q2' });

            assert.notStrictEqual(id1, id2);
        });
    });

    // ========================
    // savePlanReviewInteraction
    // ========================
    describe('savePlanReviewInteraction', () => {
        it('should save a plan review and return ID', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '## Step 1\nDo something',
                title: 'Deploy Plan',
                mode: 'review',
                status: 'pending',
            });

            assert.ok(id.startsWith('review_'));
        });

        it('should persist plan review data', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# My Plan',
                title: 'Test Plan',
                mode: 'walkthrough',
                status: 'approved',
                requiredRevisions: [
                    { revisedPart: 'Step 1', revisorInstructions: 'Add more detail' },
                ],
            });

            const retrieved = storage.getInteraction(id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved!.type, 'plan_review');
            assert.strictEqual(retrieved!.plan, '# My Plan');
            assert.strictEqual(retrieved!.mode, 'walkthrough');
            assert.strictEqual(retrieved!.status, 'approved');
            assert.strictEqual(retrieved!.requiredRevisions!.length, 1);
        });

        it('should default to review mode and pending status', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# Plan',
            });

            const retrieved = storage.getInteraction(id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved!.mode, 'review');
            assert.strictEqual(retrieved!.status, 'pending');
        });
    });

    // ========================
    // getInteraction
    // ========================
    describe('getInteraction', () => {
        it('should return undefined for non-existent ID', () => {
            const result = storage.getInteraction('does_not_exist');
            assert.strictEqual(result, undefined);
        });

        it('should return the correct interaction by ID', () => {
            storage.saveAskUserInteraction({ question: 'Q1' });
            const id2 = storage.saveAskUserInteraction({ question: 'Q2' });
            storage.saveAskUserInteraction({ question: 'Q3' });

            const result = storage.getInteraction(id2);
            assert.ok(result);
            assert.strictEqual(result!.question, 'Q2');
        });
    });

    // ========================
    // getPendingInteraction
    // ========================
    describe('getPendingInteraction', () => {
        it('should return pending interaction', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# Plan',
                status: 'pending',
            });

            const result = storage.getPendingInteraction(id);
            assert.ok(result);
            assert.strictEqual(result!.status, 'pending');
        });

        it('should return undefined for non-pending interaction', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# Plan',
                status: 'approved',
            });

            const result = storage.getPendingInteraction(id);
            assert.strictEqual(result, undefined);
        });

        it('should return undefined for non-existent ID', () => {
            const result = storage.getPendingInteraction('nope');
            assert.strictEqual(result, undefined);
        });
    });

    // ========================
    // updateInteraction
    // ========================
    describe('updateInteraction', () => {
        it('should update status of an interaction', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# Plan',
                status: 'pending',
            });

            storage.updateInteraction(id, { status: 'approved' });

            const updated = storage.getInteraction(id);
            assert.ok(updated);
            assert.strictEqual(updated!.status, 'approved');
        });

        it('should update multiple fields', () => {
            const id = storage.savePlanReviewInteraction({
                plan: '# Plan',
                status: 'pending',
            });

            storage.updateInteraction(id, {
                status: 'recreateWithChanges',
                requiredRevisions: [
                    { revisedPart: 'Section A', revisorInstructions: 'Rewrite' },
                ],
            });

            const updated = storage.getInteraction(id);
            assert.ok(updated);
            assert.strictEqual(updated!.status, 'recreateWithChanges');
            assert.strictEqual(updated!.requiredRevisions!.length, 1);
        });

        it('should do nothing for non-existent interaction', () => {
            // Should not throw
            storage.updateInteraction('nonexistent_id', { status: 'approved' });
        });
    });

    // ========================
    // deleteInteraction
    // ========================
    describe('deleteInteraction', () => {
        it('should delete an interaction', () => {
            const id = storage.saveAskUserInteraction({ question: 'Q1' });
            storage.deleteInteraction(id);

            const result = storage.getInteraction(id);
            assert.strictEqual(result, undefined);
        });

        it('should not affect other interactions', () => {
            const id1 = storage.saveAskUserInteraction({ question: 'Q1' });
            const id2 = storage.saveAskUserInteraction({ question: 'Q2' });

            storage.deleteInteraction(id1);

            assert.strictEqual(storage.getInteraction(id1), undefined);
            assert.ok(storage.getInteraction(id2));
        });
    });

    // ========================
    // deleteMultipleInteractions
    // ========================
    describe('deleteMultipleInteractions', () => {
        it('should delete multiple interactions at once', () => {
            const id1 = storage.saveAskUserInteraction({ question: 'Q1' });
            const id2 = storage.saveAskUserInteraction({ question: 'Q2' });
            const id3 = storage.saveAskUserInteraction({ question: 'Q3' });

            storage.deleteMultipleInteractions([id1, id3]);

            assert.strictEqual(storage.getInteraction(id1), undefined);
            assert.ok(storage.getInteraction(id2));
            assert.strictEqual(storage.getInteraction(id3), undefined);
        });

        it('should handle empty array', () => {
            const id = storage.saveAskUserInteraction({ question: 'Q1' });
            storage.deleteMultipleInteractions([]);
            assert.ok(storage.getInteraction(id));
        });
    });

    // ========================
    // clearAll
    // ========================
    describe('clearAll', () => {
        it('should clear completed interactions', () => {
            storage.saveAskUserInteraction({ question: 'Q1', response: 'Done' });
            storage.saveAskUserInteraction({ question: 'Q2', response: 'Done' });

            storage.clearAll();

            const all = storage.getAllInteractions();
            assert.strictEqual(all.length, 0);
        });

        it('should preserve pending interactions', () => {
            storage.saveAskUserInteraction({ question: 'Q1', response: 'Done' });
            const pendingId = storage.savePlanReviewInteraction({
                plan: '# Plan',
                status: 'pending',
            });

            storage.clearAll();

            const all = storage.getAllInteractions();
            assert.strictEqual(all.length, 1);
            assert.strictEqual(all[0].id, pendingId);
        });
    });

    // ========================
    // getAllInteractions
    // ========================
    describe('getAllInteractions', () => {
        it('should return empty array initially', () => {
            const all = storage.getAllInteractions();
            assert.strictEqual(all.length, 0);
        });

        it('should return all interactions sorted by timestamp (newest first)', () => {
            storage.saveAskUserInteraction({ question: 'Q1' });
            storage.saveAskUserInteraction({ question: 'Q2' });
            storage.saveAskUserInteraction({ question: 'Q3' });

            const all = storage.getAllInteractions();
            assert.strictEqual(all.length, 3);

            // Should be sorted newest first
            for (let i = 1; i < all.length; i++) {
                assert.ok(all[i - 1].timestamp >= all[i].timestamp);
            }
        });
    });

    // ========================
    // Filtered Queries
    // ========================
    describe('getPendingPlanReviews', () => {
        it('should return only pending plan reviews', () => {
            storage.savePlanReviewInteraction({ plan: 'P1', status: 'pending' });
            storage.savePlanReviewInteraction({ plan: 'P2', status: 'approved' });
            storage.savePlanReviewInteraction({ plan: 'P3', status: 'pending' });
            storage.saveAskUserInteraction({ question: 'Q1' });

            const pending = storage.getPendingPlanReviews();
            assert.strictEqual(pending.length, 2);
            assert.ok(pending.every(p => p.status === 'pending' && p.type === 'plan_review'));
        });

        it('should return empty array when no pending reviews', () => {
            storage.savePlanReviewInteraction({ plan: 'P1', status: 'approved' });
            const pending = storage.getPendingPlanReviews();
            assert.strictEqual(pending.length, 0);
        });
    });

    describe('getCompletedInteractions', () => {
        it('should return ask_user and non-pending plan reviews', () => {
            storage.saveAskUserInteraction({ question: 'Q1', response: 'Done' });
            storage.savePlanReviewInteraction({ plan: 'P1', status: 'approved' });
            storage.savePlanReviewInteraction({ plan: 'P2', status: 'pending' });

            const completed = storage.getCompletedInteractions();
            assert.strictEqual(completed.length, 2);
        });

        it('should exclude pending plan reviews', () => {
            storage.savePlanReviewInteraction({ plan: 'P1', status: 'pending' });
            const completed = storage.getCompletedInteractions();
            assert.strictEqual(completed.length, 0);
        });
    });

    describe('getInteractionsByType', () => {
        it('should filter by ask_user type', () => {
            storage.saveAskUserInteraction({ question: 'Q1' });
            storage.savePlanReviewInteraction({ plan: 'P1' });
            storage.saveAskUserInteraction({ question: 'Q2' });

            const askUsers = storage.getInteractionsByType('ask_user');
            assert.strictEqual(askUsers.length, 2);
            assert.ok(askUsers.every(i => i.type === 'ask_user'));
        });

        it('should filter by plan_review type', () => {
            storage.saveAskUserInteraction({ question: 'Q1' });
            storage.savePlanReviewInteraction({ plan: 'P1' });

            const reviews = storage.getInteractionsByType('plan_review');
            assert.strictEqual(reviews.length, 1);
            assert.strictEqual(reviews[0].type, 'plan_review');
        });
    });

    // ========================
    // getStats
    // ========================
    describe('getStats', () => {
        it('should return correct counts', () => {
            storage.saveAskUserInteraction({ question: 'Q1' });
            storage.savePlanReviewInteraction({ plan: 'P1', status: 'pending' });
            storage.savePlanReviewInteraction({ plan: 'P2', status: 'approved' });

            const stats = storage.getStats();
            assert.strictEqual(stats.interactions, 3);
            assert.strictEqual(stats.pendingReviews, 1);
        });

        it('should return zeros for empty storage', () => {
            const stats = storage.getStats();
            assert.strictEqual(stats.interactions, 0);
            assert.strictEqual(stats.pendingReviews, 0);
        });
    });

    // ========================
    // ID generation
    // ========================
    describe('ID generation', () => {
        it('should generate ask_user IDs with "ask_" prefix', () => {
            const id = storage.saveAskUserInteraction({ question: 'Q' });
            assert.ok(id.startsWith('ask_'));
        });

        it('should generate plan_review IDs with "review_" prefix', () => {
            const id = storage.savePlanReviewInteraction({ plan: 'P' });
            assert.ok(id.startsWith('review_'));
        });

        it('should include timestamp in ID', () => {
            const before = Date.now();
            const id = storage.saveAskUserInteraction({ question: 'Q' });
            const after = Date.now();

            // Extract timestamp portion (ask_TIMESTAMP_RANDOM)
            const parts = id.split('_');
            const ts = parseInt(parts[1], 10);
            assert.ok(ts >= before && ts <= after);
        });
    });
});
