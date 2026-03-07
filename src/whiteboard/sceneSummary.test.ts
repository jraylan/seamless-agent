import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeWhiteboardScene } from './sceneSummary';

describe('whiteboard scene summary', () => {
    it('summarizes coordinate geometry for common Fabric object types', () => {
        const summary = summarizeWhiteboardScene([
            {
                id: 'canvas_1',
                name: 'Canvas 1',
                fabricState: JSON.stringify({
                    version: '6.9.1',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    objects: [
                        {
                            type: 'rect',
                            whiteboardId: 'rect_1',
                            whiteboardObjectType: 'rectangle',
                            left: 40,
                            top: 50,
                            width: 220,
                            height: 120,
                            angle: 15,
                            stroke: '#2563eb',
                            fill: 'rgba(37,99,235,0.18)',
                            strokeWidth: 2,
                        },
                        {
                            type: 'path',
                            whiteboardId: 'circle_1',
                            whiteboardObjectType: 'circle',
                            left: 300,
                            top: 80,
                            width: 120,
                            height: 120,
                            radius: 60,
                            path: [
                                ['M', 360, 80],
                                ['C', 393.1370849898476, 80, 420, 106.86291501015239, 420, 140],
                                ['C', 420, 173.1370849898476, 393.1370849898476, 200, 360, 200],
                                ['C', 326.8629150101524, 200, 300, 173.1370849898476, 300, 140],
                                ['C', 300, 106.86291501015239, 326.8629150101524, 80, 360, 80],
                                ['Z'],
                            ],
                            stroke: '#dc2626',
                            fill: 'rgba(220,38,38,0.18)',
                            strokeWidth: 2,
                        },
                        {
                            type: 'line',
                            whiteboardId: 'line_1',
                            whiteboardObjectType: 'line',
                            x1: 780,
                            y1: 80,
                            x2: 1040,
                            y2: 220,
                            stroke: '#f97316',
                            strokeWidth: 6,
                        },
                        {
                            type: 'i-text',
                            whiteboardId: 'text_1',
                            whiteboardObjectType: 'text',
                            text: 'Whiteboard Demo',
                            left: 60,
                            top: 260,
                            fontSize: 32,
                            fontFamily: 'sans-serif',
                            stroke: '#111827',
                            fill: '#111827',
                            strokeWidth: 1,
                        },
                        {
                            type: 'path',
                            whiteboardId: 'arrow_1',
                            whiteboardObjectType: 'arrow',
                            path: 'M 0 0 L 20 20 M 15 5 L 20 20 L 5 15',
                            stroke: '#111111',
                            strokeWidth: 2,
                        },
                    ],
                }),
            },
        ]);

        assert.deepStrictEqual(summary, {
            totalCanvases: 1,
            totalElements: 5,
            canvases: [
                {
                    id: 'canvas_1',
                    name: 'Canvas 1',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    elementCount: 5,
                    elements: [
                        {
                            id: 'rect_1',
                            objectType: 'rectangle',
                            bounds: { x: 40, y: 50, width: 220, height: 120 },
                            center: { x: 150, y: 110 },
                            zIndex: 0,
                            rotation: 15,
                            strokeColor: '#2563eb',
                            fillColor: 'rgba(37,99,235,0.18)',
                            strokeWidth: 2,
                            opacity: 1,
                        },
                        {
                            id: 'circle_1',
                            objectType: 'circle',
                            bounds: { x: 300, y: 80, width: 120, height: 120 },
                            center: { x: 360, y: 140 },
                            zIndex: 1,
                            strokeColor: '#dc2626',
                            fillColor: 'rgba(220,38,38,0.18)',
                            strokeWidth: 2,
                            opacity: 1,
                        },
                        {
                            id: 'line_1',
                            objectType: 'line',
                            bounds: { x: 780, y: 80, width: 260, height: 140 },
                            center: { x: 910, y: 150 },
                            zIndex: 2,
                            strokeColor: '#f97316',
                            strokeWidth: 6,
                            opacity: 1,
                        },
                        {
                            id: 'text_1',
                            objectType: 'text',
                            label: 'Whiteboard Demo',
                            zIndex: 3,
                            fontSize: 32,
                            fontFamily: 'sans-serif',
                            strokeColor: '#111827',
                            fillColor: '#111827',
                            strokeWidth: 1,
                            opacity: 1,
                        },
                        {
                            id: 'arrow_1',
                            objectType: 'arrow',
                            bounds: { x: 0, y: 0, width: 20, height: 20 },
                            center: { x: 10, y: 10 },
                            points: [
                                { x: 0, y: 0 },
                                { x: 20, y: 20 },
                                { x: 15, y: 5 },
                                { x: 20, y: 20 },
                                { x: 5, y: 15 },
                            ],
                            zIndex: 4,
                            strokeColor: '#111111',
                            strokeWidth: 2,
                            opacity: 1,
                        },
                    ],
                },
            ],
        });
    });

    it('returns an empty scene summary when canvases are missing or invalid', () => {
        assert.deepStrictEqual(summarizeWhiteboardScene([]), {
            totalCanvases: 0,
            totalElements: 0,
            canvases: [],
        });

        assert.deepStrictEqual(summarizeWhiteboardScene([
            {
                id: 'canvas_invalid',
                name: 'Canvas Invalid',
                fabricState: 'not json',
            },
        ]), {
            totalCanvases: 1,
            totalElements: 0,
            canvases: [
                {
                    id: 'canvas_invalid',
                    name: 'Canvas Invalid',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    elementCount: 0,
                    elements: [],
                },
            ],
        });
    });

    it('collapses linked annotation helper objects into a single annotation summary', () => {
        const summary = summarizeWhiteboardScene([
            {
                id: 'canvas_annotation',
                name: 'Canvas Annotation',
                fabricState: JSON.stringify({
                    version: '6.9.1',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    objects: [
                        {
                            type: 'line',
                            whiteboardId: 'annotation_pointer_1',
                            whiteboardObjectType: 'annotationPointer',
                            annotationId: 'annotation_1',
                            annotationRole: 'pointer',
                            x1: 320,
                            y1: 260,
                            x2: 180,
                            y2: 360,
                        },
                        {
                            type: 'rect',
                            whiteboardId: 'annotation_bubble_1',
                            whiteboardObjectType: 'annotationBubble',
                            annotationId: 'annotation_1',
                            annotationRole: 'bubble',
                            left: 240,
                            top: 180,
                            width: 220,
                            height: 96,
                        },
                        {
                            type: 'textbox',
                            whiteboardId: 'annotation_text_1',
                            whiteboardObjectType: 'annotation',
                            annotationId: 'annotation_1',
                            annotationRole: 'text',
                            text: 'Check this edge case',
                            left: 256,
                            top: 192,
                            width: 188,
                            annotationBubbleLeft: 240,
                            annotationBubbleTop: 180,
                            annotationBubbleWidth: 220,
                            annotationBubbleHeight: 96,
                            annotationTargetX: 180,
                            annotationTargetY: 360,
                            fill: '#111827',
                            fontSize: 18,
                        },
                        {
                            type: 'circle',
                            whiteboardId: 'annotation_handle_1',
                            whiteboardObjectType: 'annotationHandle',
                            annotationId: 'annotation_1',
                            annotationRole: 'handle',
                            left: 180,
                            top: 360,
                            radius: 7,
                            originX: 'center',
                            originY: 'center',
                        },
                    ],
                }),
            },
        ]);

        assert.deepStrictEqual(summary, {
            totalCanvases: 1,
            totalElements: 1,
            canvases: [
                {
                    id: 'canvas_annotation',
                    name: 'Canvas Annotation',
                    width: 1600,
                    height: 900,
                    backgroundColor: '#ffffff',
                    elementCount: 1,
                    elements: [
                        {
                            id: 'annotation_text_1',
                            objectType: 'annotation',
                            bounds: { x: 240, y: 180, width: 220, height: 96 },
                            center: { x: 350, y: 228 },
                            target: { x: 180, y: 360 },
                            label: 'Check this edge case',
                            zIndex: 0,
                            fontSize: 18,
                            fillColor: '#111827',
                            opacity: 1,
                        },
                    ],
                },
            ],
        });
    });
});
