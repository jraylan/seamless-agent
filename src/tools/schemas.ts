import { z } from 'zod';
import {
    DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
    DEFAULT_WHITEBOARD_CANVAS_WIDTH,
} from '../whiteboard/canvasState';
import type { A2UIIssue, A2UILevel, A2UIReport } from '../a2ui/engine';
import { normalizeAndValidateLoadableFabricState } from '../whiteboard/seededCanvas';
import type { RequiredPlanRevisions, WhiteboardReviewAction } from '../webview/types';

// ================================
// Input Schemas with Zod Validation
// ================================

/**
 * Schema for a single option item (string or {label, description})
 */
const OptionLabelSchema = z.string()
    .max(120, "Option label must be 120 characters or less. Keep 'label' concise and move long explanatory text to 'description'.")
    .describe('Short option title shown in the button. Keep it concise (ideally single line and <=120 chars); put longer details in description.');

const OptionItemSchema = z.union([
    z.string(),
    z.object({
        label: OptionLabelSchema,
        description: z.string().optional().describe('Optional detailed context for the option. Put long explanatory text here.')
    })
]);

/**
 * Schema for an option group with title and options
 */
const OptionGroupSchema = z.object({
    title: z.string().describe('Group title displayed above the options, e.g. "Framework", "Language"'),
    options: z.array(OptionItemSchema).min(1).describe('The options in this group'),
    multiSelect: z.boolean().optional().describe('Allow multiple selections in this group. Defaults to false (single select).')
});

/**
 * Schema for ask_user tool input
 */
export const AskUserInputSchema = z.object({
    question: z.string()
        .min(1, 'Question cannot be empty')
        .describe('The question or prompt to display to the user for confirmation. Be specific and clear about what you need the user to confirm or decide.'),
    title: z.string()
        .optional()
        .describe('Optional custom title for the confirmation dialog. Defaults to "Confirmation Required".'),
    agentName: z.string()
        .optional()
        .describe('Your agent name for display purposes. Use "Main Orchestrator" for main agent, "Generic Sub-Agent" for unnamed sub-agents, or your actual name from .github/agents/*.md.'),
    options: z.union([
        z.array(OptionItemSchema),
        z.array(OptionGroupSchema)
    ]).optional()
        .describe('Optional predefined answer options. Can be a flat array of strings/objects for simple choices (e.g. ["Yes", "No"]), or an array of option groups for multi-category selection (e.g. [{"title": "Framework", "options": ["Express", "Koa"], "multiSelect": false}]). User clicks to select, then submits.'),
    multiSelect: z.boolean()
        .optional()
        .describe('Allow multiple selections from flat option arrays. Use true when the question implies multiple answers: "select all that apply", "choose multiple", "pick one or more", "which ones?". Use false (default) for single choice: "pick one", "choose one", "which one?". For grouped options, each group can override with its own multiSelect setting.')
});

/**
 * Schema for approve_plan tool input
 */
export const ApprovePlanInputSchema = z.object({
    plan: z.string()
        .min(1, 'Plan cannot be empty')
        .describe('The detailed plan in Markdown format to present to the user for review. Use headers, bullet points, and code blocks for clarity.'),
    title: z.string()
        .optional()
        .describe('Optional title for the review panel. Defaults to "Review Plan".')
});

/**
 * Schema for plan_review tool input
 */
export const PlanReviewInputSchema = z.object({
    plan: z.string()
        .min(1, 'Content cannot be empty')
        .describe('The Markdown content to present to the user for review. Supports full Markdown syntax including headers, lists, code blocks, and tables.'),
    title: z.string()
        .optional()
        .describe('Optional title for the review panel.'),
    mode: z.enum(['review', 'walkthrough'])
        .optional()
        .default('review')
        .describe('The review mode: "review" for implementation plan approval (default) - user can approve or request changes with comments, "walkthrough" for step-by-step guides - user can comment and agent should create new review with requested steps.'),
    chatId: z.string()
        .optional()
        .describe('Optional chat session ID for grouping reviews. Auto-generated if not provided.')
});

/**
 * Schema for walkthrough_review tool input
 * Separated from plan_review to make intent explicit.
 */
export const WalkthroughReviewInputSchema = z.object({
    plan: z.string()
        .min(1, 'Content cannot be empty')
        .describe('The Markdown content to present to the user as a walkthrough. Supports full Markdown syntax.'),
    title: z.string()
        .optional()
        .describe('Optional title for the walkthrough panel.'),
    chatId: z.string()
        .optional()
        .describe('Optional chat session ID for grouping reviews. Auto-generated if not provided.')
});


