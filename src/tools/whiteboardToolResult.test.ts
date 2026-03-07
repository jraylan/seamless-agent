import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createWhiteboardLanguageModelResultParts } from './whiteboardToolResult';

describe('whiteboard language model result parts', () => {
    it('returns text-only result parts so non-vision models can consume open_whiteboard safely', async () => {
        const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-tool-result-'));
        const imagePath = path.join(tempDirectory, 'canvas.png');
        fs.writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3Zz6kAAAAASUVORK5CYII=', 'base64'));

        try {
            const result = await createWhiteboardLanguageModelResultParts({
                submitted: true,
                action: 'approved',
                instruction: 'The user approved the submitted whiteboard. Use the sceneSummary and submitted canvases as confirmed input in your next response.',
                interactionId: 'wb_test',
                canvases: [
                    {
                        id: 'canvas_1',
                        name: 'Canvas 1',
                        imageUri: `file://${imagePath}`,
                    },
                ],
                sceneSummary: {
                    totalCanvases: 1,
                    totalElements: 1,
                    canvases: [
                        {
                            id: 'canvas_1',
                            name: 'Canvas 1',
                            width: 1600,
                            height: 900,
                            backgroundColor: '#ffffff',
                            elementCount: 1,
                            elements: [
                                {
                                    id: 'seed_rect',
                                    objectType: 'rectangle',
                                    strokeColor: '#2563eb',
                                },
                            ],
                        },
                    ],
                },
            });

            assert.equal(result.length, 1);
            assert.equal(result[0]?.type, 'text');
            assert.match(result[0]?.value ?? '', /\"interactionId\":\"wb_test\"/);
            assert.match(result[0]?.value ?? '', /\"sceneSummary\"/);
        } finally {
            fs.rmSync(tempDirectory, { recursive: true, force: true });
        }
    });

    it('strips fabricState and thumbnail from canvases to prevent chat session crash', async () => {
        // Reproduce the annotation bug: result canvases may carry extra heavy fields at runtime
        // (fabricState = full Fabric.js JSON, thumbnail = base64 PNG ~100KB+).
        const heavyThumbnail = 'data:image/png;base64,' + 'A'.repeat(50000);
        const heavyFabricState = JSON.stringify({ version: '6.9.1', objects: [], background: '#ffffff', width: 1600, height: 900 });

        const result = await createWhiteboardLanguageModelResultParts({
            submitted: true,
            action: 'approved',
            instruction: 'The user approved the submitted whiteboard. Use the sceneSummary and submitted canvases as confirmed input in your next response.',
            interactionId: 'wb_heavy_test',
            canvases: [
                {
                    id: 'canvas_1',
                    name: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                    // Attach extra runtime fields that leaked before the fix
                    ...{ fabricState: heavyFabricState, thumbnail: heavyThumbnail },
                } as any,
            ],
            sceneSummary: { totalCanvases: 1, totalElements: 0, canvases: [] },
        });

        assert.equal(result.length, 1);
        assert.equal(result[0]?.type, 'text');

        const payload = result[0]?.value ?? '';
        const parsed = JSON.parse(payload);
        const canvas = parsed.canvases?.[0] ?? {};

        // Heavy fields must NOT be in the serialized output
        assert.ok(!('fabricState' in canvas), 'fabricState must be stripped from LLM result');
        assert.ok(!('thumbnail' in canvas), 'thumbnail must be stripped from LLM result');

        // Canonical fields must still be present
        assert.equal(canvas.id, 'canvas_1');
        assert.equal(canvas.name, 'Canvas 1');
        assert.equal(canvas.imageUri, 'file:///tmp/canvas.png');

        // Payload must stay well under 50KB
        assert.ok(payload.length < 50_000, `Result too large: ${payload.length} bytes`);
    });

    it('preserves the explicit whiteboard action so the model can distinguish approval from change requests', async () => {
        const result = await createWhiteboardLanguageModelResultParts({
            submitted: true,
            action: 'recreateWithChanges',
            instruction: 'The user requested changes to the submitted whiteboard. Address the annotated feedback and call open_whiteboard again with an updated sketch before concluding.',
            interactionId: 'wb_review_action',
            canvases: [
                {
                    id: 'canvas_1',
                    name: 'Canvas 1',
                    imageUri: 'file:///tmp/canvas.png',
                },
            ],
            sceneSummary: { totalCanvases: 1, totalElements: 0, canvases: [] },
        });

        const payload = JSON.parse(result[0]?.value ?? '{}');
        assert.equal(payload.action, 'recreateWithChanges');
        assert.equal(payload.submitted, true);
        assert.match(payload.instruction, /call open_whiteboard again/i);
    });
});
