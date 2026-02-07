import { z } from 'zod';
import type { RequiredPlanRevisions, PlanReviewMode } from '../webview/types';

// ================================
// Input Schemas with Zod Validation
// ================================

/**
 * Schema for a single option item (string or {label, description})
 */
const OptionItemSchema = z.union([
    z.string(),
    z.object({
        label: z.string().describe('The display label for the option button'),
        description: z.string().optional().describe('Optional description shown below the label')
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
        .describe('Optional predefined answer options. Can be a flat array of strings/objects for simple choices (e.g. ["Yes", "No"]), or an array of option groups for multi-category selection (e.g. [{"title": "Framework", "options": ["Express", "Koa"], "multiSelect": false}]). User clicks to select, then submits.')
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

// ================================
// TypeScript Types (derived from schemas)
// ================================

export type AskUserInput = z.infer<typeof AskUserInputSchema>;
export type ApprovePlanInput = z.infer<typeof ApprovePlanInputSchema>;
export type PlanReviewInput = z.infer<typeof PlanReviewInputSchema>;
export type WalkthroughReviewInput = z.infer<typeof WalkthroughReviewInputSchema>;

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
