/**
 * Unit Tests for Session History Data Models
 *
 * Tests createInteraction, trimInteractions, serializeInteractions,
 * and deserializeInteractions functions.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    MAX_INTERACTIONS,
    createInteraction,
    trimInteractions,
    serializeInteractions,
    deserializeInteractions,
    ToolCallInteraction,
} from './sessionHistory';

describe('Session History', () => {
    // ========================
    // MAX_INTERACTIONS constant
    // ========================
    describe('MAX_INTERACTIONS', () => {
        it('should be 50', () => {
            assert.strictEqual(MAX_INTERACTIONS, 50);
        });
    });

    // ========================
    // createInteraction
    // ========================
    describe('createInteraction', () => {
        it('should create a completed interaction with all fields', () => {
            const interaction = createInteraction(
                'req_123',
                'What is your choice?',
                'Confirmation',
                'Yes, proceed',
                [{ id: 'att_1', name: 'file.ts', uri: 'file:///path/file.ts' }],
                'completed'
            );

            assert.strictEqual(interaction.id, 'req_123');
            assert.strictEqual(interaction.input.question, 'What is your choice?');
            assert.strictEqual(interaction.input.title, 'Confirmation');
            assert.strictEqual(interaction.output.response, 'Yes, proceed');
            assert.strictEqual(interaction.output.attachments.length, 1);
            assert.strictEqual(interaction.output.attachments[0].name, 'file.ts');
            assert.strictEqual(interaction.status, 'completed');
            assert.ok(interaction.timestamp > 0);
        });

        it('should create a cancelled interaction', () => {
            const interaction = createInteraction(
                'req_456',
                'Continue?',
                'Check',
                '',
                [],
                'cancelled'
            );

            assert.strictEqual(interaction.status, 'cancelled');
            assert.strictEqual(interaction.output.response, '');
            assert.strictEqual(interaction.output.attachments.length, 0);
        });

        it('should set timestamp to current time', () => {
            const before = Date.now();
            const interaction = createInteraction('req_789', 'Q', 'T', 'R', [], 'completed');
            const after = Date.now();

            assert.ok(interaction.timestamp >= before);
            assert.ok(interaction.timestamp <= after);
        });

        it('should create a copy of the attachments array', () => {
            const attachments = [{ id: 'a1', name: 'test.txt', uri: 'file:///test.txt' }];
            const interaction = createInteraction('req_001', 'Q', 'T', 'R', attachments, 'completed');

            // Adding to original array should not affect interaction
            attachments.push({ id: 'a2', name: 'extra.txt', uri: 'file:///extra.txt' });
            assert.strictEqual(interaction.output.attachments.length, 1);
        });
    });

    // ========================
    // trimInteractions
    // ========================
    describe('trimInteractions', () => {
        function createMockInteractions(count: number): ToolCallInteraction[] {
            return Array.from({ length: count }, (_, i) => ({
                id: `req_${i}`,
                timestamp: Date.now() - (count - i) * 1000, // Older items have lower timestamps
                input: { question: `Question ${i}`, title: `Title ${i}` },
                output: { response: `Response ${i}`, attachments: [] },
                status: 'completed' as const,
            }));
        }

        it('should not trim when under limit', () => {
            const interactions = createMockInteractions(10);
            const trimmed = trimInteractions(interactions);
            assert.strictEqual(trimmed.length, 10);
        });

        it('should not trim when exactly at limit', () => {
            const interactions = createMockInteractions(MAX_INTERACTIONS);
            const trimmed = trimInteractions(interactions);
            assert.strictEqual(trimmed.length, MAX_INTERACTIONS);
        });

        it('should trim to MAX_INTERACTIONS when over limit', () => {
            const interactions = createMockInteractions(75);
            const trimmed = trimInteractions(interactions);
            assert.strictEqual(trimmed.length, MAX_INTERACTIONS);
        });

        it('should keep the most recent interactions', () => {
            const interactions = createMockInteractions(60);
            const trimmed = trimInteractions(interactions);

            // Most recent should have highest timestamp
            assert.ok(trimmed[0].timestamp >= trimmed[1].timestamp);

            // The kept interactions should be the most recent ones
            assert.strictEqual(trimmed.length, MAX_INTERACTIONS);
        });

        it('should return empty array for empty input', () => {
            const trimmed = trimInteractions([]);
            assert.strictEqual(trimmed.length, 0);
        });

        it('should maintain descending timestamp order', () => {
            const interactions = createMockInteractions(100);
            const trimmed = trimInteractions(interactions);

            for (let i = 1; i < trimmed.length; i++) {
                assert.ok(
                    trimmed[i - 1].timestamp >= trimmed[i].timestamp,
                    `Expected ${trimmed[i - 1].timestamp} >= ${trimmed[i].timestamp} at index ${i}`
                );
            }
        });
    });

    // ========================
    // serializeInteractions
    // ========================
    describe('serializeInteractions', () => {
        it('should serialize interactions to JSON string', () => {
            const interactions: ToolCallInteraction[] = [
                createInteraction('req_1', 'Q1', 'T1', 'R1', [], 'completed'),
            ];
            const json = serializeInteractions(interactions);
            assert.ok(typeof json === 'string');

            const parsed = JSON.parse(json);
            assert.strictEqual(parsed.length, 1);
            assert.strictEqual(parsed[0].id, 'req_1');
        });

        it('should produce formatted JSON', () => {
            const interactions: ToolCallInteraction[] = [
                createInteraction('req_1', 'Q', 'T', 'R', [], 'completed'),
            ];
            const json = serializeInteractions(interactions);
            // JSON.stringify with indent 2 produces newlines
            assert.ok(json.includes('\n'));
        });

        it('should serialize empty array', () => {
            const json = serializeInteractions([]);
            assert.strictEqual(json, '[]');
        });
    });

    // ========================
    // deserializeInteractions
    // ========================
    describe('deserializeInteractions', () => {
        it('should deserialize valid JSON', () => {
            const interactions = [
                createInteraction('req_1', 'Q1', 'T1', 'R1', [], 'completed'),
                createInteraction('req_2', 'Q2', 'T2', 'R2', [], 'cancelled'),
            ];
            const json = serializeInteractions(interactions);
            const result = deserializeInteractions(json);

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, 'req_1');
            assert.strictEqual(result[1].id, 'req_2');
        });

        it('should return empty array for invalid JSON', () => {
            const result = deserializeInteractions('not valid json');
            assert.strictEqual(result.length, 0);
        });

        it('should return empty array for non-array JSON', () => {
            const result = deserializeInteractions('{"key": "value"}');
            assert.strictEqual(result.length, 0);
        });

        it('should return empty array for empty string', () => {
            const result = deserializeInteractions('');
            assert.strictEqual(result.length, 0);
        });

        it('should roundtrip correctly', () => {
            const original = [
                createInteraction('req_abc', 'Hello?', 'Greeting', 'Hi!', [], 'completed'),
            ];
            const json = serializeInteractions(original);
            const restored = deserializeInteractions(json);

            assert.strictEqual(restored[0].id, original[0].id);
            assert.strictEqual(restored[0].input.question, original[0].input.question);
            assert.strictEqual(restored[0].output.response, original[0].output.response);
            assert.strictEqual(restored[0].status, original[0].status);
        });
    });
});
