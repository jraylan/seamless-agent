import * as fabric from 'fabric';
import {
    createBlankFabricCanvasState,
    DEFAULT_WHITEBOARD_CANVAS_BACKGROUND as DEFAULT_BACKGROUND,
    DEFAULT_WHITEBOARD_CANVAS_HEIGHT as DEFAULT_HEIGHT,
    DEFAULT_WHITEBOARD_CANVAS_NAME as DEFAULT_CANVAS_NAME,
    DEFAULT_WHITEBOARD_CANVAS_WIDTH as DEFAULT_WIDTH,
} from '../whiteboard/canvasState';
import { createCirclePathFabricObject } from '../whiteboard/circlePath';
import {
    assertWhiteboardFabricObjectsSupported,
    ensureWhiteboardFabricRegistry,
    normalizeWhiteboardFabricObjectType,
} from '../whiteboard/fabricRegistry';
export { createBlankFabricCanvasState } from '../whiteboard/canvasState';

import type {
    ExtensionToWhiteboardMessage,
    VSCodeAPI,
    WhiteboardCanvas,
    WhiteboardImageReference,
    WhiteboardReviewAction,
    WhiteboardSession,
    WhiteboardShapeSummary,
    WhiteboardToExtensionMessage,
} from './types';
import { getLogger } from './utils';

export type WhiteboardTool = 'select' | 'pen' | 'highlighter' | 'rectangle' | 'circle' | 'line' | 'arrow' | 'text' | 'annotation' | 'eraser';

type ShapeTool = Extract<WhiteboardTool, 'rectangle' | 'circle' | 'line' | 'arrow'>;

export interface WhiteboardDocumentObjectBase {
    id: string;
    type: 'path' | 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image';
    stroke: string;
    fill: string;
    strokeWidth: number;
    opacity: number;
}

export interface WhiteboardPoint {
    x: number;
    y: number;
}

export interface WhiteboardPathObject extends WhiteboardDocumentObjectBase {
    type: 'path';
    points: WhiteboardPoint[];
}

