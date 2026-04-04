export type FabricPathCommand = [string, ...number[]];

const KAPPA = 0.5522847498307936;

export function buildCirclePathCommands(centerX: number, centerY: number, radius: number): FabricPathCommand[] {
    const control = radius * KAPPA;

    return [
        ['M', centerX + radius, centerY],
        ['C', centerX + radius, centerY + control, centerX + control, centerY + radius, centerX, centerY + radius],
        ['C', centerX - control, centerY + radius, centerX - radius, centerY + control, centerX - radius, centerY],
        ['C', centerX - radius, centerY - control, centerX - control, centerY - radius, centerX, centerY - radius],
        ['C', centerX + control, centerY - radius, centerX + radius, centerY - control, centerX + radius, centerY],
        ['Z'],
    ];
}

export function createCirclePathFabricObject(properties: {
    centerX: number;
    centerY: number;
    radius: number;
    stroke: string;
    fill: string;
    strokeWidth: number;
    opacity: number;
    whiteboardId: string;
    whiteboardObjectType: string;
    whiteboardZIndex?: number;
    angle?: number;
}): Record<string, unknown> {
    const { centerX, centerY, radius } = properties;

    return {
        type: 'path',
        whiteboardId: properties.whiteboardId,
        whiteboardObjectType: properties.whiteboardObjectType,
        ...(typeof properties.whiteboardZIndex === 'number' ? { whiteboardZIndex: properties.whiteboardZIndex } : {}),
        ...(typeof properties.angle === 'number' ? { angle: properties.angle } : {}),
        stroke: properties.stroke,
        fill: properties.fill,
        strokeWidth: properties.strokeWidth,
        opacity: properties.opacity,
        radius,
        left: centerX - radius,
        top: centerY - radius,
        width: radius * 2,
        height: radius * 2,
        path: buildCirclePathCommands(centerX, centerY, radius),
    };
}