/**
 * Interaction History Data Models
 * 
 * Defines data structures for tracking individual tool call interactions
 * within the Seamless Agent console.
 */

import { AttachmentInfo, ToolCallInteraction } from "./types";


/**
 * Maximum number of interactions to keep in history
 */
export const MAX_INTERACTIONS = 50;

/**
 * Creates a ToolCallInteraction from request data
 */
export function createInteraction(
    requestId: string,
    question: string,
    title: string,
    response: string,
    attachments: AttachmentInfo[],
    status: 'completed' | 'cancelled'
): ToolCallInteraction {
    return {
        id: requestId,
        timestamp: Date.now(),
        input: {
            question,
            title
        },
        output: {
            response,
            attachments: [...attachments]
        },
        status
    };
}

/**
 * Trims interactions array to MAX_INTERACTIONS, keeping most recent
 */
export function trimInteractions(interactions: ToolCallInteraction[]): ToolCallInteraction[] {
    if (interactions.length <= MAX_INTERACTIONS) {
        return interactions;
    }
    // Sort by timestamp descending and keep most recent
    return interactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_INTERACTIONS);
}

/**
 * Serializes interactions to JSON for storage
 */
export function serializeInteractions(interactions: ToolCallInteraction[]): string {
    return JSON.stringify(interactions, null, 2);
}

/**
 * Deserializes interactions from JSON storage
 */
export function deserializeInteractions(json: string): ToolCallInteraction[] {
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
            return parsed as ToolCallInteraction[];
        }
        return [];
    } catch (_error: unknown) {
        return [];
    }
}
export { ToolCallInteraction };