export interface WhiteboardRectangleObject extends WhiteboardDocumentObjectBase {
    type: 'rectangle';
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WhiteboardCircleObject extends WhiteboardDocumentObjectBase {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
}

export interface WhiteboardEllipseObject extends WhiteboardDocumentObjectBase {
    type: 'ellipse';
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
}

export interface WhiteboardLineObject extends WhiteboardDocumentObjectBase {
    type: 'line' | 'arrow';
    start: WhiteboardPoint;
    end: WhiteboardPoint;
}

export interface WhiteboardTextObject extends WhiteboardDocumentObjectBase {
    type: 'text';
    x: number;
    y: number;
    text: string;
    fontSize: number;
    fontFamily: string;
}

export interface WhiteboardImageObject extends WhiteboardDocumentObjectBase {
    type: 'image';
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    mimeType?: string;
    sourceUri?: string;
}

export type WhiteboardDocumentObject =
    | WhiteboardPathObject
    | WhiteboardRectangleObject
    | WhiteboardCircleObject
    | WhiteboardEllipseObject
    | WhiteboardLineObject
    | WhiteboardTextObject
    | WhiteboardImageObject;

export interface WhiteboardDocumentState {
    version: 1;
    width: number;
    height: number;
    backgroundColor: string;
    objects: WhiteboardDocumentObject[];
}

export interface SerializedCanvasObject {
    type: string;
    whiteboardId?: string;
    whiteboardObjectType?: string;
    whiteboardSourceUri?: string;
    whiteboardMimeType?: string;
    text?: string;
    radius?: number;
    width?: number;
    height?: number;
    objects?: SerializedCanvasObject[];
    [key: string]: unknown;
}

export interface SerializedCanvasState {
    version: string;
    width: number;
    height: number;
    backgroundColor: string;
    objects: SerializedCanvasObject[];
    [key: string]: unknown;
}

export interface WhiteboardCanvasCollectionState {
    canvases: WhiteboardCanvas[];
    activeCanvasId?: string;
}

export type WhiteboardCanvasCollectionAction =
    | { type: 'create'; canvas: WhiteboardCanvas }
    | { type: 'switch'; canvasId: string }
    | { type: 'delete'; canvasId: string };

export interface UndoHistoryState {
    past: string[];
    present: string;
    future: string[];
}

export interface WhiteboardHydrationErrorStateElements {
    canvasPanel: { dataset: Record<string, string | undefined> };
    status: { textContent: string | null; dataset: Record<string, string | undefined> };
    errorBanner: { hidden: boolean; textContent: string | null };
    submitButton: { disabled: boolean };
    requestChangesButton?: { disabled: boolean };
    canvasElement: {
        setAttribute(name: string, value: string): void;
        removeAttribute(name: string): void;
    };
}

type ShapeDraft = {
    tool: ShapeTool;
    origin: WhiteboardPoint;
    object: any;
};

type AnnotationRole = 'bubble' | 'text' | 'pointer' | 'handle';

const MAX_HISTORY = 50;
const SERIALIZED_OBJECT_CUSTOM_PROPERTIES = [
    'whiteboardId',
    'whiteboardObjectType',
    'whiteboardSourceUri',
    'whiteboardMimeType',
    'annotationId',
    'annotationRole',
    'annotationBubbleLeft',
    'annotationBubbleTop',
    'annotationBubbleWidth',
    'annotationBubbleHeight',
    'annotationTargetX',
    'annotationTargetY',
];
const ANNOTATION_PADDING_X = 16;
const ANNOTATION_PADDING_Y = 12;
const ANNOTATION_MIN_WIDTH = 220;
const ANNOTATION_MIN_HEIGHT = 84;

export function createEmptyWhiteboardDocument(): WhiteboardDocumentState {
    return {
        version: 1,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        backgroundColor: DEFAULT_BACKGROUND,
        objects: [],
    };
}

export function createDefaultWhiteboardCanvas(now: number = Date.now()): WhiteboardCanvas {
    return {
        id: `canvas_${now}_1`,
        name: DEFAULT_CANVAS_NAME,
        fabricState: serializeCanvasState(createBlankFabricCanvasState()),
        createdAt: now,
        updatedAt: now,
    };
}

export function ensureWhiteboardSessionHasUsableCanvas(session: WhiteboardSession, now: number = Date.now()): WhiteboardSession {
    if (session.canvases.length === 0) {
        const defaultCanvas = createDefaultWhiteboardCanvas(now);
        return {
            ...session,
            canvases: [defaultCanvas],
            activeCanvasId: defaultCanvas.id,
        };
    }

    if (session.activeCanvasId && session.canvases.some((canvas) => canvas.id === session.activeCanvasId)) {
        return session;
    }

    return {
        ...session,
        activeCanvasId: session.canvases[0]?.id,
    };
}

export function serializeCanvasState(state: SerializedCanvasState): string {
    return JSON.stringify(state);
}

export function parseWhiteboardDocumentState(serialized?: string): WhiteboardDocumentState {
    const normalized = normalizeSerializedCanvasState(serialized);
    const legacyObjects = normalized.objects
        .map((object) => convertSerializedObjectToLegacyObject(object))
        .filter((object): object is WhiteboardDocumentObject => Boolean(object));

    return {
        version: 1,
        width: normalized.width,
        height: normalized.height,
        backgroundColor: normalized.backgroundColor,
        objects: legacyObjects,
    };
}

export function serializeWhiteboardDocumentState(state: WhiteboardDocumentState): string {
    return serializeCanvasState(convertLegacyDocumentToSerializedCanvasState(state));
}

export function normalizeSerializedCanvasState(serialized?: string): SerializedCanvasState {
    try {
        return normalizeSerializedCanvasStateOrThrow(serialized);
    } catch {
        return createBlankFabricCanvasState();
    }
}

export function normalizeSerializedCanvasStateOrThrow(serialized?: string): SerializedCanvasState {
    if (!serialized) {
        return createBlankFabricCanvasState();
    }

    let parsed: Partial<SerializedCanvasState | WhiteboardDocumentState>;
    try {
        parsed = JSON.parse(serialized) as Partial<SerializedCanvasState | WhiteboardDocumentState>;
    } catch {
        throw new Error('Canvas data is not valid JSON');
    }

    if (looksLikeLegacyDocumentState(parsed)) {
        return convertLegacyDocumentToSerializedCanvasState(parsed);
    }

    const normalized = {
        ...createBlankFabricCanvasState(),
        ...parsed,
        version: typeof parsed.version === 'string' ? parsed.version : fabric.version,
        width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_WIDTH,
        height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_HEIGHT,
        backgroundColor: typeof parsed.backgroundColor === 'string' ? parsed.backgroundColor : DEFAULT_BACKGROUND,
        objects: Array.isArray(parsed.objects)
            ? canonicalizeSerializedCanvasObjects(parsed.objects as SerializedCanvasObject[])
            : [],
    };

    assertWhiteboardFabricObjectsSupported(normalized.objects);
    return normalized;
}

function canonicalizeSerializedCanvasObjects(objects: SerializedCanvasObject[]): SerializedCanvasObject[] {
    return objects.map((object) => canonicalizeSerializedCanvasObject(object));
}

function canonicalizeSerializedCanvasObject(object: SerializedCanvasObject): SerializedCanvasObject {
    const nestedObjects = Array.isArray(object.objects)
        ? canonicalizeSerializedCanvasObjects(object.objects)
        : undefined;
    const baseObject = (nestedObjects
        ? {
            ...object,
            type: typeof object.type === 'string' ? normalizeWhiteboardFabricObjectType(object.type) : object.type,
            objects: nestedObjects,
        }
        : {
            ...object,
            type: typeof object.type === 'string' ? normalizeWhiteboardFabricObjectType(object.type) : object.type,
        }) as SerializedCanvasObject & Record<string, unknown>;

    if (getSerializedObjectType(baseObject) !== 'circle') {
        return baseObject;
    }

    const radius = typeof baseObject.radius === 'number'
        ? baseObject.radius
        : typeof baseObject.rx === 'number'
            ? baseObject.rx
            : typeof baseObject.ry === 'number'
                ? baseObject.ry
                : typeof baseObject.width === 'number'
                    ? baseObject.width / 2
                    : typeof baseObject.height === 'number'
                        ? baseObject.height / 2
                        : 0;
    const left = typeof baseObject.left === 'number' ? baseObject.left : 0;
    const top = typeof baseObject.top === 'number' ? baseObject.top : 0;
    const centerX = baseObject.originX === 'center' ? left : left + radius;
    const centerY = baseObject.originY === 'center' ? top : top + radius;

    return createCirclePathFabricObject({
        centerX,
        centerY,
        radius,
        stroke: typeof baseObject.stroke === 'string' ? baseObject.stroke : '#111827',
        fill: typeof baseObject.fill === 'string' ? baseObject.fill : 'rgba(0,0,0,0)',
        strokeWidth: typeof baseObject.strokeWidth === 'number' ? baseObject.strokeWidth : 1,
        opacity: typeof baseObject.opacity === 'number' ? baseObject.opacity : 1,
        whiteboardId: typeof baseObject.whiteboardId === 'string' ? baseObject.whiteboardId : makeId('object'),
        whiteboardObjectType: 'circle',
        ...(typeof (baseObject as Record<string, unknown>).whiteboardZIndex === 'number'
            ? { whiteboardZIndex: (baseObject as Record<string, unknown>).whiteboardZIndex as number }
            : {}),
        ...(typeof (baseObject as Record<string, unknown>).angle === 'number'
            ? { angle: (baseObject as Record<string, unknown>).angle as number }
            : {}),
    }) as SerializedCanvasObject;
}

export function createWhiteboardHydrationErrorMessage(canvasName: string, error: unknown): string {
    const normalizedCanvasName = canvasName.trim().length > 0 ? canvasName : 'this canvas';
    const detail = error instanceof Error && error.message.trim().length > 0
        ? ` ${error.message.trim()}`
        : '';
    return `Failed to load ${normalizedCanvasName}. The saved canvas data could not be hydrated in Fabric.js.${detail}`;
}

export function applyWhiteboardHydrationErrorState(
    elements: WhiteboardHydrationErrorStateElements,
    message?: string,
): void {
    if (message) {
        elements.canvasPanel.dataset.state = 'error';
        elements.status.textContent = message;
        elements.status.dataset.state = 'error';
        elements.errorBanner.hidden = false;
        elements.errorBanner.textContent = message;
        elements.submitButton.disabled = true;
        if (elements.requestChangesButton) {
            elements.requestChangesButton.disabled = true;
        }
        elements.canvasElement.setAttribute('aria-invalid', 'true');
        return;
    }

    elements.canvasPanel.dataset.state = 'ready';
    elements.errorBanner.hidden = true;
    elements.errorBanner.textContent = '';
    elements.submitButton.disabled = false;
    if (elements.requestChangesButton) {
        elements.requestChangesButton.disabled = false;
    }
    elements.canvasElement.removeAttribute('aria-invalid');

    if (elements.status.dataset.state === 'error') {
        elements.status.dataset.state = 'info';
    }
}

export function summarizeSerializedCanvasState(serialized?: string): {
    shapes: WhiteboardShapeSummary[];
    images: WhiteboardImageReference[];
} {
    const normalized = normalizeSerializedCanvasState(serialized);
    const shapes: WhiteboardShapeSummary[] = [];
    const images: WhiteboardImageReference[] = [];

    visitSerializedObjects(normalized.objects, (object) => {
        if (typeof (object as Record<string, unknown>).annotationId === 'string'
            && (object as Record<string, unknown>).annotationRole !== 'text') {
            return;
        }

        const id = getSerializedObjectId(object);
        const objectType = getSerializedObjectType(object);
        shapes.push({
            id,
            objectType,
            ...(objectType === 'text' && typeof object.text === 'string' ? { label: object.text } : {}),
        });

        if (objectType === 'image') {
            images.push({
                id,
                sourceUri: typeof object.whiteboardSourceUri === 'string' ? object.whiteboardSourceUri : undefined,
                mimeType: typeof object.whiteboardMimeType === 'string' ? object.whiteboardMimeType : undefined,
                width: typeof object.width === 'number' ? object.width : undefined,
                height: typeof object.height === 'number' ? object.height : undefined,
            });
        }
    });

    return { shapes, images };
}

export function applyCanvasCollectionAction(state: WhiteboardCanvasCollectionState, action: WhiteboardCanvasCollectionAction): WhiteboardCanvasCollectionState {
    switch (action.type) {
        case 'create':
            return {
                canvases: [...state.canvases.filter((canvas) => canvas.id !== action.canvas.id), action.canvas],
                activeCanvasId: action.canvas.id,
            };
        case 'switch':
            return state.canvases.some((canvas) => canvas.id === action.canvasId)
                ? { ...state, activeCanvasId: action.canvasId }
                : state;
        case 'delete': {
            const canvases = state.canvases.filter((canvas) => canvas.id !== action.canvasId);
            return {
                canvases,
                activeCanvasId: state.activeCanvasId === action.canvasId ? canvases[0]?.id : state.activeCanvasId,
            };
        }
    }
}

export function pushUndoSnapshot(history: UndoHistoryState, nextSerializedState: string, maxEntries: number = MAX_HISTORY): UndoHistoryState {
    if (history.present === nextSerializedState) {
        return history;
    }

    const past = [...history.past, history.present];
    return {
        past: past.slice(Math.max(0, past.length - maxEntries)),
        present: nextSerializedState,
        future: [],
    };
}

export function stepUndoRedoHistory(history: UndoHistoryState, direction: 'undo' | 'redo'): UndoHistoryState {
    if (direction === 'undo') {
        const previous = history.past.at(-1);
        if (!previous) {
            return history;
        }

        return {
            past: history.past.slice(0, -1),
            present: previous,
            future: [history.present, ...history.future],
        };
    }

    const next = history.future[0];
    if (!next) {
        return history;
    }

    return {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
    };
}

function createHistory(serialized: string): UndoHistoryState {
    return { past: [], present: serialized, future: [] };
}

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function makeId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function getCanvasTabId(canvasId: string): string {
    return `whiteboard-canvas-tab-${canvasId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function normalizeRect(start: WhiteboardPoint, end: WhiteboardPoint): { x: number; y: number; width: number; height: number } {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function hexToRgba(color: string, alpha: number): string {
    const normalized = color.trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
        return color;
    }

    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildPathData(points: WhiteboardPoint[]): string {
    if (points.length === 0) {
        return '';
    }

    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function buildArrowPath(start: WhiteboardPoint, end: WhiteboardPoint, strokeWidth: number): string {
    const headLength = Math.max(12, strokeWidth * 5);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const left = {
        x: end.x - headLength * Math.cos(angle - Math.PI / 6),
        y: end.y - headLength * Math.sin(angle - Math.PI / 6),
    };
    const right = {
        x: end.x - headLength * Math.cos(angle + Math.PI / 6),
        y: end.y - headLength * Math.sin(angle + Math.PI / 6),
    };

    return [
        `M ${start.x} ${start.y}`,
        `L ${end.x} ${end.y}`,
        `M ${left.x} ${left.y}`,
        `L ${end.x} ${end.y}`,
        `L ${right.x} ${right.y}`,
    ].join(' ');
}


export function normalizeCircleDraftGeometry(origin: WhiteboardPoint, point: WhiteboardPoint): {
    centerX: number;
    centerY: number;
    radius: number;
} {
    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;
    const diameter = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const left = origin.x + (deltaX < 0 ? -diameter : 0);
    const top = origin.y + (deltaY < 0 ? -diameter : 0);

    return {
        centerX: left + diameter / 2,
        centerY: top + diameter / 2,
        radius: diameter / 2,
    };
}

function getArrowPathValue(object: any): unknown {
    if (typeof object?.get === 'function') {
        const path = object.get('path');
        if (path !== undefined) {
            return path;
        }
    }

    return object?.path;
}

type ArrowPathCommand = [string, ...number[]];

function normalizeArrowPathCommands(path: unknown): ArrowPathCommand[] {
    if (typeof path === 'string') {
        return buildArrowPathCommandsFromString(path);
    }

    if (!Array.isArray(path)) {
        return [];
    }

    return path
        .filter((segment): segment is unknown[] => Array.isArray(segment) && typeof segment[0] === 'string')
        .map((segment) => [String(segment[0]), ...segment.slice(1).map((value) => Number(value))]);
}

function buildArrowPathCommandsFromString(path: string): ArrowPathCommand[] {
    const tokens = path.trim().split(/\s+/);
    const commands: ArrowPathCommand[] = [];
    for (let index = 0; index < tokens.length; index += 3) {
        const command = tokens[index];
        const x = Number(tokens[index + 1]);
        const y = Number(tokens[index + 2]);
        if ((command === 'M' || command === 'L') && Number.isFinite(x) && Number.isFinite(y)) {
            commands.push([command, x, y]);
        }
    }
    return commands;
}

function getArrowEndpointsFromObject(object: any): { start: WhiteboardPoint; end: WhiteboardPoint; pathType: 'string' | 'parsed' } | undefined {
    const path = getArrowPathValue(object);
    const commands = normalizeArrowPathCommands(path);
    if (commands.length < 2) {
        return undefined;
    }

    const [startCommand, endCommand] = commands;
    const [, startX, startY] = startCommand;
    const [, endX, endY] = endCommand;
    if (!Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(endX) || !Number.isFinite(endY)) {
        return undefined;
    }

    return {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        pathType: typeof path === 'string' ? 'string' : 'parsed',
    };
}

export function getShapeDraftStrokeWidthUpdate(
    draft: { tool: ShapeTool; origin: WhiteboardPoint; object: any },
    strokeWidth: number,
): Record<string, unknown> {
    const update: Record<string, unknown> = { strokeWidth };
    if (draft.tool !== 'arrow') {
        return update;
    }

    const endpoints = getArrowEndpointsFromObject(draft.object);
    const pointer = draft.object.getPointByOrigin?.('right', 'bottom');
    const currentPoint = endpoints?.end
        ?? (pointer && typeof pointer.x === 'number' && typeof pointer.y === 'number'
            ? { x: pointer.x, y: pointer.y }
            : draft.origin);

    return {
        ...update,
        path: buildArrowPath(draft.origin, currentPoint, strokeWidth),
    };
}

function looksLikeLegacyDocumentState(value: Partial<SerializedCanvasState | WhiteboardDocumentState>): value is WhiteboardDocumentState {
    if (!Array.isArray(value.objects)) {
        return false;
    }

    return value.objects.some((object) => isLegacyDocumentObject(object));
}

function isLegacyDocumentObject(value: unknown): value is WhiteboardDocumentObject {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const object = value as Record<string, unknown>;
    const objectType = object.type;
    if (objectType === 'rectangle') {
        return typeof object.x === 'number' && typeof object.y === 'number';
    }
    if (objectType === 'circle') {
        return typeof object.x === 'number' && typeof object.y === 'number' && typeof object.radius === 'number';
    }
    if (objectType === 'ellipse') {
        return typeof object.x === 'number' && typeof object.y === 'number'
            && typeof object.radiusX === 'number' && typeof object.radiusY === 'number';
    }
    if (objectType === 'line' || objectType === 'arrow') {
        return typeof object.start === 'object' && typeof object.end === 'object';
    }
    if (objectType === 'text') {
        return typeof object.x === 'number' && typeof object.y === 'number' && typeof object.text === 'string';
    }
    if (objectType === 'path') {
        return Array.isArray(object.points);
    }

    return false;
}

function convertLegacyDocumentToSerializedCanvasState(documentState: WhiteboardDocumentState): SerializedCanvasState {
    return {
        version: fabric.version,
        width: documentState.width,
        height: documentState.height,
        backgroundColor: documentState.backgroundColor,
        objects: documentState.objects.map((object) => convertLegacyObjectToSerializedObject(object)),
    };
}

function convertLegacyObjectToSerializedObject(object: WhiteboardDocumentObject): SerializedCanvasObject {
    const base = {
        whiteboardId: object.id,
        whiteboardObjectType: object.type,
        stroke: object.stroke,
        strokeWidth: object.strokeWidth,
        opacity: object.opacity,
        fill: object.fill === 'transparent' ? 'rgba(0,0,0,0)' : object.fill,
    };

    switch (object.type) {
        case 'path':
            return {
                type: 'path',
                ...base,
                fill: '',
                path: buildPathData(object.points),
            };
        case 'rectangle':
            return {
                type: 'rect',
                ...base,
                left: object.x,
                top: object.y,
                width: object.width,
                height: object.height,
            };
        case 'circle':
            return createCirclePathFabricObject({
                centerX: object.x,
                centerY: object.y,
                radius: object.radius,
                stroke: base.stroke,
                fill: String(base.fill),
                strokeWidth: base.strokeWidth,
                opacity: base.opacity,
                whiteboardId: String(base.whiteboardId),
                whiteboardObjectType: String(base.whiteboardObjectType),
            }) as SerializedCanvasObject;
        case 'ellipse':
            return {
                type: 'ellipse',
                ...base,
                left: object.x,
                top: object.y,
                originX: 'center',
                originY: 'center',
                rx: object.radiusX,
                ry: object.radiusY,
                width: object.radiusX * 2,
                height: object.radiusY * 2,
            };
        case 'line':
            return {
                type: 'line',
                ...base,
                fill: '',
                x1: object.start.x,
                y1: object.start.y,
                x2: object.end.x,
                y2: object.end.y,
            };
        case 'arrow':
            return {
                type: 'path',
                ...base,
                fill: '',
                path: buildArrowPath(object.start, object.end, object.strokeWidth),
            };
        case 'text':
            return {
                type: 'i-text',
                ...base,
                left: object.x,
                top: object.y,
                text: object.text,
                fontSize: object.fontSize,
                fontFamily: object.fontFamily,
                fill: object.stroke,
            };
        case 'image':
            return {
                type: 'image',
                ...base,
                left: object.x,
                top: object.y,
                width: object.width,
                height: object.height,
                src: object.src,
                whiteboardSourceUri: object.sourceUri,
                whiteboardMimeType: object.mimeType,
            };
    }
}

function convertSerializedObjectToLegacyObject(object: SerializedCanvasObject): WhiteboardDocumentObject | undefined {
    const objectType = getSerializedObjectType(object);
    const id = getSerializedObjectId(object);
    const stroke = typeof object.stroke === 'string' ? object.stroke : '#000000';
    const fill = typeof object.fill === 'string' && object.fill !== '' ? object.fill : 'transparent';
    const strokeWidth = typeof object.strokeWidth === 'number' ? object.strokeWidth : 1;
    const opacity = typeof object.opacity === 'number' ? object.opacity : 1;

    switch (objectType) {
        case 'rectangle':
            return {
                id,
                type: 'rectangle',
                stroke,
                fill,
                strokeWidth,
                opacity,
                x: typeof object.left === 'number' ? object.left : 0,
                y: typeof object.top === 'number' ? object.top : 0,
                width: typeof object.width === 'number' ? object.width : 0,
                height: typeof object.height === 'number' ? object.height : 0,
            };
        case 'circle': {
            const radius = typeof object.radius === 'number'
                ? object.radius
                : Math.max(
                    typeof object.rx === 'number' ? object.rx : 0,
                    typeof object.ry === 'number' ? object.ry : 0,
                );
            const left = typeof object.left === 'number' ? object.left : 0;
            const top = typeof object.top === 'number' ? object.top : 0;
            return {
                id,
                type: 'circle',
                stroke,
                fill,
                strokeWidth,
                opacity,
                x: object.originX === 'center' ? left : left + radius,
                y: object.originY === 'center' ? top : top + radius,
                radius,
            };
        }
        case 'ellipse':
            return {
                id,
                type: 'ellipse',
                stroke,
                fill,
                strokeWidth,
                opacity,
                x: typeof object.left === 'number' ? object.left : 0,
                y: typeof object.top === 'number' ? object.top : 0,
                radiusX: typeof object.rx === 'number' ? object.rx : 0,
                radiusY: typeof object.ry === 'number' ? object.ry : 0,
            };
        case 'line':
            return {
                id,
                type: 'line',
                stroke,
                fill: 'transparent',
                strokeWidth,
                opacity,
                start: {
                    x: typeof object.x1 === 'number' ? object.x1 : 0,
                    y: typeof object.y1 === 'number' ? object.y1 : 0,
                },
                end: {
                    x: typeof object.x2 === 'number' ? object.x2 : 0,
                    y: typeof object.y2 === 'number' ? object.y2 : 0,
                },
            };
        case 'arrow':
        case 'path':
            return {
                id,
                type: objectType === 'arrow' ? 'arrow' : 'path',
                stroke,
                fill: 'transparent',
                strokeWidth,
                opacity,
                ...(objectType === 'arrow'
                    ? {
                        start: { x: 0, y: 0 },
                        end: { x: 0, y: 0 },
                    }
                    : {
                        points: [],
                    }),
            } as WhiteboardDocumentObject;
        case 'text':
            return {
                id,
                type: 'text',
                stroke,
                fill,
                strokeWidth,
                opacity,
                x: typeof object.left === 'number' ? object.left : 0,
                y: typeof object.top === 'number' ? object.top : 0,
                text: typeof object.text === 'string' ? object.text : '',
                fontSize: typeof object.fontSize === 'number' ? object.fontSize : 16,
                fontFamily: typeof object.fontFamily === 'string' ? object.fontFamily : 'sans-serif',
            };
        case 'image':
            return {
                id,
                type: 'image',
                stroke,
                fill: 'transparent',
                strokeWidth,
                opacity,
                x: typeof object.left === 'number' ? object.left : 0,
                y: typeof object.top === 'number' ? object.top : 0,
                width: typeof object.width === 'number' ? object.width : 0,
                height: typeof object.height === 'number' ? object.height : 0,
                src: typeof object.src === 'string' ? object.src : '',
                mimeType: typeof object.whiteboardMimeType === 'string' ? object.whiteboardMimeType : undefined,
                sourceUri: typeof object.whiteboardSourceUri === 'string' ? object.whiteboardSourceUri : undefined,
            };
        default:
            return undefined;
    }
}

function visitSerializedObjects(objects: SerializedCanvasObject[], visit: (object: SerializedCanvasObject) => void): void {
    for (const object of objects) {
        visit(object);
        if (Array.isArray(object.objects)) {
            visitSerializedObjects(object.objects, visit);
        }
    }
}

function getSerializedObjectId(object: SerializedCanvasObject): string {
    return typeof object.whiteboardId === 'string' && object.whiteboardId.length > 0
        ? object.whiteboardId
        : makeId('object');
}

function getSerializedObjectType(object: SerializedCanvasObject): string {
    if (typeof object.whiteboardObjectType === 'string' && object.whiteboardObjectType.length > 0) {
        return object.whiteboardObjectType;
    }

    const normalizedType = typeof object.type === 'string' ? object.type.toLowerCase() : '';

    switch (normalizedType) {
        case 'rect':
            return 'rectangle';
        case 'circle':
            return 'circle';
        case 'ellipse':
            return 'ellipse';
        case 'line':
            return 'line';
        case 'i-text':
        case 'textbox':
        case 'text':
            return 'text';
        case 'image':
            return 'image';
        default:
            return normalizedType;
    }
}

function serializeFabricCanvas(canvas: any): string {
    const json = canvas.toJSON(SERIALIZED_OBJECT_CUSTOM_PROPERTIES) as Record<string, unknown>;
    const objects = Array.isArray(json.objects)
        ? canonicalizeSerializedCanvasObjects(json.objects as SerializedCanvasObject[])
        : [];
    return serializeCanvasState({
        ...json,
        version: typeof json.version === 'string' ? json.version : fabric.version,
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        backgroundColor: getCanvasBackgroundColor(canvas),
        objects,
    });
}

export function clearFabricCanvas(canvas: any, backgroundColor: string = DEFAULT_BACKGROUND): void {
    canvas.clear();
    canvas.backgroundColor = backgroundColor;
    canvas.requestRenderAll();
}

async function loadSerializedStateIntoCanvas(canvas: any, serialized?: string): Promise<SerializedCanvasState> {
    const normalized = normalizeSerializedCanvasStateOrThrow(serialized);
    clearFabricCanvas(canvas, normalized.backgroundColor);
    canvas.setDimensions({ width: normalized.width, height: normalized.height });
    await canvas.loadFromJSON({
        version: normalized.version,
        objects: normalized.objects,
    });
    canvas.backgroundColor = normalized.backgroundColor;
    canvas.requestRenderAll();
    return normalized;
}

function getCanvasBackgroundColor(canvas: any): string {
    return typeof canvas.backgroundColor === 'string' && canvas.backgroundColor.length > 0
        ? canvas.backgroundColor
        : DEFAULT_BACKGROUND;
}

export function getBrushSettings(tool: WhiteboardTool, strokeColor: string, strokeWidth: number): { color: string; width: number } {
    return {
        width: tool === 'highlighter' ? Math.max(8, strokeWidth * 4) : strokeWidth,
        color: tool === 'highlighter' ? hexToRgba(strokeColor, 0.35) : strokeColor,
    };
}

function createBrush(canvas: any, tool: WhiteboardTool, strokeColor: string, strokeWidth: number): any {
    const brush = new fabric.PencilBrush(canvas);
    const settings = getBrushSettings(tool, strokeColor, strokeWidth);
    brush.width = settings.width;
    brush.color = settings.color;
    return brush;
}

export function applyToolMode(canvas: any, tool: WhiteboardTool, strokeColor: string, strokeWidth: number): void {
    const selectionEnabled = tool === 'select';
    canvas.isDrawingMode = tool === 'pen' || tool === 'highlighter';
    canvas.selection = selectionEnabled;

    if (canvas.isDrawingMode) {
        canvas.freeDrawingBrush = createBrush(canvas, tool, strokeColor, strokeWidth);
    }

    for (const object of canvas.getObjects()) {
        const objectSelectable = shouldObjectBeSelectable(tool, object);
        object.set({
            selectable: objectSelectable,
            evented: objectSelectable,
        });
    }

    if (!selectionEnabled) {
        canvas.discardActiveObject();
    }

    canvas.requestRenderAll();
}

function getFabricObjectType(object: any): string {
    if (typeof object?.get === 'function') {
        const whiteboardObjectType = object.get('whiteboardObjectType');
        if (typeof whiteboardObjectType === 'string' && whiteboardObjectType.length > 0) {
            return whiteboardObjectType;
        }
    }

    if (typeof object?.whiteboardObjectType === 'string' && object.whiteboardObjectType.length > 0) {
        return object.whiteboardObjectType;
    }

    return typeof object?.type === 'string' ? object.type : '';
}

export function applyStyleControlsToObject(
    object: any,
    styles: {
        strokeColor: string;
        fillColor: string;
        strokeWidth: number;
    },
): boolean {
    const objectType = getFabricObjectType(object);
    const updates: Record<string, unknown> = {};

    if (objectType === 'rectangle' || objectType === 'circle' || objectType === 'ellipse' || objectType === 'rect') {
        updates.stroke = styles.strokeColor;
        updates.fill = styles.fillColor;
        updates.strokeWidth = styles.strokeWidth;
    } else if (objectType === 'line' || objectType === 'arrow' || objectType === 'path') {
        updates.stroke = styles.strokeColor;
        updates.strokeWidth = styles.strokeWidth;
        if (objectType === 'arrow') {
            const arrow = getArrowEndpointsFromObject(object);
            if (arrow) {
                const path = buildArrowPath(arrow.start, arrow.end, styles.strokeWidth);
                updates.path = arrow.pathType === 'parsed' ? fabric.util.parsePath(path) : path;
            }
        }
    } else if (objectType === 'text' || objectType === 'i-text' || objectType === 'textbox') {
        updates.fill = styles.strokeColor;
    }

    if (Object.keys(updates).length === 0) {
        return false;
    }

    object.set(updates);
    if (typeof object.setCoords === 'function') {
        object.setCoords();
    }
    return true;
}

function applyStyleControlsToSelection(
    canvas: any,
    styles: {
        strokeColor: string;
        fillColor: string;
        strokeWidth: number;
    },
): boolean {
    let changed = false;
    for (const object of canvas.getActiveObjects()) {
        changed = applyStyleControlsToObject(object, styles) || changed;
    }

    if (changed) {
        canvas.requestRenderAll();
    }

    return changed;
}

function objectContainsPoint(object: any, point: WhiteboardPoint): boolean {
    if (typeof object?.containsPoint === 'function') {
        try {
            return object.containsPoint(new fabric.Point(point.x, point.y));
        } catch {
            return object.containsPoint(point);
        }
    }

    if (typeof object?.getBoundingRect === 'function') {
        const rect = object.getBoundingRect();
        const width = typeof rect?.width === 'number' ? rect.width : 0;
        const height = typeof rect?.height === 'number' ? rect.height : 0;
        const left = typeof rect?.left === 'number' ? rect.left : 0;
        const top = typeof rect?.top === 'number' ? rect.top : 0;
        return point.x >= left && point.x <= left + width && point.y >= top && point.y <= top + height;
    }

    return false;
}

export function eraseObjectsAtPoint(canvas: any, point: WhiteboardPoint): boolean {
    const objects = canvas.getObjects();
    for (let index = objects.length - 1; index >= 0; index -= 1) {
        const object = objects[index];
        if (!objectContainsPoint(object, point)) {
            continue;
        }

        const annotationId = getAnnotationId(object);
        if (annotationId) {
            return removeAnnotation(canvas, annotationId);
        }

        canvas.remove(object);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return true;
    }

    return false;
}

function decorateFabricObject(
    object: any,
    metadata: {
        id?: string;
        objectType: string;
        sourceUri?: string;
        mimeType?: string;
    },
): any {
    object.set({
        whiteboardId: metadata.id ?? makeId('object'),
        whiteboardObjectType: metadata.objectType,
        ...(metadata.sourceUri ? { whiteboardSourceUri: metadata.sourceUri } : {}),
        ...(metadata.mimeType ? { whiteboardMimeType: metadata.mimeType } : {}),
    });
    return object;
}

function getAnnotationId(object: any): string | undefined {
    const annotationId = typeof object?.get === 'function' ? object.get('annotationId') : object?.annotationId;
    return typeof annotationId === 'string' && annotationId.length > 0 ? annotationId : undefined;
}

function getAnnotationRole(object: any): AnnotationRole | undefined {
    const annotationRole = typeof object?.get === 'function' ? object.get('annotationRole') : object?.annotationRole;
    return annotationRole === 'bubble' || annotationRole === 'text' || annotationRole === 'pointer' || annotationRole === 'handle'
        ? annotationRole
        : undefined;
}

function isAnnotationObject(object: any): boolean {
    return Boolean(getAnnotationId(object) && getAnnotationRole(object));
}

function shouldObjectBeSelectable(tool: WhiteboardTool, object: any): boolean {
    if (tool !== 'select') {
        return false;
    }

    const role = getAnnotationRole(object);
    if (!role) {
        return true;
    }

    return role === 'text' || role === 'handle';
}

function getAnnotationObjects(canvas: any, annotationId: string): {
    bubble?: any;
    text?: any;
    pointer?: any;
    handle?: any;
} {
    const objects = canvas.getObjects().filter((object: any) => getAnnotationId(object) === annotationId);
    return {
        bubble: objects.find((object: any) => getAnnotationRole(object) === 'bubble'),
        text: objects.find((object: any) => getAnnotationRole(object) === 'text'),
        pointer: objects.find((object: any) => getAnnotationRole(object) === 'pointer'),
        handle: objects.find((object: any) => getAnnotationRole(object) === 'handle'),
    };
}

function getAnnotationAnchor(bounds: { left: number; top: number; width: number; height: number }, target: WhiteboardPoint): WhiteboardPoint {
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = target.x - centerX;
    const deltaY = target.y - centerY;

    if (deltaX === 0 && deltaY === 0) {
        return { x: centerX, y: centerY + bounds.height / 2 };
    }

    const scale = 1 / Math.max(
        Math.abs(deltaX) / Math.max(bounds.width / 2, 1),
        Math.abs(deltaY) / Math.max(bounds.height / 2, 1),
    );

    return {
        x: centerX + deltaX * scale,
        y: centerY + deltaY * scale,
    };
}

function syncAnnotationLayout(canvas: any, annotationId: string): void {
    const { bubble, text, pointer, handle } = getAnnotationObjects(canvas, annotationId);
    if (!bubble || !text || !pointer || !handle) {
        return;
    }

    const textLeft = typeof text.left === 'number' ? text.left : 0;
    const textTop = typeof text.top === 'number' ? text.top : 0;
    const textWidth = typeof text.width === 'number' ? text.width : ANNOTATION_MIN_WIDTH - ANNOTATION_PADDING_X * 2;
    const textHeight = typeof text.height === 'number'
        ? text.height
        : (typeof text.getScaledHeight === 'function' ? text.getScaledHeight() : ANNOTATION_MIN_HEIGHT - ANNOTATION_PADDING_Y * 2);
    const bubbleLeft = textLeft - ANNOTATION_PADDING_X;
    const bubbleTop = textTop - ANNOTATION_PADDING_Y;
    const bubbleWidth = Math.max(ANNOTATION_MIN_WIDTH, textWidth + ANNOTATION_PADDING_X * 2);
    const bubbleHeight = Math.max(ANNOTATION_MIN_HEIGHT, textHeight + ANNOTATION_PADDING_Y * 2);
    const targetX = typeof handle.left === 'number' ? handle.left : bubbleLeft + bubbleWidth / 2;
    const targetY = typeof handle.top === 'number' ? handle.top : bubbleTop + bubbleHeight;
    const anchor = getAnnotationAnchor({ left: bubbleLeft, top: bubbleTop, width: bubbleWidth, height: bubbleHeight }, { x: targetX, y: targetY });

    bubble.set({
        left: bubbleLeft,
        top: bubbleTop,
        width: bubbleWidth,
        height: bubbleHeight,
    });
    pointer.set({ x1: anchor.x, y1: anchor.y, x2: targetX, y2: targetY });
    text.set({
        annotationBubbleLeft: bubbleLeft,
        annotationBubbleTop: bubbleTop,
        annotationBubbleWidth: bubbleWidth,
        annotationBubbleHeight: bubbleHeight,
        annotationTargetX: targetX,
        annotationTargetY: targetY,
    });

    bubble.setCoords();
    pointer.setCoords();
    handle.setCoords();
    text.setCoords();
}

function moveAnnotation(canvas: any, annotationId: string, deltaX: number, deltaY: number): void {
    if (deltaX === 0 && deltaY === 0) {
        return;
    }

    const { handle } = getAnnotationObjects(canvas, annotationId);
    if (!handle) {
        return;
    }

    handle.set({
        left: (typeof handle.left === 'number' ? handle.left : 0) + deltaX,
        top: (typeof handle.top === 'number' ? handle.top : 0) + deltaY,
    });
    syncAnnotationLayout(canvas, annotationId);
}

function removeAnnotation(canvas: any, annotationId: string): boolean {
    const annotationObjects = canvas.getObjects().filter((object: any) => getAnnotationId(object) === annotationId);
    if (annotationObjects.length === 0) {
        return false;
    }

    annotationObjects.forEach((object: any) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    return true;
}

function attachTextPersistence(object: any, persist: () => Promise<void>): void {
    if ((object?.type !== 'i-text' && object?.type !== 'textbox') || typeof object.on !== 'function') {
        return;
    }

    object.on('editing:exited', () => {
        void persist();
    });
}

function attachAnnotationTextSync(object: any, canvas: any): void {
    if (getAnnotationRole(object) !== 'text' || typeof object.on !== 'function') {
        return;
    }

    object.on('changed', () => {
        const annotationId = getAnnotationId(object);
        if (!annotationId) {
            return;
        }

        syncAnnotationLayout(canvas, annotationId);
        canvas.requestRenderAll();
    });
}

function exportCanvasAsPng(canvas: any): string {
    return canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        enableRetinaScaling: false,
    });
}

async function exportSerializedStateAsPng(serialized: string): Promise<string> {
    const canvasElement = document.createElement('canvas');
    const exportCanvas = new fabric.StaticCanvas(canvasElement, {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        backgroundColor: DEFAULT_BACKGROUND,
    });

    try {
        await loadSerializedStateIntoCanvas(exportCanvas, serialized);
        return exportCanvasAsPng(exportCanvas);
    } finally {
        exportCanvas.dispose();
    }
}

async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
    });
}

function bootstrap(): void {
    const vscode = acquireVsCodeApi();
    const logger = getLogger(vscode);
    const canvasElement = document.getElementById('whiteboard-canvas') as HTMLCanvasElement | null;
    if (!canvasElement) {
        return;
    }
    const canvasHost = canvasElement;

    const fabricCanvas = new fabric.Canvas(canvasHost, {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        backgroundColor: DEFAULT_BACKGROUND,
        preserveObjectStacking: true,
        selection: false,
    });

    const postMessage = (message: WhiteboardToExtensionMessage): void => {
        vscode.postMessage(message as any);
    };

    const canvasTabs = document.getElementById('canvas-tabs') as HTMLDivElement;
    const canvasPanel = document.getElementById('whiteboard-canvas-panel') as HTMLElement;
    const hydrationErrorBanner = document.getElementById('whiteboard-hydration-error') as HTMLDivElement;
    const contextText = document.getElementById('whiteboard-context') as HTMLParagraphElement;
    const status = document.getElementById('whiteboard-status') as HTMLDivElement;
    const fileInput = document.getElementById('image-file-input') as HTMLInputElement;
    const strokeColorInput = document.getElementById('stroke-color') as HTMLInputElement;
    const fillColorInput = document.getElementById('fill-color') as HTMLInputElement;
    const strokeWidthInput = document.getElementById('stroke-width') as HTMLInputElement;
    const undoButton = document.getElementById('undo-btn') as HTMLButtonElement;
    const redoButton = document.getElementById('redo-btn') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-btn') as HTMLButtonElement;
    const addCanvasButton = document.getElementById('add-canvas-btn') as HTMLButtonElement;
    const deleteCanvasButton = document.getElementById('delete-canvas-btn') as HTMLButtonElement;
    const importButton = document.getElementById('import-image-btn') as HTMLButtonElement;
    const approveButton = document.getElementById('approve-btn') as HTMLButtonElement;
    const requestChangesButton = document.getElementById('request-changes-btn') as HTMLButtonElement;
    const cancelButton = document.getElementById('cancel-btn') as HTMLButtonElement;
    const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]'));

    let currentTool: WhiteboardTool = 'pen';
    let session: WhiteboardSession | undefined;
    let activeCanvasId: string | undefined;
    let currentShapeDraft: ShapeDraft | undefined;
    let isErasing = false;
    let hasErasedObjects = false;
    let isHydrating = false;
    let hydrationErrorMessage: string | undefined;
    const histories = new Map<string, UndoHistoryState>();

    function syncCanvasResponsiveSizing(width: number, height: number): void {
        const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH;
        const safeHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_HEIGHT;
        const aspectRatio = `${safeWidth} / ${safeHeight}`;
        const canvasContainer = canvasHost.parentElement as HTMLElement | null;

        canvasHost.style.setProperty('--whiteboard-aspect-ratio', aspectRatio);
        canvasHost.style.width = '100%';
        canvasHost.style.height = '100%';
        canvasHost.style.maxWidth = '100%';

        if (!canvasContainer) {
            return;
        }

        canvasContainer.style.setProperty('--whiteboard-aspect-ratio', aspectRatio);
        canvasContainer.style.width = '100%';
        canvasContainer.style.maxWidth = `${safeWidth}px`;
        canvasContainer.style.height = 'auto';
        canvasContainer.style.aspectRatio = aspectRatio;

        canvasContainer.querySelectorAll('canvas').forEach((entry) => {
            const element = entry as HTMLCanvasElement;
            element.style.setProperty('--whiteboard-aspect-ratio', aspectRatio);
            element.style.width = '100%';
            element.style.height = '100%';
            element.style.maxWidth = '100%';
        });
    }

    syncCanvasResponsiveSizing(DEFAULT_WIDTH, DEFAULT_HEIGHT);

    function setStatus(message: string, state: 'info' | 'error' = 'info'): void {
        if (hydrationErrorMessage && state === 'info') {
            return;
        }

        status.textContent = message;
        status.dataset.state = state;
    }

    function setHydrationErrorState(message?: string): void {
        hydrationErrorMessage = message;
        applyWhiteboardHydrationErrorState({
            canvasPanel,
            status,
            errorBanner: hydrationErrorBanner,
            submitButton: approveButton,
            requestChangesButton,
            canvasElement: canvasHost,
        }, message);
    }

    function getCanvasById(canvasId?: string): WhiteboardCanvas | undefined {
        return session?.canvases.find((entry) => entry.id === canvasId);
    }

    function ensureSessionHasUsableCanvas(): WhiteboardSession | undefined {
        if (!session) {
            return undefined;
        }

        const normalizedSession = ensureWhiteboardSessionHasUsableCanvas({
            ...session,
            activeCanvasId,
        });
        const didChange = normalizedSession.canvases !== session.canvases
            || normalizedSession.activeCanvasId !== activeCanvasId;

        session = normalizedSession;
        activeCanvasId = normalizedSession.activeCanvasId;

        if (didChange) {
            vscode.setState({ session, activeCanvasId });
            renderTabs();
        }

        return session;
    }

    function updateHistoryButtons(): void {
        const history = activeCanvasId ? histories.get(activeCanvasId) : undefined;
        undoButton.disabled = !history || history.past.length === 0;
        redoButton.disabled = !history || history.future.length === 0;
    }

    function setTool(tool: WhiteboardTool): void {
        currentTool = tool;
        applyToolMode(
            fabricCanvas,
            tool,
            strokeColorInput.value,
            Number.parseInt(strokeWidthInput.value, 10) || 2,
        );
        toolButtons.forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
        setStatus(`Tool: ${tool}`);
    }

    function renderTabs(): void {
        if (!session) {
            canvasTabs.innerHTML = '';
            canvasPanel.removeAttribute('aria-labelledby');
            return;
        }

        canvasTabs.innerHTML = session.canvases
            .map((entry) => `<button id="${escapeHtml(getCanvasTabId(entry.id))}" class="canvas-tab ${entry.id === activeCanvasId ? 'active' : ''}" data-canvas-id="${entry.id}" role="tab" aria-selected="${entry.id === activeCanvasId ? 'true' : 'false'}" aria-controls="whiteboard-canvas-panel" tabindex="${entry.id === activeCanvasId ? '0' : '-1'}">${escapeHtml(entry.name)}</button>`)
            .join('');

        const activeTabId = activeCanvasId ? getCanvasTabId(activeCanvasId) : undefined;
        if (activeTabId) {
            canvasPanel.setAttribute('aria-labelledby', activeTabId);
        } else {
            canvasPanel.removeAttribute('aria-labelledby');
        }

        canvasTabs.querySelectorAll<HTMLButtonElement>('.canvas-tab').forEach((button) => {
            button.addEventListener('click', () => {
                const canvasId = button.dataset.canvasId;
                if (!canvasId) {
                    return;
                }

                void switchCanvas(canvasId);
            });
        });

        deleteCanvasButton.disabled = !session || session.canvases.length <= 1;
    }

    async function persistActiveCanvas(options: { pushHistory?: boolean } = {}): Promise<void> {
        const currentSession = ensureSessionHasUsableCanvas();
        const currentCanvas = getCanvasById(activeCanvasId);
        if (!currentSession || !activeCanvasId || !currentCanvas) {
            return;
        }

        if (hydrationErrorMessage) {
            setStatus(hydrationErrorMessage, 'error');
            return;
        }

        const serialized = serializeFabricCanvas(fabricCanvas);
        const currentHistory = histories.get(activeCanvasId) ?? createHistory(serialized);
        histories.set(
            activeCanvasId,
            options.pushHistory === false
                ? { ...currentHistory, present: serialized }
                : pushUndoSnapshot(currentHistory, serialized),
        );

        const preview = exportCanvasAsPng(fabricCanvas);
        const summary = summarizeSerializedCanvasState(serialized);
        const updatedCanvas: WhiteboardCanvas = {
            ...currentCanvas,
            fabricState: serialized,
            updatedAt: Date.now(),
            thumbnail: preview,
            shapes: summary.shapes,
            images: summary.images,
        };

        session = {
            ...currentSession,
            canvases: currentSession.canvases.map((entry) => entry.id === updatedCanvas.id ? updatedCanvas : entry),
            activeCanvasId,
        };
        vscode.setState({ session, activeCanvasId });
        postMessage({
            type: 'saveCanvas',
            canvasId: updatedCanvas.id,
            name: updatedCanvas.name,
            fabricState: serialized,
            thumbnail: preview,
            shapes: summary.shapes,
            images: summary.images,
        });
        renderTabs();
        updateHistoryButtons();
    }

    async function hydrateActiveCanvas(serialized?: string): Promise<boolean> {
        isHydrating = true;
        try {
            setHydrationErrorState(undefined);
            let normalized: SerializedCanvasState;
            try {
                normalized = await loadSerializedStateIntoCanvas(fabricCanvas, serialized);
                syncCanvasResponsiveSizing(normalized.width, normalized.height);
            } catch (error) {
                throw new Error(`during Fabric load: ${error instanceof Error ? error.message : String(error)}`);
            }

            try {
            for (const object of fabricCanvas.getObjects()) {
                if (!object.get('whiteboardId')) {
                    decorateFabricObject(object, {
                        objectType: getSerializedObjectType(object.toObject(SERIALIZED_OBJECT_CUSTOM_PROPERTIES) as SerializedCanvasObject),
                    });
                }
                attachTextPersistence(object, () => persistActiveCanvas());
                attachAnnotationTextSync(object, fabricCanvas);
            }
            } catch (error) {
                throw new Error(`while decorating hydrated objects: ${error instanceof Error ? error.message : String(error)}`);
            }

            try {
            const currentHistorySerialized = serializeCanvasState(normalized);
            if (activeCanvasId && !histories.has(activeCanvasId)) {
                histories.set(activeCanvasId, createHistory(currentHistorySerialized));
            }
            } catch (error) {
                throw new Error(`while initializing canvas history: ${error instanceof Error ? error.message : String(error)}`);
            }

            try {
            applyToolMode(
                fabricCanvas,
                currentTool,
                strokeColorInput.value,
                Number.parseInt(strokeWidthInput.value, 10) || 2,
            );
            } catch (error) {
                throw new Error(`while applying tool mode: ${error instanceof Error ? error.message : String(error)}`);
            }
            return true;
        } catch (error) {
            const serializedSummary = summarizeSerializedCanvasState(serialized);
            const normalized = normalizeSerializedCanvasState(serialized);
            const objectTypes = normalized.objects.map((object) => getSerializedObjectType(object));
            console.error('[Whiteboard] hydrate failure', {
                canvasName: getCanvasById(activeCanvasId)?.name ?? 'this canvas',
                error,
                objectCount: normalized.objects.length,
                objectTypes,
                shapeSummary: serializedSummary.shapes,
            });
            logger.error('Failed to hydrate whiteboard canvas', {
                message: error instanceof Error ? error.message : String(error),
                canvasName: getCanvasById(activeCanvasId)?.name ?? 'this canvas',
                objectCount: normalized.objects.length,
                objectTypes,
                shapeSummary: serializedSummary.shapes,
            });
            clearFabricCanvas(fabricCanvas, DEFAULT_BACKGROUND);
            setHydrationErrorState(createWhiteboardHydrationErrorMessage(
                getCanvasById(activeCanvasId)?.name ?? 'this canvas',
                error,
            ));
            return false;
        } finally {
            isHydrating = false;
        }
    }

    async function switchCanvas(canvasId: string): Promise<void> {
        if (!session || !session.canvases.some((canvas) => canvas.id === canvasId)) {
            return;
        }

        activeCanvasId = canvasId;
        session = { ...session, activeCanvasId: canvasId };
        vscode.setState({ session, activeCanvasId });
        postMessage({ type: 'switchCanvas', canvasId });
        renderTabs();
        const hydrated = await hydrateActiveCanvas(getCanvasById(canvasId)?.fabricState);
        updateHistoryButtons();
        if (hydrated) {
            setStatus(`Canvas: ${getCanvasById(canvasId)?.name ?? canvasId}`);
        }
    }

    function createShapeDraft(tool: ShapeTool, point: WhiteboardPoint): ShapeDraft {
        const strokeWidth = Number.parseInt(strokeWidthInput.value, 10) || 2;
        const common = {
            stroke: strokeColorInput.value,
            fill: fillColorInput.value,
            strokeWidth,
            opacity: 1,
            selectable: false,
            evented: false,
        };

        switch (tool) {
            case 'rectangle':
                return {
                    tool,
                    origin: point,
                    object: decorateFabricObject(new fabric.Rect({
                        ...common,
                        left: point.x,
                        top: point.y,
                        width: 0,
                        height: 0,
                    }), { objectType: 'rectangle' }),
                };
            case 'circle':
                return {
                    tool,
                    origin: point,
                    object: decorateFabricObject(new fabric.Ellipse({
                        ...common,
                        left: point.x,
                        top: point.y,
                        originX: 'center',
                        originY: 'center',
                        rx: 0,
                        ry: 0,
                    }), { objectType: 'circle' }),
                };
            case 'line':
                return {
                    tool,
                    origin: point,
                    object: decorateFabricObject(new fabric.Line([point.x, point.y, point.x, point.y], {
                        ...common,
                        fill: '',
                    }), { objectType: 'line' }),
                };
            case 'arrow':
                return {
                    tool,
                    origin: point,
                    object: decorateFabricObject(new fabric.Path(buildArrowPath(point, point, strokeWidth), {
                        ...common,
                        fill: '',
                    }), { objectType: 'arrow' }),
                };
        }
    }

    function updateShapeDraft(draft: ShapeDraft, point: WhiteboardPoint): void {
        switch (draft.tool) {
            case 'rectangle': {
                const rect = normalizeRect(draft.origin, point);
                draft.object.set({
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                });
                break;
            }
            case 'circle': {
                const circle = normalizeCircleDraftGeometry(draft.origin, point);
                draft.object.set({
                    left: circle.centerX,
                    top: circle.centerY,
                    rx: circle.radius,
                    ry: circle.radius,
                    width: circle.radius * 2,
                    height: circle.radius * 2,
                });
                break;
            }
            case 'line':
                draft.object.set({ x2: point.x, y2: point.y });
                break;
            case 'arrow': {
                const strokeWidth = Number.parseInt(strokeWidthInput.value, 10) || 2;
                draft.object.set({ path: fabric.util.parsePath(buildArrowPath(draft.origin, point, strokeWidth)) });
                break;
            }
        }

        draft.object.setCoords();
        fabricCanvas.requestRenderAll();
    }

    function createAnnotation(point: WhiteboardPoint): any {
        const annotationId = makeId('annotation');
        const bubbleLeft = Math.max(24, Math.min(fabricCanvas.getWidth() - ANNOTATION_MIN_WIDTH - 24, point.x + 28));
        const bubbleTop = Math.max(24, Math.min(fabricCanvas.getHeight() - ANNOTATION_MIN_HEIGHT - 24, point.y - 40));
        const bubbleFill = fillColorInput.value;
        const bubbleStroke = strokeColorInput.value;
        const strokeWidth = Math.max(2, Number.parseInt(strokeWidthInput.value, 10) || 2);

        const pointer = decorateFabricObject(new fabric.Line([point.x, point.y, point.x, point.y], {
            stroke: bubbleStroke,
            strokeWidth,
            selectable: false,
            evented: false,
        }), { objectType: 'annotationPointer' });
        pointer.set({ annotationId, annotationRole: 'pointer' as AnnotationRole });

        const bubble = decorateFabricObject(new fabric.Rect({
            left: bubbleLeft,
            top: bubbleTop,
            width: ANNOTATION_MIN_WIDTH,
            height: ANNOTATION_MIN_HEIGHT,
            rx: 18,
            ry: 18,
            fill: bubbleFill,
            stroke: bubbleStroke,
            strokeWidth,
            selectable: false,
            evented: false,
        }), { objectType: 'annotationBubble' });
        bubble.set({ annotationId, annotationRole: 'bubble' as AnnotationRole });

        const text = decorateFabricObject(new fabric.Textbox('Comment', {
            left: bubbleLeft + ANNOTATION_PADDING_X,
            top: bubbleTop + ANNOTATION_PADDING_Y,
            width: ANNOTATION_MIN_WIDTH - ANNOTATION_PADDING_X * 2,
            fontSize: 18,
            fontFamily: 'sans-serif',
            fill: bubbleStroke,
            editable: true,
            selectable: false,
            evented: false,
        }), { objectType: 'annotation' });
        text.set({ annotationId, annotationRole: 'text' as AnnotationRole });
        attachTextPersistence(text, () => persistActiveCanvas());
        attachAnnotationTextSync(text, fabricCanvas);

        const handle = decorateFabricObject(new fabric.Circle({
            left: point.x,
            top: point.y,
            radius: 7,
            originX: 'center',
            originY: 'center',
            fill: bubbleStroke,
            stroke: '#ffffff',
            strokeWidth: 2,
            selectable: false,
            evented: false,
        }), { objectType: 'annotationHandle' });
        handle.set({ annotationId, annotationRole: 'handle' as AnnotationRole });

        fabricCanvas.add(pointer);
        fabricCanvas.add(bubble);
        fabricCanvas.add(text);
        fabricCanvas.add(handle);
        syncAnnotationLayout(fabricCanvas, annotationId);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        fabricCanvas.requestRenderAll();
        return text;
    }

    async function importImageFile(file: File): Promise<void> {
        if (!file.type.startsWith('image/')) {
            setStatus('Only image files can be imported.', 'error');
            return;
        }

        const dataUrl = await readFileAsDataUrl(file);
        const image = await fabric.FabricImage.fromURL(dataUrl);
        decorateFabricObject(image, {
            objectType: 'image',
            sourceUri: file.name,
            mimeType: file.type,
        });
        image.set({
            left: Math.max(40, fabricCanvas.getWidth() / 2 - 160),
            top: Math.max(40, fabricCanvas.getHeight() / 2 - 120),
            scaleX: 1,
            scaleY: 1,
            selectable: currentTool === 'select',
            evented: currentTool === 'select',
        });
        image.scaleToWidth(Math.min(480, image.width ?? 320));
        fabricCanvas.add(image);
        fabricCanvas.setActiveObject(image);
        fabricCanvas.requestRenderAll();
        await persistActiveCanvas();
        setStatus(`Imported ${file.name}`);
    }

    async function submitWhiteboard(action: Exclude<WhiteboardReviewAction, 'cancelled'>): Promise<void> {
        const currentSession = ensureSessionHasUsableCanvas();
        if (!currentSession) {
            return;
        }

        if (hydrationErrorMessage) {
            setStatus(hydrationErrorMessage, 'error');
            return;
        }

        await persistActiveCanvas({ pushHistory: false });

        const latestSession = ensureSessionHasUsableCanvas() ?? currentSession;
        const submitted: Array<{
            id: string;
            name: string;
            imageUri: string;
            fabricState: string;
            thumbnail?: string;
            shapes?: WhiteboardShapeSummary[];
            images?: WhiteboardImageReference[];
        }> = [];
        for (const currentCanvas of latestSession.canvases) {
            const imageUri = currentCanvas.id === activeCanvasId
                ? exportCanvasAsPng(fabricCanvas)
                : currentCanvas.thumbnail ?? await exportSerializedStateAsPng(currentCanvas.fabricState);
            submitted.push({
                id: currentCanvas.id,
                name: currentCanvas.name,
                imageUri,
                fabricState: currentCanvas.fabricState,
                thumbnail: currentCanvas.thumbnail,
                shapes: currentCanvas.shapes,
                images: currentCanvas.images,
            });
        }

        postMessage({ type: 'submit', action, canvases: submitted });
    }

    toolButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tool = button.dataset.tool as WhiteboardTool | undefined;
            if (tool) {
                setTool(tool);
            }
        });
    });

    strokeColorInput.addEventListener('input', () => {
        const styles = {
            strokeColor: strokeColorInput.value,
            fillColor: fillColorInput.value,
            strokeWidth: Number.parseInt(strokeWidthInput.value, 10) || 2,
        };
        if (applyStyleControlsToSelection(fabricCanvas, styles)) {
            void persistActiveCanvas();
            return;
        }

        if (fabricCanvas.isDrawingMode) {
            fabricCanvas.freeDrawingBrush = createBrush(
                fabricCanvas,
                currentTool,
                styles.strokeColor,
                styles.strokeWidth,
            );
        }
    });

    strokeWidthInput.addEventListener('input', () => {
        const styles = {
            strokeColor: strokeColorInput.value,
            fillColor: fillColorInput.value,
            strokeWidth: Number.parseInt(strokeWidthInput.value, 10) || 2,
        };
        if (applyStyleControlsToSelection(fabricCanvas, styles)) {
            void persistActiveCanvas();
            return;
        }

        if (currentShapeDraft) {
            const update = getShapeDraftStrokeWidthUpdate(currentShapeDraft, styles.strokeWidth);
            currentShapeDraft.object.set(
                currentShapeDraft.tool === 'arrow' && typeof update.path === 'string'
                    ? { ...update, path: fabric.util.parsePath(update.path) }
                    : update,
            );
            fabricCanvas.requestRenderAll();
        }

        if (fabricCanvas.isDrawingMode) {
            fabricCanvas.freeDrawingBrush = createBrush(
                fabricCanvas,
                currentTool,
                styles.strokeColor,
                styles.strokeWidth,
            );
        }
    });

    fillColorInput.addEventListener('input', () => {
        if (applyStyleControlsToSelection(fabricCanvas, {
            strokeColor: strokeColorInput.value,
            fillColor: fillColorInput.value,
            strokeWidth: Number.parseInt(strokeWidthInput.value, 10) || 2,
        })) {
            void persistActiveCanvas();
        }
    });

    undoButton.addEventListener('click', () => {
        if (!activeCanvasId) {
            return;
        }

        const history = histories.get(activeCanvasId);
        if (!history) {
            return;
        }

        const nextHistory = stepUndoRedoHistory(history, 'undo');
        histories.set(activeCanvasId, nextHistory);
        void hydrateActiveCanvas(nextHistory.present).then((hydrated) => hydrated ? persistActiveCanvas({ pushHistory: false }) : undefined);
    });

    redoButton.addEventListener('click', () => {
        if (!activeCanvasId) {
            return;
        }

        const history = histories.get(activeCanvasId);
        if (!history) {
            return;
        }

        const nextHistory = stepUndoRedoHistory(history, 'redo');
        histories.set(activeCanvasId, nextHistory);
        void hydrateActiveCanvas(nextHistory.present).then((hydrated) => hydrated ? persistActiveCanvas({ pushHistory: false }) : undefined);
    });

    clearButton.addEventListener('click', () => {
        clearFabricCanvas(fabricCanvas, DEFAULT_BACKGROUND);
        applyToolMode(
            fabricCanvas,
            currentTool,
            strokeColorInput.value,
            Number.parseInt(strokeWidthInput.value, 10) || 2,
        );
        void persistActiveCanvas();
    });

    addCanvasButton.addEventListener('click', () => {
        if (!session) {
            return;
        }

        const name = window.prompt('Name for the new canvas', `Canvas ${session.canvases.length + 1}`)?.trim();
        if (!name) {
            return;
        }

        const now = Date.now();
        const blankState = serializeCanvasState(createBlankFabricCanvasState());
        const newCanvas: WhiteboardCanvas = {
            id: makeId('canvas'),
            name,
            fabricState: blankState,
            createdAt: now,
            updatedAt: now,
        };
        const nextState = applyCanvasCollectionAction(session, { type: 'create', canvas: newCanvas });
        session = {
            ...session,
            canvases: nextState.canvases,
            activeCanvasId: nextState.activeCanvasId,
        };
        activeCanvasId = nextState.activeCanvasId;
        histories.set(newCanvas.id, createHistory(blankState));
        vscode.setState({ session, activeCanvasId });
        postMessage({
            type: 'createCanvas',
            canvasId: newCanvas.id,
            name,
            fabricState: newCanvas.fabricState,
        });
        renderTabs();
        void hydrateActiveCanvas(newCanvas.fabricState);
        updateHistoryButtons();
    });

    deleteCanvasButton.addEventListener('click', () => {
        if (!session || !activeCanvasId || session.canvases.length <= 1) {
            return;
        }

        const canvasIdToDelete = activeCanvasId;
        const nextState = applyCanvasCollectionAction(session, { type: 'delete', canvasId: canvasIdToDelete });
        histories.delete(canvasIdToDelete);
        session = {
            ...session,
            canvases: nextState.canvases,
            activeCanvasId: nextState.activeCanvasId,
        };
        activeCanvasId = nextState.activeCanvasId;
        vscode.setState({ session, activeCanvasId });
        postMessage({ type: 'deleteCanvas', canvasId: canvasIdToDelete });
        renderTabs();
        void hydrateActiveCanvas(getCanvasById(activeCanvasId)?.fabricState);
        updateHistoryButtons();
    });

    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files ?? []);
        fileInput.value = '';
        void Promise.all(files.map((file) => importImageFile(file)));
    });

    approveButton.addEventListener('click', () => {
        void submitWhiteboard('approved');
    });
    requestChangesButton.addEventListener('click', () => {
        void submitWhiteboard('recreateWithChanges');
    });
    cancelButton.addEventListener('click', () => postMessage({ type: 'cancel' }));

    fabricCanvas.on('path:created', (event: any) => {
        if (isHydrating || !event.path) {
            return;
        }

        decorateFabricObject(event.path, { objectType: 'path' });
        event.path.set({ selectable: currentTool === 'select', evented: currentTool === 'select' });
        void persistActiveCanvas();
    });

    fabricCanvas.on('object:modified', () => {
        if (isHydrating) {
            return;
        }

        void persistActiveCanvas();
    });

    fabricCanvas.on('object:moving', (event: any) => {
        const target = event.target;
        const annotationId = getAnnotationId(target);
        const annotationRole = getAnnotationRole(target);
        if (!annotationId || !annotationRole) {
            return;
        }

        if (annotationRole === 'text') {
            const previousLeft = typeof target.__annotationPrevLeft === 'number' ? target.__annotationPrevLeft : target.left;
            const previousTop = typeof target.__annotationPrevTop === 'number' ? target.__annotationPrevTop : target.top;
            const deltaX = (typeof target.left === 'number' ? target.left : 0) - (typeof previousLeft === 'number' ? previousLeft : 0);
            const deltaY = (typeof target.top === 'number' ? target.top : 0) - (typeof previousTop === 'number' ? previousTop : 0);

            if (deltaX !== 0 || deltaY !== 0) {
                moveAnnotation(fabricCanvas, annotationId, deltaX, deltaY);
            } else {
                syncAnnotationLayout(fabricCanvas, annotationId);
            }

            target.__annotationPrevLeft = target.left;
            target.__annotationPrevTop = target.top;
            fabricCanvas.requestRenderAll();
            return;
        }

        if (annotationRole === 'handle') {
            syncAnnotationLayout(fabricCanvas, annotationId);
            target.__annotationPrevLeft = target.left;
            target.__annotationPrevTop = target.top;
            fabricCanvas.requestRenderAll();
        }
    });

    fabricCanvas.on('mouse:down', (event: any) => {
        if (isHydrating || !event.e) {
            return;
        }

        if (currentTool === 'select' && event.target) {
            event.target.__annotationPrevLeft = event.target.left;
            event.target.__annotationPrevTop = event.target.top;
        }

        const pointer = fabricCanvas.getPointer(event.e) as WhiteboardPoint;
        if (currentTool === 'eraser') {
            isErasing = true;
            hasErasedObjects = eraseObjectsAtPoint(fabricCanvas, pointer) || hasErasedObjects;
            return;
        }

        if (currentTool === 'text') {
            const text = new fabric.IText('Text', {
                left: pointer.x,
                top: pointer.y,
                fontSize: Math.max(16, (Number.parseInt(strokeWidthInput.value, 10) || 2) * 6),
                fontFamily: 'sans-serif',
                fill: strokeColorInput.value,
                editable: true,
                selectable: false,
                evented: false,
            });
            decorateFabricObject(text, { objectType: 'text' });
            attachTextPersistence(text, () => persistActiveCanvas());
            fabricCanvas.add(text);
            fabricCanvas.setActiveObject(text);
            text.enterEditing();
            void persistActiveCanvas();
            return;
        }

        if (currentTool === 'annotation') {
            createAnnotation(pointer);
            void persistActiveCanvas();
            return;
        }

        if (currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'line' || currentTool === 'arrow') {
            currentShapeDraft = createShapeDraft(currentTool, pointer);
            fabricCanvas.add(currentShapeDraft.object);
            fabricCanvas.setActiveObject(currentShapeDraft.object);
        }
    });

    fabricCanvas.on('mouse:move', (event: any) => {
        if (currentTool === 'eraser' && isErasing && event.e) {
            hasErasedObjects = eraseObjectsAtPoint(fabricCanvas, fabricCanvas.getPointer(event.e) as WhiteboardPoint) || hasErasedObjects;
            return;
        }

        if (!currentShapeDraft || !event.e) {
            return;
        }

        updateShapeDraft(currentShapeDraft, fabricCanvas.getPointer(event.e) as WhiteboardPoint);
    });

    fabricCanvas.on('mouse:up', () => {
        if (isErasing) {
            const didErase = hasErasedObjects;
            isErasing = false;
            hasErasedObjects = false;
            if (didErase) {
                void persistActiveCanvas();
            }
            return;
        }

        if (!currentShapeDraft) {
            return;
        }

        const finalized = currentShapeDraft.object;
        currentShapeDraft = undefined;
        finalized.set({ selectable: currentTool === 'select', evented: currentTool === 'select' });
        finalized.setCoords();
        void persistActiveCanvas();
    });

    document.addEventListener('dragover', (event) => event.preventDefault());
    document.addEventListener('drop', (event) => {
        event.preventDefault();
        void Promise.all(Array.from(event.dataTransfer?.files ?? []).map((file) => importImageFile(file)));
    });
    document.addEventListener('paste', (event) => {
        const files = Array.from(event.clipboardData?.items ?? [])
            .filter((item) => item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter((item): item is File => Boolean(item));
        void Promise.all(files.map((file) => importImageFile(file)));
    });
    document.addEventListener('keydown', (event) => {
        const ctrlOrMeta = event.ctrlKey || event.metaKey;
        if (ctrlOrMeta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
            event.preventDefault();
            undoButton.click();
            return;
        }

        if ((ctrlOrMeta && event.key.toLowerCase() === 'y') || (ctrlOrMeta && event.shiftKey && event.key.toLowerCase() === 'z')) {
            event.preventDefault();
            redoButton.click();
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace') && currentTool === 'select') {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const activeObjects = fabricCanvas.getActiveObjects();
            if (activeObjects.length === 0) {
                return;
            }

            event.preventDefault();
            const removedAnnotationIds = new Set<string>();
            activeObjects.forEach((object: any) => {
                const annotationId = getAnnotationId(object);
                if (annotationId) {
                    if (!removedAnnotationIds.has(annotationId)) {
                        removedAnnotationIds.add(annotationId);
                        removeAnnotation(fabricCanvas, annotationId);
                    }
                    return;
                }

                fabricCanvas.remove(object);
            });
            fabricCanvas.discardActiveObject();
            fabricCanvas.requestRenderAll();
            void persistActiveCanvas();
        }
    });

    window.addEventListener('message', (event: MessageEvent<ExtensionToWhiteboardMessage>) => {
        const message = event.data;
        if (message.type === 'initialize') {
            session = ensureWhiteboardSessionHasUsableCanvas({
                ...message.session,
                canvases: message.session.canvases.map((canvas) => ({ ...canvas })),
            });
            activeCanvasId = session.activeCanvasId;
            contextText.textContent = session.context || 'No additional context provided.';
            for (const currentCanvas of session.canvases) {
                const normalized = normalizeSerializedCanvasState(currentCanvas.fabricState);
                histories.set(currentCanvas.id, createHistory(serializeCanvasState(normalized)));
            }
            vscode.setState({ session, activeCanvasId });
            renderTabs();
            void hydrateActiveCanvas(getCanvasById(activeCanvasId)?.fabricState).then((hydrated) => {
                updateHistoryButtons();
                if (hydrated) {
                    setStatus('Whiteboard ready.');
                }
            });
            return;
        }

        if (message.type === 'error') {
            setStatus(message.message, 'error');
            return;
        }

        if (message.type === 'cancel') {
            postMessage({ type: 'cancel' });
        }
    });

    try {
        const persistedState = vscode.getState() as { session?: WhiteboardSession; activeCanvasId?: string } | undefined;
        if (persistedState?.session) {
            session = ensureWhiteboardSessionHasUsableCanvas({
                ...persistedState.session,
                activeCanvasId: persistedState.activeCanvasId ?? persistedState.session.activeCanvasId,
            });
            activeCanvasId = session.activeCanvasId;
            contextText.textContent = session.context || 'No additional context provided.';
            vscode.setState({ session, activeCanvasId });
            renderTabs();
        }
    } catch (error) {
        logger.warn('Failed to restore whiteboard webview state', error);
    }

    setTool('pen');
    setStatus('Loading whiteboard…');
    postMessage({ type: 'ready' });
}

ensureWhiteboardFabricRegistry();

if (isBrowser()) {
    bootstrap();
}

declare function acquireVsCodeApi(): VSCodeAPI;
