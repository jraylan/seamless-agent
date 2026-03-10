// A2UI Protocol Types – Phase 2 A2UI surface system

import type { A2UIReport } from './engine';

export type A2UIComponentType =
    | 'Row'
    | 'Column'
    | 'Card'
    | 'Divider'
    | 'Text'
    | 'Heading'
    | 'Image'
    | 'Markdown'
    | 'CodeBlock'
    | 'Button'
    | 'TextField'
    | 'Checkbox'
    | 'Select'
    | 'MermaidDiagram'
    | 'ProgressBar'
    | 'Badge';

export interface A2UIComponent {
    id: string;
    component: Record<string, unknown>;
    parentId?: string;
}

export type A2UIDataModel = Record<string, unknown>;

export interface A2UIUserAction {
    name: string;
    data: Record<string, unknown>;
}

export interface A2UISurface {
    surfaceId?: string;
    title?: string;
    components: A2UIComponent[];
    dataModel?: A2UIDataModel;
    a2uiReport?: A2UIReport;
}

export interface RenderUIInput extends A2UISurface {
    waitForAction?: boolean;
}

export interface RenderUIToolResult {
    surfaceId: string;
    rendered: boolean;
    userAction?: {
        name: string;
        data: Record<string, unknown>;
    };
}
