import {
    DEFAULT_WHITEBOARD_CANVAS_BACKGROUND,
    DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
    DEFAULT_WHITEBOARD_CANVAS_WIDTH,
    serializeBlankFabricCanvasState,
} from './canvasState';

export interface WhiteboardScenePoint {
    x: number;
    y: number;
}

export interface WhiteboardSceneBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WhiteboardSceneElementSummary {
    id: string;
    objectType: string;
    zIndex?: number;
    bounds?: WhiteboardSceneBounds;
    center?: WhiteboardScenePoint;
    target?: WhiteboardScenePoint;
    points?: WhiteboardScenePoint[];
    label?: string;
    rotation?: number;
    fontSize?: number;
    fontFamily?: string;
    strokeColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    opacity?: number;
}

export interface WhiteboardSceneCanvasSummary {
    id: string;
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
    elementCount: number;
    elements: WhiteboardSceneElementSummary[];
}

export interface WhiteboardSceneSummary {
    totalCanvases: number;
    totalElements: number;
    canvases: WhiteboardSceneCanvasSummary[];
}

export function createEmptyWhiteboardSceneSummary(): WhiteboardSceneSummary {
    return {
        totalCanvases: 0,
        totalElements: 0,
        canvases: [],
    };
}

export interface WhiteboardSceneSourceCanvas {
    id: string;
    name: string;
    fabricState?: string;
}

interface SerializedCanvasObject {
    type?: unknown;
    whiteboardId?: unknown;
    whiteboardObjectType?: unknown;
    whiteboardZIndex?: unknown;
    text?: unknown;
    stroke?: unknown;
    fill?: unknown;
    strokeWidth?: unknown;
    opacity?: unknown;
    angle?: unknown;
    fontSize?: unknown;
    fontFamily?: unknown;
    left?: unknown;
    top?: unknown;
    width?: unknown;
    height?: unknown;
    x1?: unknown;
    y1?: unknown;
    x2?: unknown;
    y2?: unknown;
    radius?: unknown;
    rx?: unknown;
    ry?: unknown;
    originX?: unknown;
    originY?: unknown;
    path?: unknown;
    annotationId?: unknown;
    annotationRole?: unknown;
    annotationBubbleLeft?: unknown;
    annotationBubbleTop?: unknown;
    annotationBubbleWidth?: unknown;
    annotationBubbleHeight?: unknown;
    annotationTargetX?: unknown;
    annotationTargetY?: unknown;
}

interface SerializedCanvasState {
    width: number;
    height: number;
    backgroundColor: string;
    objects: SerializedCanvasObject[];
}

function asFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeObjectType(value: unknown): string {
    if (typeof value !== 'string') {
        return 'unknown';
    }

    const lower = value.toLowerCase();
    if (lower === 'rect') {
        return 'rectangle';
    }
    if (lower === 'i-text' || lower === 'textbox' || lower === 'text') {
        return 'text';
    }
    return lower;
}

function getObjectType(object: SerializedCanvasObject): string {
    if (typeof object.whiteboardObjectType === 'string' && object.whiteboardObjectType.length > 0) {
        return object.whiteboardObjectType;
    }

    return normalizeObjectType(object.type);
}

function getObjectId(object: SerializedCanvasObject, index: number): string {
    if (typeof object.whiteboardId === 'string' && object.whiteboardId.length > 0) {
        return object.whiteboardId;
    }

    return `element_${index + 1}`;
}

function toPoint(x: number, y: number): WhiteboardScenePoint {
    return { x, y };
}

function toBounds(x: number, y: number, width: number, height: number): WhiteboardSceneBounds {
    return { x, y, width, height };
}

function toCenter(bounds: WhiteboardSceneBounds): WhiteboardScenePoint {
    return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
}

function parsePathPoints(path: unknown): WhiteboardScenePoint[] {
    if (typeof path === 'string') {
        const tokens = path.trim().split(/\s+/);
        const points: WhiteboardScenePoint[] = [];
        for (let index = 0; index < tokens.length; index += 3) {
            const command = tokens[index];
            const x = Number(tokens[index + 1]);
            const y = Number(tokens[index + 2]);
            if ((command === 'M' || command === 'L') && Number.isFinite(x) && Number.isFinite(y)) {
                points.push({ x, y });
            }
        }
        return points;
    }

    if (!Array.isArray(path)) {
        return [];
    }

    const points: WhiteboardScenePoint[] = [];
    for (const segment of path) {
        if (!Array.isArray(segment) || typeof segment[0] !== 'string') {
            continue;
        }
        const command = segment[0];
        const x = Number(segment[1]);
        const y = Number(segment[2]);
        if ((command === 'M' || command === 'L') && Number.isFinite(x) && Number.isFinite(y)) {
            points.push({ x, y });
        }
    }

    return points;
}

