import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('A2UI Reactivity – parsePredicate', () => {
    it('accepts a valid field equals predicate', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({ field: 'myField', equals: 'hello' });
        assert.deepStrictEqual(pred, { field: 'myField', equals: 'hello' });
    });

    it('accepts a valid field notEquals predicate', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({ field: 'status', notEquals: 'closed' });
        assert.deepStrictEqual(pred, { field: 'status', notEquals: 'closed' });
    });

    it('accepts a valid field isTruthy predicate', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({ field: 'approved', isTruthy: true });
        assert.deepStrictEqual(pred, { field: 'approved', isTruthy: true });
    });

    it('accepts a valid field isFalsy predicate', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({ field: 'loading', isFalsy: true });
        assert.deepStrictEqual(pred, { field: 'loading', isFalsy: true });
    });

    it('accepts an all combinator with nested predicates', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({
            all: [
                { field: 'a', isTruthy: true },
                { field: 'b', equals: 42 },
            ],
        });
        assert.deepStrictEqual(pred, {
            all: [
                { field: 'a', isTruthy: true },
                { field: 'b', equals: 42 },
            ],
        });
    });

    it('accepts an any combinator with nested predicates', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({
            any: [
                { field: 'x', isFalsy: true },
                { field: 'y', notEquals: null },
            ],
        });
        assert.deepStrictEqual(pred, {
            any: [
                { field: 'x', isFalsy: true },
                { field: 'y', notEquals: null },
            ],
        });
    });

    it('accepts deeply nested combinators', async () => {
        const { parsePredicate } = await import('./reactivity');
        const pred = parsePredicate({
            all: [
                { any: [{ field: 'a', isTruthy: true }, { field: 'b', isTruthy: true }] },
                { field: 'c', equals: 'done' },
            ],
        });
        assert.ok(pred);
    });

    it('throws on a completely invalid predicate shape', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ foo: 'bar' }),
            /Invalid predicate shape/i,
        );
    });

    it('throws when field key is missing from a leaf predicate', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ equals: 'hello' }),
            /Invalid predicate shape/i,
        );
    });

    it('throws on a non-object predicate value', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate('visibleIf'),
            /Invalid predicate shape/i,
        );
    });

    it('throws when isTruthy is not literal true', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ field: 'x', isTruthy: 1 }),
            /Invalid predicate shape/i,
        );
    });

    it('throws when isFalsy is not literal true', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ field: 'x', isFalsy: false }),
            /Invalid predicate shape/i,
        );
    });

    it('throws when an all combinator includes unexpected keys', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ all: [{ field: 'x', isTruthy: true }], extra: 'nope' }),
            /Invalid predicate shape/i,
        );
    });

    it('throws when an any combinator includes unexpected keys', async () => {
        const { parsePredicate } = await import('./reactivity');
        assert.throws(
            () => parsePredicate({ any: [{ field: 'x', isFalsy: true }], extra: 'nope' }),
            /Invalid predicate shape/i,
        );
    });
});

describe('A2UI Reactivity – serializePredicate', () => {
    it('serializes a leaf predicate to JSON', async () => {
        const { parsePredicate, serializePredicate } = await import('./reactivity');
        const pred = parsePredicate({ field: 'status', equals: 'active' });
        const json = serializePredicate(pred);
        assert.strictEqual(json, JSON.stringify({ field: 'status', equals: 'active' }));
    });

    it('serializes a combinator predicate to JSON', async () => {
        const { parsePredicate, serializePredicate } = await import('./reactivity');
        const raw = { all: [{ field: 'x', isTruthy: true }] };
        const pred = parsePredicate(raw);
        const json = serializePredicate(pred);
        assert.strictEqual(json, JSON.stringify(raw));
    });
});

describe('A2UI Reactivity – INTERACTIVE_COMPONENT_TYPES', () => {
    it('includes Button, TextField, Checkbox, Select', async () => {
        const { INTERACTIVE_COMPONENT_TYPES } = await import('./reactivity');
        assert.ok(INTERACTIVE_COMPONENT_TYPES.has('Button'));
        assert.ok(INTERACTIVE_COMPONENT_TYPES.has('TextField'));
        assert.ok(INTERACTIVE_COMPONENT_TYPES.has('Checkbox'));
        assert.ok(INTERACTIVE_COMPONENT_TYPES.has('Select'));
    });

    it('does not include non-interactive types', async () => {
        const { INTERACTIVE_COMPONENT_TYPES } = await import('./reactivity');
        assert.ok(!INTERACTIVE_COMPONENT_TYPES.has('Text'));
        assert.ok(!INTERACTIVE_COMPONENT_TYPES.has('Row'));
        assert.ok(!INTERACTIVE_COMPONENT_TYPES.has('Badge'));
    });
});
