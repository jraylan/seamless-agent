import { createBlankFabricCanvasState } from './canvasState';
import { createCirclePathFabricObject } from './circlePath';
import { assertWhiteboardFabricObjectsSupported } from './fabricRegistry';

export interface WhiteboardSeedPoint {
    x: number;
    y: number;
}

interface WhiteboardSeedElementBase {
    id?: string;
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    opacity?: number;
}

export interface WhiteboardSeedRectangle extends WhiteboardSeedElementBase {
    type: 'rectangle';
    x: number;
    y: number;
    width: number;
    height: number;
    rx?: number;
    ry?: number;
}

export interface WhiteboardSeedCircle extends WhiteboardSeedElementBase {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
}

export interface WhiteboardSeedTriangle extends WhiteboardSeedElementBase {
    type: 'triangle';
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WhiteboardSeedLine extends WhiteboardSeedElementBase {
    type: 'line';
    start: WhiteboardSeedPoint;
    end: WhiteboardSeedPoint;
}

export interface WhiteboardSeedText extends Omit<WhiteboardSeedElementBase, 'fillColor'> {
    type: 'text';
    x: number;
    y: number;
    text: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: 'normal' | 'italic' | 'oblique';
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    fontFamily?: string;
}

export type WhiteboardSeedElement =
    | WhiteboardSeedRectangle
    | WhiteboardSeedCircle
    | WhiteboardSeedTriangle
    | WhiteboardSeedLine
    | WhiteboardSeedText;

const TRANSPARENT_FILL = 'rgba(0,0,0,0)';
const DEFAULT_STROKE_COLOR = '#111827';
const DEFAULT_FILL_COLOR = TRANSPARENT_FILL;
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_TEXT_FONT_SIZE = 24;
const DEFAULT_TEXT_FONT_FAMILY = 'sans-serif';

function getSeedObjectId(element: WhiteboardSeedElement, index: number): string {
    return element.id ?? `seed_${index + 1}`;
}

function getCommonSeedProperties(element: WhiteboardSeedElement, index: number) {
    const seedElementWithOrder = element as WhiteboardSeedElement & { zIndex?: number; rotation?: number };

    return {
        whiteboardId: getSeedObjectId(element, index),
        whiteboardObjectType: element.type,
        ...(typeof seedElementWithOrder.zIndex === 'number' ? { whiteboardZIndex: seedElementWithOrder.zIndex } : {}),
        stroke: element.strokeColor ?? DEFAULT_STROKE_COLOR,
        strokeWidth: element.strokeWidth ?? DEFAULT_STROKE_WIDTH,
        ...(typeof seedElementWithOrder.rotation === 'number' ? { angle: seedElementWithOrder.rotation } : {}),
        opacity: element.opacity ?? 1,
    };
}

function convertSeedElementToFabricObject(element: WhiteboardSeedElement, index: number): Record<string, unknown> {
    const common = getCommonSeedProperties(element, index);

    switch (element.type) {
        case 'rectangle':
            return {
                type: 'rect',
                ...common,
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                ...(typeof element.rx === 'number' ? { rx: element.rx } : {}),
                ...(typeof element.ry === 'number' ? { ry: element.ry } : {}),
                fill: element.fillColor ?? DEFAULT_FILL_COLOR,
            };
        case 'circle':
            return createCirclePathFabricObject({
                centerX: element.x,
                centerY: element.y,
                radius: element.radius,
                stroke: common.stroke,
                fill: element.fillColor ?? DEFAULT_FILL_COLOR,
                strokeWidth: common.strokeWidth,
                opacity: common.opacity,
                whiteboardId: String(common.whiteboardId),
                whiteboardObjectType: String(common.whiteboardObjectType),
                ...(typeof common.whiteboardZIndex === 'number' ? { whiteboardZIndex: common.whiteboardZIndex } : {}),
                ...(typeof common.angle === 'number' ? { angle: common.angle } : {}),
            });
        case 'triangle':
            return {
                type: 'triangle',
                ...common,
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
                fill: element.fillColor ?? DEFAULT_FILL_COLOR,
            };
        case 'line':
            return {
                type: 'line',
                ...common,
                x1: element.start.x,
                y1: element.start.y,
                x2: element.end.x,
                y2: element.end.y,
                fill: '',
            };
        case 'text': {
            const textColor = element.color ?? element.strokeColor ?? DEFAULT_STROKE_COLOR;
            return {
                type: 'i-text',
                ...common,
                left: element.x,
                top: element.y,
                ...(element.textAlign === 'center'
                    ? { originX: 'center' }
                    : element.textAlign === 'right'
                        ? { originX: 'right' }
                        : {}),
                text: element.text,
                fontSize: element.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
                ...(typeof element.fontWeight === 'number' ? { fontWeight: element.fontWeight } : {}),
                ...(element.fontStyle ? { fontStyle: element.fontStyle } : {}),
                ...(element.textAlign ? { textAlign: element.textAlign } : {}),
                fontFamily: element.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
                fill: textColor,
                stroke: textColor,
                strokeWidth: 1,
            };
        }
    }
}

export function serializeSeedElementsAsFabricState(
    seedElements: WhiteboardSeedElement[],
): string {
    const blankState = createBlankFabricCanvasState();
    const objects = seedElements.map((element, index) => convertSeedElementToFabricObject(element, index));
    assertWhiteboardFabricObjectsSupported(objects);
    return JSON.stringify({
        ...blankState,
        objects,
    });
}

export function normalizeAndValidateFabricState(serialized: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(serialized);
    } catch {
        throw new Error('Canvas fabricState must be valid JSON with an objects array');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Canvas fabricState must be valid JSON with an objects array');
    }

    const parsedState = parsed as Record<string, unknown>;
    if (!Array.isArray(parsedState.objects)) {
        throw new Error('Canvas fabricState must be valid JSON with an objects array');
    }

    return JSON.stringify({
        ...createBlankFabricCanvasState(),
        ...parsedState,
        objects: parsedState.objects,
    });
}

export function normalizeAndValidateLoadableFabricState(serialized: string): string {
    const normalized = normalizeAndValidateFabricState(serialized);
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    assertWhiteboardFabricObjectsSupported(parsed.objects as unknown[]);
    return normalized;
}