const WhiteboardImportImageSchema = z.object({
    uri: z.string()
        .min(1, 'Import image uri cannot be empty')
        .describe('File URI of an image to import onto the canvas.'),
    label: z.string()
        .min(1, 'Import image label cannot be empty')
        .optional()
        .describe('Optional label for the imported image.'),
});

const WHITEBOARD_X_RANGE_MESSAGE = `Seed coordinate x must be within the whiteboard width (0-${DEFAULT_WHITEBOARD_CANVAS_WIDTH})`;
const WHITEBOARD_Y_RANGE_MESSAGE = `Seed coordinate y must be within the whiteboard height (0-${DEFAULT_WHITEBOARD_CANVAS_HEIGHT})`;
const WHITEBOARD_STROKE_WIDTH_MESSAGE = 'Seed element strokeWidth must be between 1 and 64';
const WHITEBOARD_Z_INDEX_MESSAGE = 'Seed element zIndex must be between 0 and 10000';
const WHITEBOARD_ROTATION_MESSAGE = 'Seed element rotation must be between -360 and 360 degrees';

const WhiteboardSeedXSchema = z.number()
    .finite()
    .min(0, WHITEBOARD_X_RANGE_MESSAGE)
    .max(DEFAULT_WHITEBOARD_CANVAS_WIDTH, WHITEBOARD_X_RANGE_MESSAGE)
    .describe('Horizontal position in the default 1600px-wide whiteboard canvas.');

const WhiteboardSeedYSchema = z.number()
    .finite()
    .min(0, WHITEBOARD_Y_RANGE_MESSAGE)
    .max(DEFAULT_WHITEBOARD_CANVAS_HEIGHT, WHITEBOARD_Y_RANGE_MESSAGE)
    .describe('Vertical position in the default 900px-tall whiteboard canvas.');

const WhiteboardSeedPointSchema = z.object({
    x: WhiteboardSeedXSchema,
    y: WhiteboardSeedYSchema,
});

const WhiteboardSeedElementBaseSchema = z.object({
    id: z.string()
        .optional()
        .describe('Optional stable object id. Omit to let Seamless Agent generate one.'),
    strokeColor: z.string()
        .optional()
        .describe('Optional stroke/outline color such as "#2563eb".'),
    fillColor: z.string()
        .optional()
        .describe('Optional fill color such as "rgba(37,99,235,0.18)".'),
    strokeWidth: z.number()
        .min(1, WHITEBOARD_STROKE_WIDTH_MESSAGE)
        .max(64, WHITEBOARD_STROKE_WIDTH_MESSAGE)
        .optional()
        .describe('Optional stroke width. Defaults to 2.'),
    zIndex: z.number()
        .int(WHITEBOARD_Z_INDEX_MESSAGE)
        .min(0, WHITEBOARD_Z_INDEX_MESSAGE)
        .max(10000, WHITEBOARD_Z_INDEX_MESSAGE)
        .optional()
        .describe('Optional stacking order hint. Lower values render behind higher values.'),
    rotation: z.number()
        .min(-360, WHITEBOARD_ROTATION_MESSAGE)
        .max(360, WHITEBOARD_ROTATION_MESSAGE)
        .optional()
        .describe('Optional clockwise rotation in degrees.'),
    opacity: z.number()
        .min(0, 'Seed element opacity must be at least 0')
        .max(1, 'Seed element opacity must be at most 1')
        .optional()
        .describe('Optional opacity between 0 and 1. Defaults to 1.'),
});

const WhiteboardSeedRectangleSchema = WhiteboardSeedElementBaseSchema.extend({
    type: z.literal('rectangle'),
    x: WhiteboardSeedXSchema,
    y: WhiteboardSeedYSchema,
    width: z.number().positive('Rectangle width must be greater than zero'),
    height: z.number().positive('Rectangle height must be greater than zero'),
    rx: z.number().min(0, 'Rectangle rx must be at least 0').optional(),
    ry: z.number().min(0, 'Rectangle ry must be at least 0').optional(),
});

const WhiteboardSeedCircleSchema = WhiteboardSeedElementBaseSchema.extend({
    type: z.literal('circle'),
    x: WhiteboardSeedXSchema,
    y: WhiteboardSeedYSchema,
    radius: z.number().positive('Circle radius must be greater than zero'),
});

const WhiteboardSeedTriangleSchema = WhiteboardSeedElementBaseSchema.extend({
    type: z.literal('triangle'),
    x: WhiteboardSeedXSchema,
    y: WhiteboardSeedYSchema,
    width: z.number().positive('Triangle width must be greater than zero'),
    height: z.number().positive('Triangle height must be greater than zero'),
});

const WhiteboardSeedLineSchema = WhiteboardSeedElementBaseSchema.extend({
    type: z.literal('line'),
    start: WhiteboardSeedPointSchema,
    end: WhiteboardSeedPointSchema,
});

