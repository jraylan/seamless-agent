/**
 * Data interfaces and utilities for Chat Output Renderers.
 * 
 * These types define the binary data schemas passed via `toolResultDetails2.value`
 * to registered chat output renderers. Data is encoded as UTF-8 JSON in a Uint8Array.
 */

import type { PlanReviewMode } from '../webview/types';

// ================================
// Renderer Data Interfaces
// ================================

/**
 * Data passed to the `ask_user` chat output renderer.
 * 
 * Combines data from the tool input (question, agentName, title) and the tool
 * result (responded, response, attachments) to provide full context for the card.
 */
export interface AskUserRendererData {
    /** The question that was asked */
    question: string;
    /** The user's response text */
    response: string;
    /** Whether the user responded (false = dismissed/cancelled) */
    responded: boolean;
    /** The agent name that invoked the tool */
    agentName?: string;
    /** Custom title for the interaction */
    title?: string;
    /** Unix timestamp (ms) of when the interaction completed */
    timestamp: number;
    /** Attachments provided by the user */
    attachments: AskUserAttachment[];
}

/**
 * Attachment metadata for the ask_user renderer card.
 */
export interface AskUserAttachment {
    /** Display name of the file */
    name: string;
    /** File URI string */
    uri: string;
    /** Whether the file is an image (for inline preview) */
    isImage: boolean;
}

/**
 * Data passed to the plan review chat output renderer.
 */
export interface PlanReviewRendererData {
    /** Title of the plan review */
    title: string;
    /** Review outcome status */
    status: 'approved' | 'recreateWithChanges' | 'cancelled' | 'acknowledged';
    /** Review mode: 'review' for plan approval, 'walkthrough' for step-by-step guides */
    mode: PlanReviewMode;
    /** Full markdown plan content (truncated to MAX_PLAN_SIZE if needed) */
    plan: string;
    /** Unix timestamp (ms) of when the review completed */
    timestamp: number;
    /** Revision comments from the user (if status is 'recreateWithChanges') */
    requiredRevisions: PlanRevisionComment[];
    /** Unique reviewer identifier */
    reviewId: string;
}

/**
 * A single revision comment on a plan review.
 */
export interface PlanRevisionComment {
    /** The part of the plan being commented on */
    revisedPart: string;
    /** The user's revision instructions */
    revisorInstructions: string;
}

// ================================
// Encoding / Decoding Utilities
// ================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Maximum plan content size in bytes for renderer data.
 * Plans exceeding this are truncated; the full plan remains in the Agent Console.
 */
export const MAX_PLAN_RENDERER_SIZE = 50 * 1024; // 50KB

/**
 * Encodes renderer data to a Uint8Array for `toolResultDetails2.value`.
 */
export function encodeRendererData<T>(data: T): Uint8Array {
    return textEncoder.encode(JSON.stringify(data));
}

/**
 * Decodes renderer data from a Uint8Array received in `renderChatOutput`.
 * Throws if the data is malformed.
 */
export function decodeRendererData<T>(value: Uint8Array): T {
    const json = textDecoder.decode(value);
    return JSON.parse(json) as T;
}

/**
 * Truncates plan content to MAX_PLAN_RENDERER_SIZE bytes.
 * Returns the truncated string and whether truncation occurred.
 */
export function truncatePlan(plan: string): { content: string; truncated: boolean } {
    const encoded = textEncoder.encode(plan);
    if (encoded.length <= MAX_PLAN_RENDERER_SIZE) {
        return { content: plan, truncated: false };
    }
    // Truncate at byte level, then decode safely (may trim a partial UTF-8 char)
    const truncatedBytes = encoded.slice(0, MAX_PLAN_RENDERER_SIZE);
    const content = textDecoder.decode(truncatedBytes);
    return { content, truncated: true };
}
