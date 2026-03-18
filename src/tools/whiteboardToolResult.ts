import type { WhiteboardToolResult } from './schemas';

export type WhiteboardLanguageModelResultPart = { type: 'text'; value: string };

export async function createWhiteboardLanguageModelResultParts(
    result: WhiteboardToolResult,
): Promise<WhiteboardLanguageModelResultPart[]> {
    return [
        { type: 'text', value: JSON.stringify(result) },
    ];
}