const WhiteboardSeedTextSchema = WhiteboardSeedElementBaseSchema.extend({
    type: z.literal('text'),
    x: WhiteboardSeedXSchema,
    y: WhiteboardSeedYSchema,
    text: z.string().min(1, 'Seed text cannot be empty'),
    color: z.string()
        .optional()
        .describe('Optional text color such as "#111827". Defaults to a dark neutral.'),
    fontSize: z.number()
        .positive('Text fontSize must be greater than zero')
        .optional()
        .describe('Optional text size. Defaults to 24.'),
    fontWeight: z.number()
        .int('Seed text fontWeight must be between 100 and 900')
        .min(100, 'Seed text fontWeight must be between 100 and 900')
        .max(900, 'Seed text fontWeight must be between 100 and 900')
        .optional()
        .describe('Optional text weight from 100 to 900.'),
    fontStyle: z.enum(['normal', 'italic', 'oblique'])
        .optional()
        .describe('Optional text style.'),
    textAlign: z.enum(['left', 'center', 'right', 'justify'])
        .optional()
        .describe('Optional text alignment.'),
    fontFamily: z.string()
        .optional()
        .describe('Optional font family. Defaults to "sans-serif".'),
});

const WhiteboardSeedElementSchema = z.discriminatedUnion('type', [
    WhiteboardSeedRectangleSchema,
    WhiteboardSeedCircleSchema,
    WhiteboardSeedTriangleSchema,
    WhiteboardSeedLineSchema,
    WhiteboardSeedTextSchema,
]);

const WhiteboardInitialCanvasSchema = z.object({
    name: z.string()
        .min(1, 'Canvas name cannot be empty')
        .describe('Display name for the pre-populated canvas.'),
    fabricState: z.string()
        .min(1, 'Canvas fabricState cannot be empty')
        .optional()
        .describe('Advanced path for reopening sessions: serialized Fabric.js JSON. If provided, it must be valid JSON with an objects array. Prefer seedElements for new agent-authored starter sketches.'),
    seedElements: z.array(WhiteboardSeedElementSchema)
        .min(1, 'Canvas seedElements cannot be empty')
        .optional()
        .describe('Preferred agent-friendly path for simple starter sketches. Provide basic shapes/text and Seamless Agent will convert them into Fabric.js canvas content.'),
}).superRefine((canvas, ctx) => {
    const hasFabricState = typeof canvas.fabricState === 'string';
    const hasSeedElements = Array.isArray(canvas.seedElements);

    if (!hasFabricState && !hasSeedElements) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['seedElements'],
            message: 'Canvas must include either fabricState or seedElements',
        });
        return;
    }

    if (hasFabricState && hasSeedElements) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['seedElements'],
            message: 'Canvas cannot include both fabricState and seedElements',
        });
        return;
    }

    if (hasFabricState && canvas.fabricState) {
        try {
            normalizeAndValidateLoadableFabricState(canvas.fabricState);
        } catch (error) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['fabricState'],
                message: error instanceof Error ? error.message : 'Canvas fabricState must be valid JSON with an objects array',
            });
        }
    }
});

/**
 * Schema for open_whiteboard tool input
 */
export const WhiteboardInputSchema = z.object({
    context: z.string()
        .optional()
        .describe('Instructions for the user about what to draw or annotate. Displayed as a prompt header above the canvas. Keep it concise and actionable, e.g. "Please sketch the component layout" or "Annotate the areas that need changes".'),
    title: z.string()
        .optional()
        .describe('Title for the whiteboard panel.'),
    blankCanvas: z.boolean()
        .optional()
        .default(true)
        .describe('Open a blank canvas. Defaults to true. When initialCanvases is provided this flag is superseded — the initial canvases are used instead of a blank canvas. Set to true (or omit) when you want a blank board with no pre-drawn content.'),
    initialCanvases: z.array(WhiteboardInitialCanvasSchema)
        .optional()
        .describe('Optional starter canvases to pre-populate for the user. When provided, supersedes blankCanvas. ' +
            'Each canvas requires either seedElements (preferred for new agent-authored content) or fabricState (for reopening a saved session) — not both. ' +
            'Use seedElements for coordinate-first shape/text sketches; use fabricState only when you have valid Fabric.js JSON from a previous session.'),
    importImages: z.array(WhiteboardImportImageSchema)
        .optional()
        .describe('Optional images to pre-load onto the canvas for the user to annotate. ' +
            'Primary use case: screenshot or mockup annotation — load an image then let the user draw on top of it. ' +
            'Each image must be a local file URI (file://...). Supported types: PNG, JPEG, GIF, WebP.'),
});

// ================================
// A2UI Schemas (render_ui tool)
// ================================

