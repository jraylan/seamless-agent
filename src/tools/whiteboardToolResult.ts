import type { WhiteboardToolResult } from './schemas';

export type WhiteboardLanguageModelResultPart = { type: 'text'; value: string };

export async function createWhiteboardLanguageModelResultParts(
    result: WhiteboardToolResult,
): Promise<WhiteboardLanguageModelResultPart[]> {
    // Strip heavy fields (fabricState, thumbnail, shapes, images) from canvas entries
    // before sending to the LLM — these can be hundreds of KB and crash the chat session.
    // The sceneSummary already provides all structural information the model needs.
    const lightResult = {
        ...result,
        canvases: result.canvases.map(({ id, imageUri, name }) => ({ id, imageUri, name })),
    };
    return [
        { type: 'text', value: JSON.stringify(lightResult) },
    ];
}
