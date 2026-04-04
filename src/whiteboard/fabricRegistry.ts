import {
    ActiveSelection,
    Circle,
    Ellipse,
    FabricImage,
    Group,
    IText,
    Line,
    Path,
    Polygon,
    Polyline,
    Rect,
    Textbox,
    Triangle,
    classRegistry,
} from 'fabric';

const WHITEBOARD_FABRIC_REGISTRATIONS = [
    [Rect, 'rect'],
    [Ellipse, 'ellipse'],
    [Triangle, 'triangle'],
    [Line, 'line'],
    [Path, 'path'],
    [IText, 'i-text'],
    [Textbox, 'textbox'],
    [Circle, 'circle'],
    [FabricImage, 'image'],
    [Group, 'group'],
    [ActiveSelection, 'activeSelection'],
    [Polygon, 'polygon'],
    [Polyline, 'polyline'],
] as const;

export const WHITEBOARD_SUPPORTED_FABRIC_TYPES = new Set<string>(
    WHITEBOARD_FABRIC_REGISTRATIONS.map(([, type]) => type),
);

export function normalizeWhiteboardFabricObjectType(type: string): string {
    const normalized = type.trim();
    const lower = normalized.toLowerCase();

    switch (lower) {
        case 'rect':
        case 'ellipse':
        case 'triangle':
        case 'line':
        case 'path':
        case 'textbox':
        case 'circle':
        case 'image':
        case 'group':
        case 'polygon':
        case 'polyline':
            return lower;
        case 'itext':
        case 'i-text':
            return 'i-text';
        case 'activeselection':
        case 'active-selection':
            return 'activeSelection';
        default:
            return normalized;
    }
}

let whiteboardFabricRegistryInitialized = false;

export function ensureWhiteboardFabricRegistry(): void {
    if (whiteboardFabricRegistryInitialized) {
        return;
    }

    for (const [constructor, type] of WHITEBOARD_FABRIC_REGISTRATIONS) {
        classRegistry.setClass(constructor, type);
    }

    whiteboardFabricRegistryInitialized = true;
}

export function assertWhiteboardFabricObjectTypeSupported(type: string): void {
    ensureWhiteboardFabricRegistry();

    const normalizedType = normalizeWhiteboardFabricObjectType(type);

    if (!WHITEBOARD_SUPPORTED_FABRIC_TYPES.has(normalizedType)) {
        throw new Error(`Canvas fabricState contains unsupported Fabric object type "${type}"`);
    }

    classRegistry.getClass(normalizedType);
}

export function assertWhiteboardFabricObjectsSupported(objects: unknown[]): void {
    for (const object of objects) {
        if (!object || typeof object !== 'object' || Array.isArray(object)) {
            throw new Error('Canvas fabricState objects must be valid Fabric.js object records');
        }

        const serializedObject = object as Record<string, unknown>;
        const type = typeof serializedObject.type === 'string' ? serializedObject.type : undefined;
        if (!type) {
            throw new Error('Canvas fabricState objects must include a Fabric object type');
        }

        assertWhiteboardFabricObjectTypeSupported(type);

        if (Array.isArray(serializedObject.objects)) {
            assertWhiteboardFabricObjectsSupported(serializedObject.objects);
        }
    }
}
