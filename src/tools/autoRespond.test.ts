import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Auto-Pilot Core Logic Tests ─────────────────────────────────
// We replicate the pure logic of AutoRespondManager._nextResponse()
// to test the response queue behavior without VS Code dependencies.

interface AutoPilotState {
    responses: string[];
    currentIndex: number;
    exhaustedBehavior: 'loop' | 'stop' | 'repeatLast';
    enabled: boolean;
}

/**
 * Pure function replicating the auto-respond queue logic.
 * Returns [nextResponse, updatedState].
 */
function nextResponse(state: AutoPilotState): [string | null, AutoPilotState] {
    const s = { ...state };
    if (s.responses.length === 0) return [null, s];

    if (s.currentIndex < s.responses.length) {
        const response = s.responses[s.currentIndex];
        s.currentIndex++;
        return [response, s];
    }

    // Queue exhausted
    switch (s.exhaustedBehavior) {
        case 'loop':
            s.currentIndex = 1;
            return [s.responses[0], s];
        case 'repeatLast':
            return [s.responses[s.responses.length - 1], s];
        case 'stop':
            s.enabled = false;
            return [null, s];
    }
}

describe('Auto-Pilot Queue Logic', () => {
    it('should return responses in order', () => {
        let state: AutoPilotState = {
            responses: ['first', 'second', 'third'],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        let result: string | null;
        [result, state] = nextResponse(state);
        assert.equal(result, 'first');
        assert.equal(state.currentIndex, 1);

        [result, state] = nextResponse(state);
        assert.equal(result, 'second');
        assert.equal(state.currentIndex, 2);

        [result, state] = nextResponse(state);
        assert.equal(result, 'third');
        assert.equal(state.currentIndex, 3);
    });

    it('should loop back to start after exhaustion', () => {
        let state: AutoPilotState = {
            responses: ['a', 'b'],
            currentIndex: 2,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        let result: string | null;
        [result, state] = nextResponse(state);
        assert.equal(result, 'a');
        assert.equal(state.currentIndex, 1);

        [result, state] = nextResponse(state);
        assert.equal(result, 'b');
        assert.equal(state.currentIndex, 2);
    });

    it('should repeat last response when exhausted with repeatLast', () => {
        let state: AutoPilotState = {
            responses: ['x', 'y'],
            currentIndex: 2,
            exhaustedBehavior: 'repeatLast',
            enabled: true,
        };

        let result: string | null;
        [result, state] = nextResponse(state);
        assert.equal(result, 'y');
        assert.equal(state.enabled, true);

        // Should keep repeating
        [result, state] = nextResponse(state);
        assert.equal(result, 'y');
    });

    it('should stop and return null when exhausted with stop', () => {
        let state: AutoPilotState = {
            responses: ['only-one'],
            currentIndex: 1,
            exhaustedBehavior: 'stop',
            enabled: true,
        };

        let result: string | null;
        [result, state] = nextResponse(state);
        assert.equal(result, null);
        assert.equal(state.enabled, false);
    });

    it('should return null for empty responses', () => {
        const state: AutoPilotState = {
            responses: [],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        const [result] = nextResponse(state);
        assert.equal(result, null);
    });

    it('should handle single response with loop', () => {
        let state: AutoPilotState = {
            responses: ['solo'],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        let result: string | null;
        // First call
        [result, state] = nextResponse(state);
        assert.equal(result, 'solo');
        assert.equal(state.currentIndex, 1);

        // Second call (loop)
        [result, state] = nextResponse(state);
        assert.equal(result, 'solo');
        assert.equal(state.currentIndex, 1);

        // Third call (loop again)
        [result, state] = nextResponse(state);
        assert.equal(result, 'solo');
    });

    it('should handle full cycle through multiple loops', () => {
        let state: AutoPilotState = {
            responses: ['a', 'b', 'c'],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        const results: string[] = [];
        for (let i = 0; i < 9; i++) {
            let result: string | null;
            [result, state] = nextResponse(state);
            if (result) results.push(result);
        }

        assert.deepEqual(results, ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c']);
    });
});

describe('Auto-Pilot Config Validation', () => {
    it('should not schedule when disabled', () => {
        const state: AutoPilotState = {
            responses: ['test'],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: false,
        };
        // isEnabled check: enabled && responses.length > 0
        const isEnabled = state.enabled && state.responses.length > 0;
        assert.equal(isEnabled, false);
    });

    it('should not schedule when no responses configured', () => {
        const state: AutoPilotState = {
            responses: [],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };
        const isEnabled = state.enabled && state.responses.length > 0;
        assert.equal(isEnabled, false);
    });

    it('should be enabled when both enabled and has responses', () => {
        const state: AutoPilotState = {
            responses: ['test'],
            currentIndex: 0,
            exhaustedBehavior: 'loop',
            enabled: true,
        };
        const isEnabled = state.enabled && state.responses.length > 0;
        assert.equal(isEnabled, true);
    });
});

describe('Auto-Pilot Response Management', () => {
    it('should add responses', () => {
        const responses: string[] = [];
        responses.push('first');
        responses.push('second');
        assert.deepEqual(responses, ['first', 'second']);
    });

    it('should remove responses by index', () => {
        const responses = ['a', 'b', 'c'];
        responses.splice(1, 1);
        assert.deepEqual(responses, ['a', 'c']);
    });

    it('should reorder responses', () => {
        const responses = ['a', 'b', 'c'];
        // Move index 2 to index 0
        const [item] = responses.splice(2, 1);
        responses.splice(0, 0, item);
        assert.deepEqual(responses, ['c', 'a', 'b']);
    });

    it('should reset index when responses change', () => {
        let state: AutoPilotState = {
            responses: ['a', 'b', 'c'],
            currentIndex: 2,
            exhaustedBehavior: 'loop',
            enabled: true,
        };

        // Simulate setResponses
        state = { ...state, responses: ['x', 'y'], currentIndex: 0 };
        const [result] = nextResponse(state);
        assert.equal(result, 'x');
    });

    it('should trim whitespace from responses', () => {
        const text = '  hello world  ';
        const trimmed = text.trim();
        assert.equal(trimmed, 'hello world');
    });

    it('should reject empty responses', () => {
        const shouldAdd = (text: string) => text.trim().length > 0;
        assert.equal(shouldAdd('   '), false);
        assert.equal(shouldAdd(''), false);
        assert.equal(shouldAdd('valid'), true);
    });
});