const COMPONENT_CATALOG_DESCRIPTION = `Component definition object. Must have a top-level "type" field.

LAYOUT COMPONENTS (use these to structure the surface):
  Row    — horizontal flex container.  props: { gap?: string, align?: "flex-start"|"center"|"flex-end"|"stretch", wrap?: boolean, style?: object }
  Column — vertical flex container.   props: { gap?: string, align?: "flex-start"|"center"|"flex-end"|"stretch", style?: object }
  Card   — bordered container with padding.  props: { title?: string, style?: object }

CONTENT COMPONENTS:
  Text      — paragraph text.        props: { text: string, style?: object }
  Heading   — section heading.       props: { text: string, level?: 1|2|3|4|5|6, style?: object }
  Markdown  — rendered Markdown.     props: { content: string }
  CodeBlock — syntax-highlighted code.  props: { code: string, language?: string }
  Image     — image.                 props: { src: string, alt?: string, width?: string, height?: string, style?: object }
  Badge     — inline status label.   props: { label: string, variant?: "default"|"info"|"success"|"warning"|"danger" }
  Divider   — horizontal rule.       props: {}
  ProgressBar — progress indicator.  props: { value: number (0-100), max?: number, label?: string, showValue?: boolean }
              showValue (default true) controls whether the XX% percentage is displayed next to the label.
  Table     — data table.            props: { columns: Array<{key: string, label: string}>, data: Array<Record<string, string|number>>, style?: object }
              "key" in each column maps to the matching property name in each data row.
              Example: { columns: [{key:"name",label:"Name"},{key:"age",label:"Age"}], data: [{name:"Alice",age:30},{name:"Bob",age:25}] }

INTERACTIVE COMPONENTS (trigger userAction when used):
  Button    — clickable button.      props: { label: string, action: string, variant?: "primary"|"secondary"|"danger", disabled?: boolean, ariaLabel?: string }
  TextField — text input.            props: { label: string, name: string, placeholder?: string, value?: string, required?: boolean, helperText?: string }
              helperText shows a small hint below the input field.
  Checkbox  — boolean toggle.        props: { label: string, name: string, checked?: boolean }
  Select    — dropdown.              props: { label: string, name: string, options: string[]|{label:string,value:string}[], value?: string, placeholder?: string, helperText?: string }
              placeholder shows as an empty first option when no value is selected. helperText shows a small hint below the select.
  Toggle    — on/off switch.         props: { label: string, name: string, checked?: boolean }

CHART COMPONENTS:
  BarChart  — bar chart.    props: { data: Array<{label:string,value:number}>, title?: string, color?: string, horizontal?: boolean, showValues?: boolean, style?: object }
              Default height: 300px. Override with style: { height: "200px" }.
  LineChart — line chart.   props: { data: Array<{label:string,value:number}>, title?: string, color?: string, showPoints?: boolean, smooth?: boolean, style?: object }
              Default height: 300px. Override with style: { height: "200px" }.
  PieChart  — pie/donut.    props: { data: Array<{label:string,value:number,color?:string}>, title?: string, doughnut?: boolean, showLegend?: boolean, style?: object }
              Default height: 300px. Override with style: { height: "250px" }.
  MermaidDiagram — Mermaid diagram (flowchart, gantt, pie, sequence, etc.).  props: { definition: string }

STRUCTURAL COMPONENTS:
  Tabs      — tabbed panels.  props: { tabs: { label: string, id: string }[] }  — pair each tab with child components using parentId matching tab id

ESCAPE HATCH (use when catalog components cannot express the layout you need):
  HTML      — raw sanitized HTML injected into the surface.  props: { html: string, css?: string, sandbox?: boolean }
              Dangerous tags (script/style/object/embed) and event handlers are automatically stripped.
              css: optional scoped CSS string injected alongside the HTML (unsafe properties are filtered).
              sandbox: when true, renders in a sandboxed iframe for strict isolation (no parent DOM access).
              Use this for CSS grid, custom tables, complex layouts, or any markup the catalog lacks.
              Example: { "type": "HTML", "html": "<div style='display:grid;grid-template-columns:1fr 1fr;gap:16px'>...</div>" }

STYLING NOTES:
  - "style" props accept an object of CSS properties in camelCase, e.g. { "backgroundColor": "#fff", "padding": "16px" }
  - Supported style properties: color, backgroundColor, borderColor, margin*, padding*, width, height, min/maxWidth/Height,
    border*, borderRadius, fontSize, fontWeight, fontFamily, lineHeight, textAlign, textDecoration, display,
    flexDirection, justifyContent, alignItems, alignSelf, gap, flex, flexGrow, flexShrink, flexBasis, flexWrap,
    overflow, overflowX, overflowY, whiteSpace, textOverflow, cursor, boxSizing, objectFit, objectPosition,
    gridTemplateColumns, gridTemplateRows, gridColumn, gridRow, opacity.
  - Unsupported properties (e.g. position, z-index) are silently dropped and reported back in "droppedStyles".
  - For layouts requiring position/z-index or complex CSS, use the HTML component instead.

DATA BINDING:
  - Props can reference the dataModel using JSON Pointer syntax: { "path": "/key/subkey" }
  - Example: { "type": "Text", "text": { "path": "/user/name" } }  (resolved from dataModel.user.name)`;

