import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
    isCompletedStoredInteraction,
    isLegacyWhiteboardSubmittedCanvas,
    isPendingStoredInteraction,
    mergeSubmittedWhiteboardCanvases,
    normalizeWhiteboardSubmittedCanvas,
    normalizeWhiteboardSubmittedCanvases,
    resolveWhiteboardSubmittedCanvas,
    resolveWhiteboardSubmittedCanvases,
} from './types';

describe('whiteboard submission normalization', () => {
    it('detects legacy canvas submissions', () => {
        assert.strictEqual(isLegacyWhiteboardSubmittedCanvas({
            canvasId: 'legacy-canvas',
            imageUri: 'file:///legacy.png',
            name: 'Legacy',
        }), true);

        assert.strictEqual(isLegacyWhiteboardSubmittedCanvas({
            id: 'canonical-canvas',
            imageUri: 'file:///canonical.png',
            name: 'Canonical',
        }), false);
    });

    it('does not treat mixed id/canvasId payloads as legacy submissions', () => {
        assert.strictEqual(isLegacyWhiteboardSubmittedCanvas({
            id: 'canonical-canvas',
            canvasId: 'legacy-canvas',
            imageUri: 'file:///canonical.png',
            name: 'Canonical',
        }), false);
    });

    it('normalizes legacy submit payloads to canonical ids', () => {
        assert.deepStrictEqual(
            normalizeWhiteboardSubmittedCanvas({
                canvasId: 'legacy-canvas',
                imageUri: 'file:///legacy.png',
                name: 'Legacy',
            }),
            {
                id: 'legacy-canvas',
                imageUri: 'file:///legacy.png',
                name: 'Legacy',
            }
        );
    });

    it('leaves canonical submit payloads unchanged', () => {
        const canonical = {
            id: 'canonical-canvas',
            imageUri: 'file:///canonical.png',
            name: 'Canonical',
        };

        assert.deepStrictEqual(normalizeWhiteboardSubmittedCanvas(canonical), canonical);
    });

    it('rejects submit payloads that include both id and canvasId', () => {
        assert.throws(
            () => normalizeWhiteboardSubmittedCanvas({
                id: 'canonical-canvas',
                canvasId: 'legacy-canvas',
                imageUri: 'file:///canonical.png',
                name: 'Canonical',
            }),
            /cannot include both id and canvasId/
        );
    });

    it('normalizes mixed submission arrays to canonical canvas ids', () => {
        assert.deepStrictEqual(
            normalizeWhiteboardSubmittedCanvases([
                {
                    canvasId: 'legacy-canvas',
                    imageUri: 'file:///legacy.png',
                    name: 'Legacy',
                },
                {
                    id: 'canonical-canvas',
                    imageUri: 'file:///canonical.png',
                    name: 'Canonical',
                },
            ]),
            [
                {
                    id: 'legacy-canvas',
                    imageUri: 'file:///legacy.png',
                    name: 'Legacy',
                },
                {
                    id: 'canonical-canvas',
                    imageUri: 'file:///canonical.png',
                    name: 'Canonical',
                },
            ]
        );
    });

    it('resolves stored submission names from the current session canvases', () => {
        assert.deepStrictEqual(
            resolveWhiteboardSubmittedCanvas(
                {
                    id: 'canvas-1',
                    imageUri: 'file:///resolved.png',
                },
                [
                    {
                        id: 'canvas-1',
                        name: 'Resolved name',
                    },
                ]
            ),
            {
                id: 'canvas-1',
                imageUri: 'file:///resolved.png',
                name: 'Resolved name',
            }
        );
    });

    it('prefers explicit submit payload names when resolving stored submissions', () => {
        assert.deepStrictEqual(
            resolveWhiteboardSubmittedCanvas(
                {
                    id: 'canvas-1',
                    imageUri: 'file:///explicit.png',
                    name: 'Explicit name',
                },
                [
                    {
                        id: 'canvas-1',
                        name: 'Stored name',
                    },
                ]
            ),
            {
                id: 'canvas-1',
                imageUri: 'file:///explicit.png',
                name: 'Explicit name',
            }
        );
    });

    it('resolves legacy and canonical submission arrays into stored canvas records', () => {
        assert.deepStrictEqual(
            resolveWhiteboardSubmittedCanvases(
                [
                    {
                        canvasId: 'legacy-canvas',
                        imageUri: 'file:///legacy.png',
                    },
                    {
                        id: 'canonical-canvas',
                        imageUri: 'file:///canonical.png',
                        name: 'Explicit canonical',
                    },
                ],
                [
                    {
                        id: 'legacy-canvas',
                        name: 'Legacy canvas',
                    },
                    {
                        id: 'canonical-canvas',
                        name: 'Stored canonical',
                    },
                ]
            ),
            [
                {
                    id: 'legacy-canvas',
                    imageUri: 'file:///legacy.png',
                    name: 'Legacy canvas',
                },
                {
                    id: 'canonical-canvas',
                    imageUri: 'file:///canonical.png',
                    name: 'Explicit canonical',
                },
            ]
        );
    });

    it('throws when a stored/result submission cannot be resolved to a canvas name', () => {
        assert.throws(
            () => resolveWhiteboardSubmittedCanvas(
                {
                    id: 'missing-canvas',
                    imageUri: 'file:///missing.png',
                },
                []
            ),
            /missing a name/
        );
    });

    it('merges authoritative submitted canvas state back into stored canvases', () => {
        assert.deepStrictEqual(
            mergeSubmittedWhiteboardCanvases(
                [
                    {
                        id: 'canvas-1',
                        imageUri: 'file:///submitted.png',
                        fabricState: '{"objects":[{"type":"rect"}]}',
                        thumbnail: 'data:image/png;base64,AAAA',
                        shapes: [{ id: 'rect_1', objectType: 'rectangle' }],
                        images: [],
                    },
                ],
                [
                    {
                        id: 'canvas-1',
                        name: 'Canvas One',
                        fabricState: '{"objects":[]}',
                        createdAt: 1,
                        updatedAt: 1,
                    },
                ]
            ),
            [
                {
                    id: 'canvas-1',
                    name: 'Canvas One',
                    fabricState: '{"objects":[{"type":"rect"}]}',
                    thumbnail: 'data:image/png;base64,AAAA',
                    shapes: [{ id: 'rect_1', objectType: 'rectangle' }],
                    images: [],
                    createdAt: 1,
                    updatedAt: 1,
                },
            ]
        );
    });
});