function boundsFromPoints(points: WhiteboardScenePoint[]): WhiteboardSceneBounds | undefined {
    if (points.length === 0) {
        return undefined;
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (const point of points.slice(1)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function buildElementSummary(object: SerializedCanvasObject, index: number): WhiteboardSceneElementSummary {
    const objectType = getObjectType(object);
    const left = asFiniteNumber(object.left);
    const top = asFiniteNumber(object.top);
    const width = asFiniteNumber(object.width);
    const height = asFiniteNumber(object.height);
    const rx = asFiniteNumber(object.rx);
    const ry = asFiniteNumber(object.ry);
    const radius = asFiniteNumber(object.radius);
    const x1 = asFiniteNumber(object.x1);
    const y1 = asFiniteNumber(object.y1);
    const x2 = asFiniteNumber(object.x2);
    const y2 = asFiniteNumber(object.y2);
    const points = parsePathPoints(object.path);

    const zIndex = asFiniteNumber(object.whiteboardZIndex) ?? index;
    const rotation = asFiniteNumber(object.angle);
    const fontSize = asFiniteNumber(object.fontSize);
    const fontFamily = typeof object.fontFamily === 'string' && object.fontFamily.length > 0
        ? object.fontFamily
        : undefined;
    const annotationBubbleLeft = asFiniteNumber(object.annotationBubbleLeft);
    const annotationBubbleTop = asFiniteNumber(object.annotationBubbleTop);
    const annotationBubbleWidth = asFiniteNumber(object.annotationBubbleWidth);
    const annotationBubbleHeight = asFiniteNumber(object.annotationBubbleHeight);
    const annotationTargetX = asFiniteNumber(object.annotationTargetX);
    const annotationTargetY = asFiniteNumber(object.annotationTargetY);

    let bounds: WhiteboardSceneBounds | undefined;
    let center: WhiteboardScenePoint | undefined;
    let target: WhiteboardScenePoint | undefined;

    if (objectType === 'annotation'
        && annotationBubbleLeft !== undefined
        && annotationBubbleTop !== undefined
        && annotationBubbleWidth !== undefined
        && annotationBubbleHeight !== undefined) {
        bounds = toBounds(annotationBubbleLeft, annotationBubbleTop, annotationBubbleWidth, annotationBubbleHeight);
        center = toCenter(bounds);
        if (annotationTargetX !== undefined && annotationTargetY !== undefined) {
            target = toPoint(annotationTargetX, annotationTargetY);
        }
    } else if (objectType === 'line' && x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
        bounds = toBounds(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        center = toPoint((x1 + x2) / 2, (y1 + y2) / 2);
    } else if ((objectType === 'circle' || objectType === 'ellipse') && left !== undefined && top !== undefined) {
        const resolvedRadiusX = rx ?? radius;
        const resolvedRadiusY = ry ?? radius ?? resolvedRadiusX;
        if (resolvedRadiusX !== undefined && resolvedRadiusY !== undefined) {
            const normalizedLeft = object.originX === 'center' ? left - resolvedRadiusX : left;
            const normalizedTop = object.originY === 'center' ? top - resolvedRadiusY : top;
            bounds = toBounds(normalizedLeft, normalizedTop, resolvedRadiusX * 2, resolvedRadiusY * 2);
            center = toCenter(bounds);
        } else if (points.length > 0) {
            bounds = boundsFromPoints(points);
            center = bounds ? toCenter(bounds) : undefined;
        } else if (width !== undefined && height !== undefined) {
            bounds = toBounds(left, top, width, height);
            center = toCenter(bounds);
        }
    } else if (left !== undefined && top !== undefined && width !== undefined && height !== undefined) {
        bounds = toBounds(left, top, width, height);
        center = toCenter(bounds);
    } else if (points.length > 0) {
        bounds = boundsFromPoints(points);
        center = bounds ? toCenter(bounds) : undefined;
    }

    const summary: WhiteboardSceneElementSummary = {
        id: getObjectId(object, index),
        objectType,
        zIndex,
        ...(bounds ? { bounds } : {}),
        ...(center ? { center } : {}),
        ...(target ? { target } : {}),
        ...(points.length > 0 && objectType !== 'circle' && objectType !== 'ellipse' ? { points } : {}),
        ...(typeof object.text === 'string' && object.text.length > 0 ? { label: object.text } : {}),
        ...(rotation !== undefined ? { rotation } : {}),
        ...(fontSize !== undefined ? { fontSize } : {}),
        ...(fontFamily ? { fontFamily } : {}),
        ...(typeof object.stroke === 'string' ? { strokeColor: object.stroke } : {}),
        ...(typeof object.fill === 'string' ? { fillColor: object.fill } : {}),
        ...(typeof object.strokeWidth === 'number' ? { strokeWidth: object.strokeWidth } : {}),
        ...(typeof object.opacity === 'number' ? { opacity: object.opacity } : { opacity: 1 }),
    };

    return summary;
}

function parseCanvasState(serialized?: string): SerializedCanvasState {
    const fallback = JSON.parse(serializeBlankFabricCanvasState()) as SerializedCanvasState;
    if (!serialized || serialized.trim().length === 0) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(serialized) as Partial<SerializedCanvasState>;
        return {
            width: asFiniteNumber(parsed.width) ?? DEFAULT_WHITEBOARD_CANVAS_WIDTH,
            height: asFiniteNumber(parsed.height) ?? DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
            backgroundColor: typeof parsed.backgroundColor === 'string'
                ? parsed.backgroundColor
                : DEFAULT_WHITEBOARD_CANVAS_BACKGROUND,
            objects: Array.isArray(parsed.objects) ? parsed.objects : [],
        };
    } catch {
        return fallback;
    }
}

export function summarizeWhiteboardScene(
    canvases: WhiteboardSceneSourceCanvas[],
): WhiteboardSceneSummary {
    if (canvases.length === 0) {
        return createEmptyWhiteboardSceneSummary();
    }

    const summarizedCanvases = canvases.map((canvas) => {
        const parsedState = parseCanvasState(canvas.fabricState);
        const elements = parsedState.objects
            .filter((object) => typeof object.annotationId !== 'string' || object.annotationRole === 'text')
            .map((object, index) => buildElementSummary(object, index));

        return {
            id: canvas.id,
            name: canvas.name,
            width: parsedState.width,
            height: parsedState.height,
            backgroundColor: parsedState.backgroundColor,
            elementCount: elements.length,
            elements,
        } satisfies WhiteboardSceneCanvasSummary;
    });

    return {
        totalCanvases: summarizedCanvases.length,
        totalElements: summarizedCanvases.reduce((total, canvas) => total + canvas.elementCount, 0),
        canvases: summarizedCanvases,
    };
}