export const RenderUIInputSchema = z.object({
    surfaceId: z.string()
        .optional()
        .describe('Optional unique surface identifier. Re-using the same id will update an existing panel. If omitted, a new surface is always created with a generated ID. Generate a short descriptive id like "user-profile" or "order-summary". Store the returned surfaceId to target this panel with append_ui, update_ui, or close_ui later.'),
    title: z.string()
        .optional()
        .describe('Optional panel title displayed in the webview header.'),
    components: z.array(
        z.object({
            id: z.string().min(1, 'Component id cannot be empty'),
            component: z.record(z.string(), z.unknown())
                .describe(COMPONENT_CATALOG_DESCRIPTION),
            parentId: z.string()
                .optional()
                .describe('ID of the parent component. Omit for root-level components. Use to nest inside Row, Column, Card, or Tabs.'),
            visibleIf: z.unknown()
                .optional()
                .describe('Declarative predicate controlling component visibility. Serialized to data-visible-if at render time.'),
            enabledIf: z.unknown()
                .optional()
                .describe('Declarative predicate controlling enabled state. Only valid on interactive components (Button, TextField, Checkbox, Select, Toggle).'),
        }),
    ).optional()
        .describe('Flat list of UI components with optional parent references. Required unless deleteSurface is true. For streaming/progressive UIs, call render_ui with initial components (streaming:true), then call append_ui to add more, ending with append_ui(finalize:true).'),
    dataModel: z.record(z.string(), z.unknown())
        .optional()
        .describe('Data model for JSON Pointer binding resolution in component props. Reference values with { "path": "/key" } syntax. Can be updated independently via update_ui without re-rendering the full component tree.'),
    enableA2UI: z.boolean()
        .optional()
        .default(true)
        .describe('Enable the built-in A2UI validation and accessibility enhancement pass before rendering. Defaults to true. Auto-adds aria labels, cancel safeguards for destructive buttons, and reports UX issues.'),
    a2uiLevel: z.enum(['basic', 'strict'])
        .optional()
        .default('basic')
        .describe('A2UI processing level. "basic" (default) applies soft guidance; "strict" promotes warnings to errors for stricter UX enforcement.'),
    waitForAction: z.boolean()
        .optional()
        .default(false)
        .describe('If true, block until the user fires a Button action, then return. ' +
            'The response will include userAction.name (the clicked Button\'s "action" prop value) and userAction.data ' +
            '(a Record<string, unknown> keyed by each form component\'s "name" prop, containing the submitted field values). ' +
            'Use false (default) to return immediately after rendering. ' +
            'Incompatible with streaming:true — do not set both to true.'),
    streaming: z.boolean()
        .optional()
        .default(false)
        .describe('If true, show a "Generating\u2026" loading indicator below the rendered components. ' +
            'Call append_ui to add more components incrementally, then call append_ui(finalize:true) to dismiss the indicator. ' +
            'Full workflow: render_ui(streaming:true) \u2192 append_ui() \u00d7 N \u2192 append_ui(finalize:true). ' +
            'Use for progressive UI construction where you render initial structure immediately and fill in details in subsequent append_ui calls. ' +
            'Do not combine with waitForAction:true.'),
    deleteSurface: z.boolean()
        .optional()
        .default(false)
        .describe('If true, close and remove an existing surface identified by surfaceId instead of rendering components. ' +
            'surfaceId is required when deleteSurface is true. ' +
            'Returns rendered:false and deleted:true on success. ' +
            'Lightweight alternative: use close_ui when you only want to close without any component changes.'),
}).superRefine((input, ctx) => {
    if (input.deleteSurface) {
        if (!input.surfaceId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['surfaceId'],
                message: 'surfaceId is required when deleteSurface is true',
            });
        }
        return;
    }

    if (!Array.isArray(input.components) || input.components.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['components'],
            message: 'components is required unless deleteSurface is true',
        });
    }
});

// ================================
// A2UI Delta Schemas (update_ui / append_ui / close_ui)
// ================================

