/**
 * Unit Tests for Zod Schemas and Validation Helpers
 *
 * Tests all input schemas (AskUser, ApprovePlan, PlanReview, WalkthroughReview),
 * type derivations, parse functions, and the safeParseInput helper.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    AskUserInputSchema,
    ApprovePlanInputSchema,
    PlanReviewInputSchema,
    WalkthroughReviewInputSchema,
    parseAskUserInput,
    parseApprovePlanInput,
    parsePlanReviewInput,
    parseWalkthroughReviewInput,
    safeParseInput,
} from './schemas';

// ================================
// AskUserInputSchema Tests
// ================================
describe('AskUserInputSchema', () => {
    it('should accept a minimal valid input', () => {
        const result = AskUserInputSchema.safeParse({ question: 'Continue?' });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.question, 'Continue?');
            assert.strictEqual(result.data.title, undefined);
            assert.strictEqual(result.data.agentName, undefined);
            assert.strictEqual(result.data.options, undefined);
            assert.strictEqual(result.data.multiSelect, undefined);
        }
    });

    it('should accept full valid input with all optional fields', () => {
        const input = {
            question: 'Which framework?',
            title: 'Framework Selection',
            agentName: 'Main Orchestrator',
            options: ['Express', 'Koa', 'Fastify'],
            multiSelect: true,
        };
        const result = AskUserInputSchema.safeParse(input);
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.question, 'Which framework?');
            assert.strictEqual(result.data.title, 'Framework Selection');
            assert.strictEqual(result.data.agentName, 'Main Orchestrator');
            assert.strictEqual(result.data.multiSelect, true);
            assert.ok(Array.isArray(result.data.options));
        }
    });

    it('should reject empty question', () => {
        const result = AskUserInputSchema.safeParse({ question: '' });
        assert.strictEqual(result.success, false);
    });

    it('should reject missing question', () => {
        const result = AskUserInputSchema.safeParse({});
        assert.strictEqual(result.success, false);
    });

    it('should accept options as array of strings', () => {
        const result = AskUserInputSchema.safeParse({
            question: 'Pick one',
            options: ['Yes', 'No', 'Maybe'],
        });
        assert.strictEqual(result.success, true);
    });

    it('should accept options as array of {label, description} objects', () => {
        const result = AskUserInputSchema.safeParse({
            question: 'Pick one',
            options: [
                { label: 'Yes', description: 'Confirm the action' },
                { label: 'No' },
            ],
        });
        assert.strictEqual(result.success, true);
    });

    it('should accept options as array of mixed strings and objects', () => {
        const result = AskUserInputSchema.safeParse({
            question: 'Pick one',
            options: [
                'Simple',
                { label: 'Complex', description: 'Detailed option' },
            ],
        });
        assert.strictEqual(result.success, true);
    });

    it('should accept grouped options', () => {
        const result = AskUserInputSchema.safeParse({
            question: 'Pick framework and language',
            options: [
                {
                    title: 'Framework',
                    options: ['Express', 'Koa'],
                    multiSelect: false,
                },
                {
                    title: 'Language',
                    options: [{ label: 'TypeScript' }, { label: 'JavaScript' }],
                    multiSelect: true,
                },
            ],
        });
        assert.strictEqual(result.success, true);
    });

    it('should reject grouped options with empty options array', () => {
        const result = AskUserInputSchema.safeParse({
            question: 'Pick one',
            options: [
                { title: 'Group', options: [] },
            ],
        });
        assert.strictEqual(result.success, false);
    });

    it('should reject non-string question', () => {
        const result = AskUserInputSchema.safeParse({ question: 123 });
        assert.strictEqual(result.success, false);
    });
});

// ================================
// ApprovePlanInputSchema Tests
// ================================
describe('ApprovePlanInputSchema', () => {
    it('should accept a valid plan', () => {
        const result = ApprovePlanInputSchema.safeParse({
            plan: '## Step 1\nDo something\n## Step 2\nDo another thing',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.ok(result.data.plan.includes('Step 1'));
            assert.strictEqual(result.data.title, undefined);
        }
    });

    it('should accept plan with optional title', () => {
        const result = ApprovePlanInputSchema.safeParse({
            plan: '# My Plan',
            title: 'Deploy Plan',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.title, 'Deploy Plan');
        }
    });

    it('should reject empty plan', () => {
        const result = ApprovePlanInputSchema.safeParse({ plan: '' });
        assert.strictEqual(result.success, false);
    });

    it('should reject missing plan', () => {
        const result = ApprovePlanInputSchema.safeParse({});
        assert.strictEqual(result.success, false);
    });
});

// ================================
// PlanReviewInputSchema Tests
// ================================
describe('PlanReviewInputSchema', () => {
    it('should accept minimal valid input', () => {
        const result = PlanReviewInputSchema.safeParse({
            plan: '# Plan\nSome content',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.mode, 'review'); // default
            assert.strictEqual(result.data.title, undefined);
            assert.strictEqual(result.data.chatId, undefined);
        }
    });

    it('should accept review mode explicitly', () => {
        const result = PlanReviewInputSchema.safeParse({
            plan: '# Plan',
            mode: 'review',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.mode, 'review');
        }
    });

    it('should accept walkthrough mode', () => {
        const result = PlanReviewInputSchema.safeParse({
            plan: '# Steps',
            mode: 'walkthrough',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.mode, 'walkthrough');
        }
    });

    it('should reject invalid mode', () => {
        const result = PlanReviewInputSchema.safeParse({
            plan: '# Plan',
            mode: 'invalid_mode',
        });
        assert.strictEqual(result.success, false);
    });

    it('should accept full input with all fields', () => {
        const result = PlanReviewInputSchema.safeParse({
            plan: '# Plan\n- Step 1\n- Step 2',
            title: 'Deployment Plan',
            mode: 'review',
            chatId: 'chat_123',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.title, 'Deployment Plan');
            assert.strictEqual(result.data.chatId, 'chat_123');
        }
    });

    it('should reject empty plan', () => {
        const result = PlanReviewInputSchema.safeParse({ plan: '' });
        assert.strictEqual(result.success, false);
    });
});

// ================================
// WalkthroughReviewInputSchema Tests
// ================================
describe('WalkthroughReviewInputSchema', () => {
    it('should accept valid walkthrough input', () => {
        const result = WalkthroughReviewInputSchema.safeParse({
            plan: '# Walkthrough\n1. Step one\n2. Step two',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.title, undefined);
            assert.strictEqual(result.data.chatId, undefined);
        }
    });

    it('should accept optional title and chatId', () => {
        const result = WalkthroughReviewInputSchema.safeParse({
            plan: '# Steps',
            title: 'Getting Started',
            chatId: 'session_abc',
        });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.title, 'Getting Started');
            assert.strictEqual(result.data.chatId, 'session_abc');
        }
    });

    it('should reject empty plan', () => {
        const result = WalkthroughReviewInputSchema.safeParse({ plan: '' });
        assert.strictEqual(result.success, false);
    });

    it('should reject missing plan', () => {
        const result = WalkthroughReviewInputSchema.safeParse({});
        assert.strictEqual(result.success, false);
    });
});

// ================================
// Parse Function Tests
// ================================
describe('parseAskUserInput', () => {
    it('should return parsed data for valid input', () => {
        const data = parseAskUserInput({ question: 'Proceed?' });
        assert.strictEqual(data.question, 'Proceed?');
    });

    it('should throw for invalid input', () => {
        assert.throws(() => parseAskUserInput({}));
    });

    it('should throw for empty question', () => {
        assert.throws(() => parseAskUserInput({ question: '' }));
    });
});

describe('parseApprovePlanInput', () => {
    it('should return parsed data for valid input', () => {
        const data = parseApprovePlanInput({ plan: '# Plan' });
        assert.strictEqual(data.plan, '# Plan');
    });

    it('should throw for invalid input', () => {
        assert.throws(() => parseApprovePlanInput({}));
    });
});

describe('parsePlanReviewInput', () => {
    it('should return parsed data with defaults', () => {
        const data = parsePlanReviewInput({ plan: '# Plan' });
        assert.strictEqual(data.plan, '# Plan');
        assert.strictEqual(data.mode, 'review');
    });

    it('should throw for invalid input', () => {
        assert.throws(() => parsePlanReviewInput({}));
    });
});

describe('parseWalkthroughReviewInput', () => {
    it('should return parsed data for valid input', () => {
        const data = parseWalkthroughReviewInput({ plan: '# Steps' });
        assert.strictEqual(data.plan, '# Steps');
    });

    it('should throw for invalid input', () => {
        assert.throws(() => parseWalkthroughReviewInput({}));
    });
});

// ================================
// safeParseInput Tests
// ================================
describe('safeParseInput', () => {
    it('should return success with data for valid input', () => {
        const result = safeParseInput(AskUserInputSchema, { question: 'Hello?' });
        assert.strictEqual(result.success, true);
        if (result.success) {
            assert.strictEqual(result.data.question, 'Hello?');
        }
    });

    it('should return failure with error message for invalid input', () => {
        const result = safeParseInput(AskUserInputSchema, {});
        assert.strictEqual(result.success, false);
        if (!result.success) {
            assert.ok(result.error.length > 0);
            assert.ok(typeof result.error === 'string');
        }
    });

    it('should return descriptive error for wrong type', () => {
        const result = safeParseInput(AskUserInputSchema, { question: 42 });
        assert.strictEqual(result.success, false);
        if (!result.success) {
            assert.ok(result.error.includes('question'));
        }
    });

    it('should work with PlanReviewInputSchema', () => {
        const result = safeParseInput(PlanReviewInputSchema, { plan: '# Content', mode: 'review' });
        assert.strictEqual(result.success, true);
    });

    it('should fail with helpful error for PlanReview invalid mode', () => {
        const result = safeParseInput(PlanReviewInputSchema, { plan: '# X', mode: 'broken' });
        assert.strictEqual(result.success, false);
    });
});
