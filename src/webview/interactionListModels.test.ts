import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildPendingStoredInteractionEntries,
    buildUnifiedHistoryEntries,
} from './interactionListModels';
import type { StoredInteraction } from './types';

describe('interactionListModels', () => {
    it('includes pending whiteboards alongside pending plan reviews', () => {
        const entries = buildPendingStoredInteractionEntries([
            {
                id: 'review_1',
                type: 'plan_review',
                timestamp: 10,
                title: 'Review API plan',
                plan: 'Review the rollout plan',
                status: 'pending',
            },
            {
                id: 'wb_1',
                type: 'whiteboard',
                timestamp: 20,
                title: 'Architecture Whiteboard',
                whiteboardSession: {
                    id: 'wb_1',
                    interactionId: 'wb_1',
                    context: 'Sketch the service boundaries.',
                    canvases: [
                        {
                            id: 'canvas_1',
                            name: 'System diagram',
                            fabricState: '{"objects":[]}',
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    ],
                    activeCanvasId: 'canvas_1',
                    status: 'pending',
                },
            },
        ] as StoredInteraction[]);

        assert.deepStrictEqual(entries.map((entry) => entry.type), ['whiteboard', 'plan_review']);
        assert.match(entries[0]?.preview || '', /Sketch the service boundaries/);
    });

    it('includes completed whiteboards in unified history', () => {
        const entries = buildUnifiedHistoryEntries([
            {
                id: 'ask_1',
                type: 'ask_user',
                timestamp: 10,
                question: 'Ship it?',
                agentName: 'Main Orchestrator',
                response: 'Yes',
            },
            {
                id: 'wb_done',
                type: 'whiteboard',
                timestamp: 30,
                title: 'Final Architecture',
                whiteboardSession: {
                    id: 'wb_done',
                    interactionId: 'wb_done',
                    context: 'Final sketch',
                    canvases: [
                        {
                            id: 'canvas_1',
                            name: 'Overview',
                            fabricState: '{"objects":[]}',
                            createdAt: 1,
                            updatedAt: 2,
                        },
                    ],
                    activeCanvasId: 'canvas_1',
                    status: 'approved',
                    submittedAt: 123,
                    submittedCanvases: [
                        {
                            id: 'canvas_1',
                            name: 'Overview',
                            imageUri: 'data:image/png;base64,abc',
                        },
                    ],
                },
            },
        ] as StoredInteraction[]);

        assert.deepStrictEqual(entries.map((entry) => entry.id), ['wb_done', 'ask_1']);
        assert.strictEqual(entries[0]?.type, 'whiteboard');
        assert.match(entries[0]?.preview || '', /Overview/);
    });

    it('includes whiteboards marked recreateWithChanges in unified history', () => {
        const entries = buildUnifiedHistoryEntries([
            {
                id: 'wb_changes',
                type: 'whiteboard',
                timestamp: 40,
                title: 'Requested revisions',
                whiteboardSession: {
                    id: 'wb_changes',
                    interactionId: 'wb_changes',
                    context: 'Adjust the footer spacing',
                    canvases: [],
                    activeCanvasId: undefined,
                    status: 'recreateWithChanges',
                    submittedCanvases: [],
                },
            },
        ] as StoredInteraction[]);

        assert.equal(entries[0]?.id, 'wb_changes');
        assert.equal(entries[0]?.status, 'recreateWithChanges');
    });

    it('supports localized whiteboard fallback labels', () => {
        const interactions = [
            {
                id: 'wb_localized',
                type: 'whiteboard',
                timestamp: 50,
                whiteboardSession: {
                    id: 'wb_localized',
                    interactionId: 'wb_localized',
                    canvases: [],
                    activeCanvasId: 'canvas_1',
                    status: 'cancelled',
                },
            },
        ] as StoredInteraction[];

        const entries = buildUnifiedHistoryEntries(interactions, {
            defaultTitle: 'Quadro branco',
            historyPreview: 'Quadro branco',
            pendingPreview: 'Quadro branco pendente',
            submittedPreview: 'Quadro branco enviado',
        });

        assert.strictEqual(entries[0]?.title, 'Quadro branco');
        assert.strictEqual(entries[0]?.preview, 'Quadro branco');
    });
});