/** Shared component entry schema (mirrors the entry in RenderUIInputSchema) */
const A2UIComponentEntrySchema = z.object({
    id: z.string().min(1, 'Component id cannot be empty'),
    component: z.record(z.string(), z.unknown())
        .describe(COMPONENT_CATALOG_DESCRIPTION),
    parentId: z.string()
        .optional()
        .describe('ID of the parent component. Omit for root-level components. Use to nest inside Row, Column, Card, or Tabs.'),
    visibleIf: z.unknown()
        .optional()
        .describe('Declarative predicate controlling component visibility.'),
    enabledIf: z.unknown()
        .optional()
        .describe('Declarative predicate controlling enabled state. Only valid on interactive components (Button, TextField, Checkbox, Select, Toggle).'),
});

/**
 * Schema for update_ui tool input.
 * Mutates the dataModel (and optionally title) of an existing surface without resending the full component tree.
 */
export const UpdateUIInputSchema = z.object({
    surfaceId: z.string()
        .min(1, 'surfaceId cannot be empty')
        .describe('The surface identifier of the panel to update.'),
    title: z.string()
        .optional()
        .describe('Optional new panel title. Applied immediately to the open panel. Can be combined with dataModel, or used alone.'),
    dataModel: z.record(z.string(), z.unknown())
        .optional()
        .describe('Full replacement data model — this REPLACES the entire dataModel, it is NOT a patch or merge. ' +
            'All component props using { "path": "/key" } JSON Pointer bindings are re-resolved from the new model. ' +
            'Triggers a complete re-render of bound components. ' +
            'The binding placeholders must already exist in the component tree from the original render_ui call.'),
}).superRefine((input, ctx) => {
    if (input.title === undefined && input.dataModel === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dataModel'],
            message: 'At least one of title or dataModel must be provided',
        });
    }
});

/**
 * Schema for append_ui tool input.
 * Appends components onto an existing surface without replacing the current component tree.
 */
export const AppendUIInputSchema = z.object({
    surfaceId: z.string()
        .min(1, 'surfaceId cannot be empty')
        .describe('The surface identifier of the panel to append onto. Must be an ID returned by a prior render_ui call. ' +
            'If the surface no longer exists, notFound:true is returned — call list_surfaces to discover active panels.'),
    components: z.array(A2UIComponentEntrySchema)
        .min(1, 'components must not be empty')
        .describe('Non-empty list of components to append to the existing surface.'),
    title: z.string()
        .optional()
        .describe('Optional new panel title. When provided, the panel title is updated before the new components are appended.'),
    finalize: z.boolean()
        .optional()
        .default(false)
        .describe('If true, dismiss the streaming loading indicator after appending these components. Use this on the last append_ui call in a streaming sequence started with render_ui(streaming:true). Has no effect if the surface is not in streaming mode.'),
});

/**
 * Schema for close_ui tool input.
 * Closes an existing surface panel by surfaceId.
 */
export const CloseUIInputSchema = z.object({
    surfaceId: z.string()
        .min(1, 'surfaceId cannot be empty')
        .describe('The surface identifier of the panel to close. Obtain from the surfaceId returned by render_ui, or call list_surfaces to enumerate active panels.'),
});

/**
 * Schema for list_surfaces tool input.
 * Lists all currently active surface panels.
 */
export const ListSurfacesInputSchema = z.object({
}).describe('Lists all currently active surface panels with their metadata.');

// ================================
// TypeScript Types (derived from schemas)
// ================================

export type AskUserInput = z.infer<typeof AskUserInputSchema>;
export type ApprovePlanInput = z.infer<typeof ApprovePlanInputSchema>;
export type PlanReviewInput = z.infer<typeof PlanReviewInputSchema>;
export type WalkthroughReviewInput = z.infer<typeof WalkthroughReviewInputSchema>;
export type WhiteboardInput = z.input<typeof WhiteboardInputSchema>;
export type RenderUIInput = z.input<typeof RenderUIInputSchema>;
export type UpdateUIInput = z.infer<typeof UpdateUIInputSchema>;
export type AppendUIInput = z.input<typeof AppendUIInputSchema>;
export type CloseUIInput = z.infer<typeof CloseUIInputSchema>;
export type ListSurfacesInput = z.infer<typeof ListSurfacesInputSchema>;

// ================================
// Result Interfaces
// ================================

/**
 * Result structure returned to the AI from ask_user
 */
export interface AskUserToolResult {
    responded: boolean;
    response: string;
    attachments: string[]; // Array of file URIs
}

/**
 * Result structure for approve_plan tool
 */
export interface ApprovePlanToolResult {
    status: 'approved' | 'recreateWithChanges' | 'cancelled' | 'acknowledged';
    requiredRevisions: RequiredPlanRevisions[];
}

/**
 * Result structure for plan_review tool
 */
