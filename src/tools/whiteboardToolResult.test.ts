import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createWhiteboardLanguageModelResultParts } from './whiteboardToolResult';

describe('whiteboard language model result parts', () => {
    it('returns text-only result parts so models can consume open_whiteboard safely', async () => {
        const result = await createWhiteboardLanguageModelResultParts({
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the returned whiteboard images as confirmed visual input in your next response.',
            interactionId: 'wb_test',
            images: [
                {
                    canvasId: 'canvas_1',
                    canvasName: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                    width: 1600,
                    height: 900,
                },
            ],
        });

        assert.equal(result.length, 1);
        assert.equal(result[0]?.type, 'text');
        assert.match(result[0]?.value ?? '', /"interactionId":"wb_test"/);
        assert.match(result[0]?.value ?? '', /"images"/);
    });

    it('serializes image-focused whiteboard payloads and omits legacy scene data', async () => {
        const result = await createWhiteboardLanguageModelResultParts({
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the returned whiteboard images as confirmed visual input in your next response.',
            interactionId: 'wb_image_payload',
            images: [
                {
                    canvasId: 'canvas_1',
                    canvasName: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                    width: 1600,
                    height: 900,
                },
            ],
        });

        const payload = JSON.parse(result[0]?.value ?? '{}');
        assert.deepStrictEqual(payload.images, [
            {
                canvasId: 'canvas_1',
                canvasName: 'Canvas 1',
                imageUri: 'file:///tmp/canvas.png',
                width: 1600,
                height: 900,
            },
        ]);
        assert.ok(!('sceneSummary' in payload), 'sceneSummary must not be forwarded for image-first results');
        assert.ok(!('canvases' in payload), 'legacy canvases payload must not be forwarded for image-first results');
    });

    it('preserves the explicit whiteboard action so the model can distinguish approval from change requests', async () => {
        const result = await createWhiteboardLanguageModelResultParts({
            submitted: true,
            action: 'recreateWithChanges',
            instruction: 'The user requested changes to the submitted whiteboard. Address the annotated feedback and call open_whiteboard again with updated whiteboard images before concluding.',
            interactionId: 'wb_review_action',
            images: [
                {
                    canvasId: 'canvas_1',
                    canvasName: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                    width: 1600,
                    height: 900,
                },
            ],
        });

        const payload = JSON.parse(result[0]?.value ?? '{}');
        assert.equal(payload.action, 'recreateWithChanges');
        assert.equal(payload.submitted, true);
        assert.match(payload.instruction, /call open_whiteboard again/i);
    });
});