describe('stored interaction status helpers', () => {
    it('treats pending whiteboard sessions as pending interactions', () => {
        assert.strictEqual(isPendingStoredInteraction({
            id: 'wb-pending',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-1',
                interactionId: 'wb-pending',
                canvases: [],
                status: 'pending',
            },
        }), true);
    });

    it('does not treat approved whiteboard sessions as pending interactions', () => {
        assert.strictEqual(isPendingStoredInteraction({
            id: 'wb-approved',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-1',
                interactionId: 'wb-approved',
                canvases: [],
                status: 'approved',
                submittedCanvases: [],
            },
        }), false);
    });

    it('treats whiteboards without a stored session as pending interactions', () => {
        assert.strictEqual(isPendingStoredInteraction({
            id: 'wb-missing-session',
            type: 'whiteboard',
            timestamp: 1,
        }), true);
    });

    it('treats approved, recreateWithChanges, and cancelled whiteboards as completed interactions', () => {
        assert.strictEqual(isCompletedStoredInteraction({
            id: 'wb-approved',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-1',
                interactionId: 'wb-approved',
                canvases: [],
                status: 'approved',
                submittedCanvases: [],
            },
        }), true);

        assert.strictEqual(isCompletedStoredInteraction({
            id: 'wb-recreate',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-3',
                interactionId: 'wb-recreate',
                canvases: [],
                status: 'recreateWithChanges',
                submittedCanvases: [],
            },
        }), true);

        assert.strictEqual(isCompletedStoredInteraction({
            id: 'wb-cancelled',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-2',
                interactionId: 'wb-cancelled',
                canvases: [],
                status: 'cancelled',
            },
        }), true);
    });

    it('does not treat pending whiteboards as completed interactions', () => {
        assert.strictEqual(isCompletedStoredInteraction({
            id: 'wb-pending',
            type: 'whiteboard',
            timestamp: 1,
            whiteboardSession: {
                id: 'session-1',
                interactionId: 'wb-pending',
                canvases: [],
                status: 'pending',
            },
        }), false);
    });

    it('does not treat whiteboards without a stored session as completed interactions', () => {
        assert.strictEqual(isCompletedStoredInteraction({
            id: 'wb-missing-session',
            type: 'whiteboard',
            timestamp: 1,
        }), false);
    });
});