export interface PlanReviewToolResult {
    status: 'approved' | 'recreateWithChanges' | 'cancelled' | 'acknowledged';
    requiredRevisions: RequiredPlanRevisions[];
    reviewId: string;
}


/**
 * Result structure for open_whiteboard tool
 */
export interface WhiteboardExportedImage {
    canvasId: string;
    canvasName: string;
    /** Base64 data URI of the exported canvas PNG image (e.g. "data:image/png;base64,..."). */
    imageUri: string;
    width: number;
    height: number;
}

export interface WhiteboardToolResult {
    /** True when the user submitted the whiteboard (action is 'approved' or 'recreateWithChanges'). False when cancelled. */
    submitted: boolean;
    /**
     * The user's review decision:
     * - 'approved': Use the returned images as confirmed visual input in your next response.
     * - 'recreateWithChanges': Address the annotated feedback and call open_whiteboard again with updated content.
     * - 'cancelled': Discard the submission; do not treat it as approved user input.
     */
    action: WhiteboardReviewAction;
    /**
     * Pre-written behavioral instruction string based on action.
     * Summarizes what the agent should do next (e.g. "use images as confirmed input" or "address feedback and re-open whiteboard").
     * Surface this to the agent's reasoning if unsure how to proceed.
     */
    instruction: string;
    /**
     * Exported canvas images as base64 data URIs.
     * Each element corresponds to one canvas tab the user drew on.
     * Inspect these images when action is 'approved' or 'recreateWithChanges'.
     */
    images: WhiteboardExportedImage[];
    interactionId: string;
    /** Optional free-text comment the user left alongside the submission. */
    userComment?: string;
}

/**
 * Result structure for render_ui tool
 */
export interface RenderUIToolResult {
    /**
     * The surface identifier for this panel. Pass this to append_ui, update_ui, or close_ui
     * to target the same panel in subsequent calls.
     */
    surfaceId: string;
    /**
     * True when the surface was rendered (or updated). False when:
     * - The cancellation token was fired before rendering completed.
     * - deleteSurface:true was passed (in which case check `deleted` instead).
     */
    rendered: boolean;
    /**
     * Present when deleteSurface:true was passed. True if the panel was found and closed.
     */
    deleted?: boolean;
    /**
     * Non-fatal rendering issues. Advisory only — the panel was still rendered.
     * Consider using the HTML component for layouts that need dropped CSS properties.
     */
    renderErrors?: Array<{
        source: 'renderer' | 'webview';
        message: string;
        componentId?: string;
    }>;
    /**
     * A2UI validation report. score is 0–100 (higher is better UX quality).
     * issues lists specific UX problems found; appliedEnhancements lists auto-fixes applied.
     * Only present when enableA2UI:true (default).
     */
    a2ui?: {
        enabled: true;
        level: A2UILevel;
        /** UX quality score 0–100. Higher is better. Scores below 60 indicate significant issues. */
        score: number;
        issues: A2UIIssue[];
        appliedEnhancements: string[];
    };
    /**
     * Present when waitForAction:true and the user clicked a Button.
     * name = the clicked Button's "action" prop value (identifies which button was clicked).
     * data = a Record keyed by each form component's "name" prop, containing the submitted field values.
     * Example: { name: "submit", data: { "username": "alice", "role": "admin", "notify": true } }
     */
    userAction?: {
        /** The "action" prop of the Button the user clicked. */
        name: string;
        /** Form field values: keyed by each TextField/Checkbox/Select/Toggle component's "name" prop. */
        data: Record<string, unknown>;
    };
    /**
     * CSS properties silently dropped by the style whitelist (advisory, panel still rendered).
     * If entries are present, consider using the HTML component for sections that need those
     * properties (e.g. position, z-index, box-shadow, transition).
     */
    droppedStyles?: Array<{ componentId: string; properties: string[] }>;
}

/** Shared render error shape used by delta tool results */
type DeltaRenderError = {
    source: 'renderer' | 'webview';
    message: string;
    componentId?: string;
};

/**
 * Result structure for update_ui tool
 *
 * `applied` and `renderErrors` are independent dimensions:
 * - `applied: true` means the state mutation (title and/or dataModel) was committed to the panel.
 *   It does **not** guarantee pixel-perfect rendering.
 * - `renderErrors` (when present alongside `applied: true`) means the update was persisted but
 *   the renderer encountered issues while generating the updated HTML. LM/MCP consumers should
 *   treat `applied: true` as "state is updated" and surface `renderErrors` as advisory warnings.
 */
