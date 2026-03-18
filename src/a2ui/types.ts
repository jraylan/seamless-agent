// A2UI Protocol Types – Phase 2 A2UI surface system

import type { A2UIReport } from './engine';

/**
 * Mermaid diagram component for charts and graphs
 *
 * Accepts multiple prop names for the diagram content: `definition`, `text`, `content`, `source`, `code`, or `diagram`.
 *
 * @example
 * // Pie chart (using 'definition' prop)
 * { type: 'MermaidDiagram', props: { definition: 'pie title Data\n"A": 70\n"B": 30' } }
 *
 * @example
 * // Flowchart (using 'text' prop)
 * { type: 'MermaidDiagram', props: { text: 'graph TD\nA[Start] --> B[End]' } }
 *
 * @example
 * // Gantt chart (using 'content' prop)
 * { type: 'MermaidDiagram', props: { content: 'gantt\n    title Project\n    dateFormat YYYY-MM-DD\n    section Phase 1\n    Task 1 :2024-01-01, 30d' } }
 */
export type MermaidDiagramComponent = {
    type: 'MermaidDiagram';
    props: {
        /** Mermaid diagram definition. Multiple prop names accepted: definition, text, content, source, code, diagram */
        definition?: string;
        text?: string;
        content?: string;
        source?: string;
        code?: string;
        diagram?: string;
        /** Optional label for the diagram */
        label?: string;
    };
};

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
    | 'Badge'
    | 'Table'
    | 'Tabs'
    | 'Toggle'
    | 'HTML'
    | 'BarChart'
    | 'LineChart'
    | 'PieChart';

export interface A2UIComponent {
    id: string;
    component: Record<string, unknown>;
    parentId?: string;
    /** Declarative predicate controlling visibility. Validated and emitted as data-visible-if. */
    visibleIf?: unknown;
    /** Declarative predicate controlling enabled state. Only valid on interactive components. */
    enabledIf?: unknown;
}

export type A2UIDataModel = Record<string, unknown>;

export interface A2UIRenderIssue {
    source: 'renderer' | 'webview';
    message: string;
    componentId?: string;
}

/**
 * Records CSS properties that were silently dropped by the style whitelist.
 * Returned in the render_ui result as `droppedStyles` to help agents
 * identify when to use the HTML component instead.
 */
export interface DroppedStyleEntry {
    componentId: string;
    properties: string[];
}

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
    /** When true the panel shows a "Generating…" loading indicator at the bottom. Dismiss with append_ui(finalize:true). */
    streaming?: boolean;
}

export interface RenderUIInput extends A2UISurface {
    waitForAction?: boolean;
}

export interface RenderUIToolResult {
    surfaceId: string;
    rendered: boolean;
    deleted?: boolean;
    renderErrors?: A2UIRenderIssue[];
    userAction?: {
        name: string;
        data: Record<string, unknown>;
    };
    /**
     * CSS properties that were silently dropped because they are not on the
     * style whitelist. If entries are present, consider using the HTML component
     * type for sections that need those properties.
     */
    droppedStyles?: DroppedStyleEntry[];
}
