import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
    applyStyleControlsToObject,
    applyToolMode,
    applyWhiteboardHydrationErrorState,
    applyCanvasCollectionAction,
    buildArrowPath,
    clearFabricCanvas,
    createWhiteboardHydrationErrorMessage,
    createBlankFabricCanvasState,
    eraseObjectsAtPoint,
    ensureWhiteboardSessionHasUsableCanvas,
    getShapeDraftStrokeWidthUpdate,
    getBrushSettings,
    normalizeCircleDraftGeometry,
    normalizeSerializedCanvasState,
    normalizeSerializedCanvasStateOrThrow,
    parseWhiteboardDocumentState,
    pushUndoSnapshot,
    serializeCanvasState,
    serializeWhiteboardDocumentState,
    stepUndoRedoHistory,
    summarizeSerializedCanvasState,
} from './whiteboard';

describe('whiteboard state helpers', () => {
    it('creates, switches, and deletes canvases while keeping a valid active canvas', () => {
        const created = applyCanvasCollectionAction({
            canvases: [
                {
                    id: 'canvas_1',
                    name: 'Canvas 1',
                    fabricState: '{"version":"1"}',
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            activeCanvasId: 'canvas_1',
        }, {
            type: 'create',
            canvas: {
                id: 'canvas_2',
                name: 'Canvas 2',
                fabricState: '{"version":"2"}',
                createdAt: 2,
                updatedAt: 2,
            },
        });

        assert.equal(created.activeCanvasId, 'canvas_2');
        assert.equal(created.canvases.length, 2);

        const unchangedSwitch = applyCanvasCollectionAction(created, {
            type: 'switch',
            canvasId: 1 as unknown as string,
        });
        assert.equal(unchangedSwitch.activeCanvasId, 'canvas_2');

        const switched = applyCanvasCollectionAction(created, {
            type: 'switch',
            canvasId: 'canvas_1',
        });
        assert.equal(switched.activeCanvasId, 'canvas_1');

        const deleted = applyCanvasCollectionAction(switched, {
            type: 'delete',
            canvasId: 'canvas_1',
        });

        assert.deepStrictEqual(deleted.canvases.map((canvas) => canvas.id), ['canvas_2']);
        assert.equal(deleted.activeCanvasId, 'canvas_2');
    });

    it('creates an empty Fabric-backed canvas state', () => {
        const state = createBlankFabricCanvasState();

        assert.equal(typeof state.version, 'string');
        assert.equal(state.width, 1600);
        assert.equal(state.height, 900);
        assert.equal(state.backgroundColor, '#ffffff');
        assert.deepStrictEqual(state.objects, []);
    });

    it('throws instead of silently blanking invalid serialized canvas state when strict hydration is used', () => {
        assert.throws(
            () => normalizeSerializedCanvasStateOrThrow('not valid json'),
            /Canvas data is not valid JSON/,
        );
    });

    it('migrates legacy custom whiteboard documents into fabric-compatible json', () => {
        const normalized = normalizeSerializedCanvasState(JSON.stringify({
            version: 1,
            width: 800,
            height: 600,
            backgroundColor: '#fefefe',
            objects: [
                {
                    id: 'path_1',
                    type: 'path',
                    stroke: '#111111',
                    fill: 'transparent',
                    strokeWidth: 3,
                    opacity: 1,
                    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
                },
                {
                    id: 'rect_1',
                    type: 'rectangle',
                    stroke: '#222222',
                    fill: '#eeeeee',
                    strokeWidth: 2,
                    opacity: 0.75,
                    x: 5,
                    y: 6,
                    width: 70,
                    height: 80,
                },
                {
                    id: 'arrow_1',
                    type: 'arrow',
                    stroke: '#333333',
                    fill: 'transparent',
                    strokeWidth: 4,
                    opacity: 1,
                    start: { x: 0, y: 0 },
                    end: { x: 100, y: 50 },
                },
                {
                    id: 'text_1',
                    type: 'text',
                    stroke: '#444444',
                    fill: '#ffffff',
                    strokeWidth: 1,
                    opacity: 1,
                    x: 12,
                    y: 34,
                    text: 'Hello',
                    fontSize: 24,
                    fontFamily: 'sans-serif',
                },
                {
                    id: 'image_1',
                    type: 'image',
                    stroke: '#000000',
                    fill: 'transparent',
                    strokeWidth: 0,
                    opacity: 1,
                    x: 15,
                    y: 25,
                    width: 120,
                    height: 90,
                    src: 'data:image/png;base64,AAAA',
                    mimeType: 'image/png',
                    sourceUri: 'clipboard.png',
                },
            ],
        }));

        assert.equal(normalized.width, 800);
        assert.equal(normalized.height, 600);
        assert.equal(normalized.backgroundColor, '#fefefe');
        assert.deepStrictEqual(
            normalized.objects.map((object) => [object.type, object.whiteboardObjectType, object.whiteboardId]),
            [
                ['path', 'path', 'path_1'],
                ['rect', 'rectangle', 'rect_1'],
                ['path', 'arrow', 'arrow_1'],
                ['i-text', 'text', 'text_1'],
                ['image', 'image', 'image_1'],
            ],
        );
        assert.equal(normalized.objects[4].whiteboardSourceUri, 'clipboard.png');
        assert.equal(normalized.objects[4].whiteboardMimeType, 'image/png');
    });

    it('canonicalizes serialized circle objects into path-backed circles without losing center geometry', () => {
        const normalized = normalizeSerializedCanvasState(JSON.stringify({
            version: '6.9.1',
            width: 800,
            height: 600,
            backgroundColor: '#ffffff',
            objects: [
                {
                    type: 'circle',
                    whiteboardId: 'circle_1',
                    whiteboardObjectType: 'circle',
                    left: 120,
                    top: 80,
                    originX: 'center',
                    originY: 'center',
                    radius: 20,
                    stroke: '#ffffff',
                    fill: 'rgba(255,255,255,0.3)',
                    strokeWidth: 2,
                },
            ],
        }));

        assert.equal(normalized.objects[0]?.type, 'path');
        assert.equal(normalized.objects[0]?.whiteboardObjectType, 'circle');

        assert.deepStrictEqual(parseWhiteboardDocumentState(JSON.stringify(normalized)), {
            version: 1,
            width: 800,
            height: 600,
            backgroundColor: '#ffffff',
            objects: [
                {
                    id: 'circle_1',
                    type: 'circle',
                    stroke: '#ffffff',
                    fill: 'rgba(255,255,255,0.3)',
                    strokeWidth: 2,
                    opacity: 1,
                    x: 120,
                    y: 80,
                    radius: 20,
                },
            ],
        });
    });

    it('normalizes supported Fabric runtime class names before strict hydration', () => {
        const normalized = normalizeSerializedCanvasStateOrThrow(JSON.stringify({
            version: '6.9.1',
            width: 800,
            height: 600,
            backgroundColor: '#ffffff',
            objects: [
                {
                    type: 'Rect',
                    whiteboardId: 'rect_1',
                    whiteboardObjectType: 'rectangle',
                    left: 20,
                    top: 30,
                    width: 140,
                    height: 80,
                    stroke: '#111111',
                    fill: 'rgba(17,17,17,0.1)',
                    strokeWidth: 2,
                },
            ],
        }));

        assert.equal(normalized.objects[0]?.type, 'rect');
        assert.equal(normalized.objects[0]?.whiteboardObjectType, 'rectangle');
    });

    it('round-trips legacy whiteboard documents through fabric serialization helpers', () => {
        const legacySerialized = serializeWhiteboardDocumentState({
            version: 1,
            width: 1024,
            height: 768,
            backgroundColor: '#fdfdfd',
            objects: [
                {
                    id: 'rect_1',
                    type: 'rectangle',
                    stroke: '#111111',
                    fill: '#f0f0f0',
                    strokeWidth: 2,
                    opacity: 1,
                    x: 40,
                    y: 50,
                    width: 200,
                    height: 120,
                },
                {
                    id: 'text_1',
                    type: 'text',
                    stroke: '#222222',
                    fill: '#ffffff',
                    strokeWidth: 1,
                    opacity: 1,
                    x: 80,
                    y: 120,
                    text: 'Annotate me',
                    fontSize: 24,
                    fontFamily: 'sans-serif',
                },
            ],
        });

        assert.deepStrictEqual(parseWhiteboardDocumentState(legacySerialized), {
            version: 1,
            width: 1024,
            height: 768,
            backgroundColor: '#fdfdfd',
            objects: [
                {
                    id: 'rect_1',
                    type: 'rectangle',
                    stroke: '#111111',
                    fill: '#f0f0f0',
                    strokeWidth: 2,
                    opacity: 1,
                    x: 40,
                    y: 50,
                    width: 200,
                    height: 120,
                },
                {
                    id: 'text_1',
                    type: 'text',
                    stroke: '#222222',
                    fill: '#222222',
                    strokeWidth: 1,
                    opacity: 1,
                    x: 80,
                    y: 120,
                    text: 'Annotate me',
                    fontSize: 24,
                    fontFamily: 'sans-serif',
                },
            ],
        });
    });

    it('summarizes serialized fabric objects for persistence metadata', () => {
        const serialized = serializeCanvasState({
            version: '6.9.1',
            width: 640,
            height: 480,
            backgroundColor: '#ffffff',
            objects: [
                { type: 'rect', whiteboardId: 'rect_1', whiteboardObjectType: 'rectangle' },
                { type: 'path', whiteboardId: 'arrow_1', whiteboardObjectType: 'arrow' },
                { type: 'i-text', whiteboardId: 'text_1', whiteboardObjectType: 'text', text: 'Label' },
                {
                    type: 'image',
                    whiteboardId: 'image_1',
                    whiteboardObjectType: 'image',
                    whiteboardSourceUri: 'drop.png',
                    whiteboardMimeType: 'image/png',
                    width: 320,
                    height: 240,
                },
            ],
        });

        assert.deepStrictEqual(summarizeSerializedCanvasState(serialized), {
            shapes: [
                { id: 'rect_1', objectType: 'rectangle' },
                { id: 'arrow_1', objectType: 'arrow' },
                { id: 'text_1', objectType: 'text', label: 'Label' },
                { id: 'image_1', objectType: 'image' },
            ],
            images: [
                {
                    id: 'image_1',
                    sourceUri: 'drop.png',
                    mimeType: 'image/png',
                    width: 320,
                    height: 240,
                },
            ],
        });
    });

    it('backfills a usable blank canvas for empty sessions', () => {
        const normalized = ensureWhiteboardSessionHasUsableCanvas({
            id: 'wb_blank',
            interactionId: 'wb_blank',
            status: 'pending',
            canvases: [],
        }, 42);

        assert.equal(normalized.canvases.length, 1);
        assert.equal(normalized.activeCanvasId, 'canvas_42_1');
        assert.equal(normalized.canvases[0]?.name, 'Canvas 1');
        assert.match(normalized.canvases[0]?.fabricState ?? '', /"objects":\[\]/);
        assert.equal(normalized.canvases[0]?.createdAt, 42);
        assert.equal(normalized.canvases[0]?.updatedAt, 42);
    });

    it('formats and applies a visible hydration error state instead of leaving a silent blank canvas', () => {
        const canvasPanel = { dataset: {} as Record<string, string | undefined> };
        const status = { textContent: '', dataset: {} as Record<string, string | undefined> };
        const errorBanner = { hidden: true, textContent: '' };
        const submitButton = { disabled: false };
        const canvasElement = {
            attributes: {} as Record<string, string>,
            setAttribute(name: string, value: string) {
                this.attributes[name] = value;
            },
            removeAttribute(name: string) {
                delete this.attributes[name];
            },
        };

        const message = createWhiteboardHydrationErrorMessage('Canvas 1', new Error('fabric: No class registered for rectangle'));
        applyWhiteboardHydrationErrorState({ canvasPanel, status, errorBanner, submitButton, canvasElement }, message);

        assert.equal(status.dataset.state, 'error');
        assert.equal(status.textContent, message);
        assert.equal(canvasPanel.dataset.state, 'error');
        assert.equal(errorBanner.hidden, false);
        assert.equal(errorBanner.textContent, message);
        assert.equal(submitButton.disabled, true);
        assert.equal(canvasElement.attributes['aria-invalid'], 'true');

        applyWhiteboardHydrationErrorState({ canvasPanel, status, errorBanner, submitButton, canvasElement });

        assert.equal(canvasPanel.dataset.state, 'ready');
        assert.equal(errorBanner.hidden, true);
        assert.equal(errorBanner.textContent, '');
        assert.equal(submitButton.disabled, false);
        assert.equal(canvasElement.attributes['aria-invalid'], undefined);
    });

    it('tracks undo and redo snapshots without duplicating the current state', () => {
        const baseHistory = {
            past: [] as string[],
            present: '{"objects":[]}',
            future: [] as string[],
        };

        const unchanged = pushUndoSnapshot(baseHistory, '{"objects":[]}');
        assert.deepStrictEqual(unchanged, baseHistory);

        const withFirstChange = pushUndoSnapshot(baseHistory, '{"objects":[{"id":"a"}]}');
        assert.deepStrictEqual(withFirstChange, {
            past: ['{"objects":[]}'],
            present: '{"objects":[{"id":"a"}]}',
            future: [],
        });

        const undone = stepUndoRedoHistory(withFirstChange, 'undo');
        assert.deepStrictEqual(undone, {
            past: [],
            present: '{"objects":[]}',
            future: ['{"objects":[{"id":"a"}]}'],
        });

        const redone = stepUndoRedoHistory(undone, 'redo');
        assert.deepStrictEqual(redone, withFirstChange);
    });

    it('exposes accessible whiteboard status and canvas semantics in the markup', () => {
        const markup = readFileSync(path.join(process.cwd(), 'media', 'whiteboard.html'), 'utf8');

        assert.match(markup, /id="whiteboard-status"[^>]*role="status"/);
        assert.match(markup, /id="whiteboard-status"[^>]*aria-live="polite"/);
        assert.match(markup, /id="whiteboard-hydration-error"[^>]*role="alert"/);
        assert.match(markup, /id="canvas-tabs"[^>]*role="tablist"/);
        assert.match(markup, /id="whiteboard-canvas-panel"[^>]*role="tabpanel"/);
        assert.match(markup, /id="whiteboard-canvas"[^>]*tabindex="0"/);
        assert.match(markup, /id="whiteboard-canvas"[^>]*aria-label="Whiteboard drawing surface"/);
    });

    it('keeps keyboard shortcuts and full tab semantics wired for accessibility', () => {
        const source = readFileSync(path.join(process.cwd(), 'src', 'webview', 'whiteboard.ts'), 'utf8');

        assert.match(source, /document\.addEventListener\('keydown'/);
        assert.match(source, /event\.key\.toLowerCase\(\) === 'z'/);
        assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
        assert.match(source, /role="tab"/);
        assert.match(source, /id="\$\{escapeHtml\(getCanvasTabId\(entry\.id\)\)\}"/);
        assert.match(source, /aria-selected="\$\{entry\.id === activeCanvasId \? 'true' : 'false'\}"/);
        assert.match(source, /aria-controls="whiteboard-canvas-panel"/);
        assert.match(source, /document\.getElementById\('whiteboard-canvas-panel'\)/);
        assert.match(source, /canvasPanel\.setAttribute\('aria-labelledby', activeTabId\)/);
    });

    it('serializes large canvases within a practical performance budget', () => {
        const largeState = {
            version: '6.9.1',
            width: 1600,
            height: 900,
            backgroundColor: '#ffffff',
            objects: Array.from({ length: 2500 }, (_, index) => ({
                type: index % 5 === 0 ? 'image' : 'rect',
                whiteboardId: `object_${index}`,
                whiteboardObjectType: index % 5 === 0 ? 'image' : 'rectangle',
                whiteboardSourceUri: index % 5 === 0 ? `image-${index}.png` : undefined,
                whiteboardMimeType: index % 5 === 0 ? 'image/png' : undefined,
                left: (index % 50) * 20,
                top: Math.floor(index / 50) * 10,
                width: 120,
                height: 80,
                fill: '#f0f0f0',
                stroke: '#1f1f1f',
                strokeWidth: 2,
                text: index % 7 === 0 ? `Label ${index}` : undefined,
            })),
        } satisfies Parameters<typeof serializeCanvasState>[0];

        const startedAt = performance.now();
        const serialized = serializeCanvasState(largeState);
        const normalized = normalizeSerializedCanvasState(serialized);
        const summary = summarizeSerializedCanvasState(serialized);
        const elapsedMs = performance.now() - startedAt;

        assert.equal(normalized.objects.length, 2500);
        assert.equal(summary.shapes.length, 2500);
        assert.equal(summary.images.length, 500);
        assert.ok(serialized.length > 100000, 'expected serialized output to be meaningfully large');
        assert.ok(elapsedMs < 1500, `large canvas serialization took ${elapsedMs}ms`);
    });

    it('exposes the circle and annotation tools in the toolbar markup', () => {
        const markup = readFileSync(path.join(process.cwd(), 'media', 'whiteboard.html'), 'utf8');

        assert.match(markup, /data-tool="circle"/);
        assert.match(markup, />\s*Circle\s*</);
        assert.match(markup, /data-tool="annotation"/);
        assert.match(markup, />\s*Annotation\s*</);
        assert.doesNotMatch(markup, /data-tool="ellipse"/);
        assert.match(markup, /data-tool="eraser"/);
    });

    it('derives highlighter brushes with transparent wider strokes', () => {
        assert.deepStrictEqual(getBrushSettings('pen', '#123456', 3), {
            color: '#123456',
            width: 3,
        });
        assert.deepStrictEqual(getBrushSettings('highlighter', '#123456', 3), {
            color: 'rgba(18, 52, 86, 0.35)',
            width: 12,
        });
    });

    it('normalizes circle drafts to a square bounding box', () => {
        assert.deepStrictEqual(normalizeCircleDraftGeometry({ x: 10, y: 20 }, { x: 50, y: 35 }), {
            centerX: 30,
            centerY: 40,
            radius: 20,
        });
        assert.deepStrictEqual(normalizeCircleDraftGeometry({ x: 50, y: 50 }, { x: 20, y: 10 }), {
            centerX: 30,
            centerY: 30,
            radius: 20,
        });
    });

    it('enables selection only for the select tool', () => {
        const updates: Array<Record<string, unknown>> = [];
        let discarded = 0;
        let rendered = 0;

        const canvas = {
            isDrawingMode: true,
            selection: false,
            getObjects: () => [
                {
                    set: (value: Record<string, unknown>) => updates.push(value),
                },
            ],
            discardActiveObject: () => {
                discarded += 1;
            },
            requestRenderAll: () => {
                rendered += 1;
            },
        };

        applyToolMode(canvas, 'select', '#000000', 2);

        assert.equal(canvas.isDrawingMode, false);
        assert.equal(canvas.selection, true);
        assert.deepStrictEqual(updates, [{ selectable: true, evented: true }]);
        assert.equal(discarded, 0);
        assert.equal(rendered, 1);
    });

    it('applies style controls consistently across supported object types', () => {
        const rectangleUpdates: Array<Record<string, unknown>> = [];
        const circleUpdates: Array<Record<string, unknown>> = [];
        const lineUpdates: Array<Record<string, unknown>> = [];
        const arrowUpdates: Array<Record<string, unknown>> = [];
        const textUpdates: Array<Record<string, unknown>> = [];
        const imageUpdates: Array<Record<string, unknown>> = [];

        assert.equal(applyStyleControlsToObject({
            type: 'rect',
            set: (value: Record<string, unknown>) => rectangleUpdates.push(value),
        }, {
            strokeColor: '#101010',
            fillColor: '#fafafa',
            strokeWidth: 7,
        }), true);
        assert.deepStrictEqual(rectangleUpdates, [{
            stroke: '#101010',
            fill: '#fafafa',
            strokeWidth: 7,
        }]);

        assert.equal(applyStyleControlsToObject({
            type: 'ellipse',
            whiteboardObjectType: 'circle',
            set: (value: Record<string, unknown>) => circleUpdates.push(value),
        }, {
            strokeColor: '#151515',
            fillColor: '#f5f5f5',
            strokeWidth: 5,
        }), true);
        assert.deepStrictEqual(circleUpdates, [{
            stroke: '#151515',
            fill: '#f5f5f5',
            strokeWidth: 5,
        }]);

        assert.equal(applyStyleControlsToObject({
            type: 'line',
            set: (value: Record<string, unknown>) => lineUpdates.push(value),
        }, {
            strokeColor: '#202020',
            fillColor: '#ededed',
            strokeWidth: 4,
        }), true);
        assert.deepStrictEqual(lineUpdates, [{
            stroke: '#202020',
            strokeWidth: 4,
        }]);

        const arrowPath = buildArrowPath({ x: 10, y: 15 }, { x: 80, y: 45 }, 3);
        assert.equal(applyStyleControlsToObject({
            type: 'path',
            whiteboardObjectType: 'arrow',
            path: arrowPath,
            get: (key: string) => (key === 'path' ? arrowPath : undefined),
            set: (value: Record<string, unknown>) => arrowUpdates.push(value),
        }, {
            strokeColor: '#252525',
            fillColor: '#dddddd',
            strokeWidth: 9,
        }), true);
        assert.deepStrictEqual(arrowUpdates, [{
            stroke: '#252525',
            strokeWidth: 9,
            path: buildArrowPath({ x: 10, y: 15 }, { x: 80, y: 45 }, 9),
        }]);

        assert.equal(applyStyleControlsToObject({
            type: 'i-text',
            set: (value: Record<string, unknown>) => textUpdates.push(value),
        }, {
            strokeColor: '#303030',
            fillColor: '#dedede',
            strokeWidth: 9,
        }), true);
        assert.deepStrictEqual(textUpdates, [{
            fill: '#303030',
        }]);

        assert.equal(applyStyleControlsToObject({
            type: 'image',
            set: (value: Record<string, unknown>) => imageUpdates.push(value),
        }, {
            strokeColor: '#404040',
            fillColor: '#cdcdcd',
            strokeWidth: 2,
        }), false);
        assert.deepStrictEqual(imageUpdates, []);
    });

    it('preserves the active arrow draft endpoint when stroke width changes', () => {
        const arrowPath = buildArrowPath({ x: 10, y: 15 }, { x: 80, y: 45 }, 3);

        assert.deepStrictEqual(getShapeDraftStrokeWidthUpdate({
            tool: 'arrow',
            origin: { x: 10, y: 15 },
            object: {
                path: arrowPath,
                get: (key: string) => (key === 'path' ? arrowPath : undefined),
            },
        }, 9), {
            strokeWidth: 9,
            path: buildArrowPath({ x: 10, y: 15 }, { x: 80, y: 45 }, 9),
        });
    });

    it('erases the topmost object containing the pointer', () => {
        const removed: unknown[] = [];
        let discarded = 0;
        let rendered = 0;

        const bottomObject = {
            getBoundingRect: () => ({ left: 0, top: 0, width: 80, height: 80 }),
        };
        const topObject = {
            getBoundingRect: () => ({ left: 10, top: 10, width: 30, height: 30 }),
        };

        const canvas = {
            getObjects: () => [bottomObject, topObject],
            remove: (value: unknown) => removed.push(value),
            discardActiveObject: () => {
                discarded += 1;
            },
            requestRenderAll: () => {
                rendered += 1;
            },
        };

        assert.equal(eraseObjectsAtPoint(canvas, { x: 25, y: 25 }), true);
        assert.deepStrictEqual(removed, [topObject]);
        assert.equal(discarded, 1);
        assert.equal(rendered, 1);
        assert.equal(eraseObjectsAtPoint(canvas, { x: 120, y: 120 }), false);
    });

    it('clears a fabric canvas while restoring the background color', () => {
        let backgroundColor = '#111111';
        let cleared = 0;
        let rendered = 0;

        const canvas = {
            clear: () => {
                cleared += 1;
                backgroundColor = '';
            },
            requestRenderAll: () => {
                rendered += 1;
            },
            set backgroundColor(value: string) {
                backgroundColor = value;
            },
            get backgroundColor() {
                return backgroundColor;
            },
        };

        clearFabricCanvas(canvas, '#ffffff');

        assert.equal(cleared, 1);
        assert.equal(rendered, 1);
        assert.equal(canvas.backgroundColor, '#ffffff');
    });
});