export interface UpdateUIToolResult {
    surfaceId: string;
    /** True when the update was applied to the panel state. May coexist with `renderErrors`. */
    applied: boolean;
    /** True when no surface with the given surfaceId was found. */
    notFound?: boolean;
    /**
     * Non-fatal rendering issues encountered during the re-render triggered by this update.
     * Present only when `applied: true` and the renderer reported problems. State was mutated
     * even if render errors are present; the panel may display degraded output.
     */
    renderErrors?: DeltaRenderError[];
    /**
     * CSS properties that were silently dropped by the style whitelist during the re-render
     * triggered by this update. Consider using the HTML component for sections that need those
     * properties.
     */
    droppedStyles?: Array<{ componentId: string; properties: string[] }>;
}

/**
 * Result structure for append_ui tool
 *
 * `applied` and `renderErrors` are independent dimensions:
 * - `applied: true` means the components (and optional title) were committed to the panel.
 *   It does **not** guarantee pixel-perfect rendering.
 * - `renderErrors` (when present alongside `applied: true`) means the append was persisted but
 *   the renderer encountered issues. LM/MCP consumers should treat `applied: true` as
 *   "state is updated" and surface `renderErrors` as advisory warnings.
 */
export interface AppendUIToolResult {
    surfaceId: string;
    /** True when the components were appended to the panel state. May coexist with `renderErrors`. */
    applied: boolean;
    /** True when no surface with the given surfaceId was found. */
    notFound?: boolean;
    /**
     * Non-fatal rendering issues encountered during the re-render triggered by this append.
     * Present only when `applied: true` and the renderer reported problems. State was mutated
     * even if render errors are present; the panel may display degraded output.
     */
    renderErrors?: DeltaRenderError[];
    /**
     * CSS properties that were silently dropped by the style whitelist after this append.
     * Consider using the HTML component for sections that need those properties.
     */
    droppedStyles?: Array<{ componentId: string; properties: string[] }>;
}

/**
 * Result structure for close_ui tool
 */
export interface CloseUIToolResult {
    surfaceId: string;
    /**
     * True when the panel was found and successfully closed.
     * False when no surface with the given surfaceId was found (it may already be closed or was never created).
     * If false, call list_surfaces to enumerate currently active panels.
     */
    closed: boolean;
}

/**
 * Metadata about a single surface
 */
export interface SurfaceInfo {
    /** The unique surface identifier */
    surfaceId: string;
    /** The panel title (may be empty string) */
    title: string;
    /** ISO 8601 timestamp when the surface was created */
    created: string;
}

/**
 * Result structure for list_surfaces tool
 */
export interface ListSurfacesToolResult {
    /** Array of active surfaces with their metadata */
    surfaces: SurfaceInfo[];
}

// ================================
// Validation Helpers
// ================================

/**
 * Validates and parses ask_user input, throwing on validation errors
 */
export function parseAskUserInput(input: unknown): AskUserInput {
    return AskUserInputSchema.parse(input);
}

/**
 * Validates and parses approve_plan input, throwing on validation errors
 */
export function parseApprovePlanInput(input: unknown): ApprovePlanInput {
    return ApprovePlanInputSchema.parse(input);
}

/**
 * Validates and parses plan_review input, throwing on validation errors
 */
export function parsePlanReviewInput(input: unknown): PlanReviewInput {
    return PlanReviewInputSchema.parse(input);
}

/**
 * Validates and parses walkthrough_review input, throwing on validation errors
 */
export function parseWalkthroughReviewInput(input: unknown): WalkthroughReviewInput {
    return WalkthroughReviewInputSchema.parse(input);
}


/**
 * Validates and parses open_whiteboard input, throwing on validation errors
 */
export function parseWhiteboardInput(input: unknown): WhiteboardInput {
    return WhiteboardInputSchema.parse(input);
}

/**
 * Validates and parses render_ui input, throwing on validation errors
 */
export function parseRenderUIInput(input: unknown): RenderUIInput {
    return RenderUIInputSchema.parse(input);
}

/**
 * Validates and parses update_ui input, throwing on validation errors
 */
export function parseUpdateUIInput(input: unknown): UpdateUIInput {
    return UpdateUIInputSchema.parse(input);
}

/**
 * Validates and parses append_ui input, throwing on validation errors
 */
export function parseAppendUIInput(input: unknown): AppendUIInput {
    return AppendUIInputSchema.parse(input);
}

/**
 * Validates and parses close_ui input, throwing on validation errors
 */
export function parseCloseUIInput(input: unknown): CloseUIInput {
    return CloseUIInputSchema.parse(input);
}

export function parseListSurfacesInput(input: unknown): ListSurfacesInput {
    return ListSurfacesInputSchema.parse(input);
}

/**
 * Safely validates input and returns result or error message
 */
export function safeParseInput<T>(
    schema: z.ZodSchema<T>,
    input: unknown
): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(input);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errorMessages = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { success: false, error: errorMessages };
}
