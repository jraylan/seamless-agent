import { z } from 'zod';
import type { RequiredPlanRevisions, WhiteboardReviewAction, WhiteboardSubmittedCanvas } from '../webview/types';
import { normalizeAndValidateLoadableFabricState } from '../whiteboard/seededCanvas';
import type { WhiteboardSceneSummary } from '../whiteboard/sceneSummary';
import {
    DEFAULT_WHITEBOARD_CANVAS_HEIGHT,
    DEFAULT_WHITEBOARD_CANVAS_WIDTH,
} from '../whiteboard/canvasState';

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
        .describe('Preferred agent-friendly path for simple starter sketches. Provide basic shapes/text and Seamless Agent will convert them into Fabric.js canvas content.')
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

    const fabricState = hasFabricState ? canvas.fabricState : undefined;
    if (fabricState && fabricState.length > 0) {
        try {
            normalizeAndValidateLoadableFabricState(fabricState);
        } catch (error) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['fabricState'],
                message: error instanceof Error ? error.message : 'Canvas fabricState must be valid JSON with an objects array',
            });
        }
    }
});

export const WHITEBOARD_EXPLICIT_BLANK_MESSAGE = 'Provide initialCanvases for starter content, or set blankCanvas to true to intentionally open an empty whiteboard';

export const WHITEBOARD_AMBIGUOUS_BLANK_MESSAGE = 'blankCanvas cannot be true when initialCanvases are provided';

/**
 * Schema for open_whiteboard tool input
 */
export const WhiteboardInputSchema = z.object({
    context: z.string()
        .optional()
        .describe('Optional context/instructions for the whiteboard session.'),
    title: z.string()
        .optional()
        .describe('Optional title for the whiteboard panel.'),
    blankCanvas: z.boolean()
        .optional()
        .describe('Set to true only when you intentionally open an empty whiteboard. If omitted or false, provide initialCanvases with starter content.'),
    initialCanvases: z.array(WhiteboardInitialCanvasSchema)
        .optional()
        .describe('Optional pre-populated canvases. Prefer seedElements for agent-authored starter sketches; use fabricState for reopening/advanced callers.')
}).superRefine((input, ctx) => {
    const hasInitialCanvases = Array.isArray(input.initialCanvases) && input.initialCanvases.length > 0;

    if (!hasInitialCanvases && input.blankCanvas !== true) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['blankCanvas'],
            message: WHITEBOARD_EXPLICIT_BLANK_MESSAGE,
        });
    }

    if (hasInitialCanvases && input.blankCanvas === true) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['blankCanvas'],
            message: WHITEBOARD_AMBIGUOUS_BLANK_MESSAGE,
        });
    }
});

// ================================
// TypeScript Types (derived from schemas)
// ================================

export type AskUserInput = z.infer<typeof AskUserInputSchema>;
export type ApprovePlanInput = z.infer<typeof ApprovePlanInputSchema>;
export type PlanReviewInput = z.infer<typeof PlanReviewInputSchema>;
export type WalkthroughReviewInput = z.infer<typeof WalkthroughReviewInputSchema>;
export type WhiteboardInput = z.infer<typeof WhiteboardInputSchema>;

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
export interface WhiteboardToolResult {
    submitted: boolean;
    action: WhiteboardReviewAction;
    instruction: string;
    canvases: WhiteboardSubmittedCanvas[];
    interactionId: string;
    sceneSummary: WhiteboardSceneSummary;
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
