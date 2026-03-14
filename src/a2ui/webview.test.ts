/**
 * Tests for A2UI webview browser-side reactivity logic (Phase 2, Slice 2).
 *
 * Pure helpers are tested without any browser runtime.
 * DOM-dependent helpers are tested with jsdom.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// evaluatePredicate – pure tests (no DOM)
// ---------------------------------------------------------------------------

describe('evaluatePredicate', () => {
    it('evaluates equals – matching value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'status', equals: 'active' }, { status: 'active' }), true);
    });

    it('evaluates equals – non-matching value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'status', equals: 'active' }, { status: 'closed' }), false);
    });

    it('evaluates equals – field absent (undefined) does not equal a value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'x', equals: 'y' }, {}), false);
    });

    it('evaluates notEquals – non-matching value (returns true)', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'status', notEquals: 'closed' }, { status: 'open' }), true);
    });

    it('evaluates notEquals – matching value (returns false)', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'status', notEquals: 'closed' }, { status: 'closed' }), false);
    });

    it('evaluates isTruthy – truthy value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'approved', isTruthy: true }, { approved: true }), true);
        assert.strictEqual(evaluatePredicate({ field: 'name', isTruthy: true }, { name: 'Alice' }), true);
    });

    it('evaluates isTruthy – falsy value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'approved', isTruthy: true }, { approved: false }), false);
        assert.strictEqual(evaluatePredicate({ field: 'name', isTruthy: true }, { name: '' }), false);
    });

    it('evaluates isTruthy – absent field is falsy', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'absent', isTruthy: true }, {}), false);
    });

    it('evaluates isFalsy – falsy value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'loading', isFalsy: true }, { loading: false }), true);
        assert.strictEqual(evaluatePredicate({ field: 'msg', isFalsy: true }, { msg: '' }), true);
    });

    it('evaluates isFalsy – truthy value', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ field: 'loading', isFalsy: true }, { loading: true }), false);
    });

    it('evaluates all – all true', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const result = evaluatePredicate(
            { all: [{ field: 'a', isTruthy: true }, { field: 'b', equals: 1 }] },
            { a: true, b: 1 },
        );
        assert.strictEqual(result, true);
    });

    it('evaluates all – one false makes all false', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const result = evaluatePredicate(
            { all: [{ field: 'a', isTruthy: true }, { field: 'b', equals: 1 }] },
            { a: true, b: 2 },
        );
        assert.strictEqual(result, false);
    });

    it('evaluates any – at least one true', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const result = evaluatePredicate(
            { any: [{ field: 'a', isTruthy: true }, { field: 'b', equals: 1 }] },
            { a: false, b: 1 },
        );
        assert.strictEqual(result, true);
    });

    it('evaluates any – none true', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const result = evaluatePredicate(
            { any: [{ field: 'a', isTruthy: true }, { field: 'b', equals: 1 }] },
            { a: false, b: 2 },
        );
        assert.strictEqual(result, false);
    });

    it('evaluates deeply nested combinators', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const result = evaluatePredicate(
            { all: [{ any: [{ field: 'a', isTruthy: true }, { field: 'b', isTruthy: true }] }, { field: 'c', equals: 'go' }] },
            { a: false, b: true, c: 'go' },
        );
        assert.strictEqual(result, true);
    });

    it('empty all combinator returns true', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ all: [] }, {}), true);
    });

    it('empty any combinator returns false', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        assert.strictEqual(evaluatePredicate({ any: [] }, {}), false);
    });

    it('throws on malformed field predicates with multiple conditions', async () => {
        const { evaluatePredicate } = await import('./reactivity');
        const malformed = { field: 'status', equals: 'active', notEquals: 'closed' } as unknown as Parameters<typeof evaluatePredicate>[0];
        assert.throws(() => evaluatePredicate(malformed, { status: 'active' }), /exactly one condition/);
    });
});

// ---------------------------------------------------------------------------
// DOM helpers – helpers tested with jsdom
// ---------------------------------------------------------------------------

function makeDoc(html: string): Document {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
    return dom.window.document;
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
function escAttr(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

describe('collectAllFieldState', () => {
    it('collects text input values', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<input data-field="name" value="Alice" />');
        assert.deepStrictEqual(collectAllFieldState(doc), { name: 'Alice' });
    });

    it('collects checkbox values as booleans', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<input type="checkbox" data-field="accepted" checked />');
        assert.deepStrictEqual(collectAllFieldState(doc), { accepted: true });
    });

    it('collects unchecked checkbox as false', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<input type="checkbox" data-field="accepted" />');
        assert.deepStrictEqual(collectAllFieldState(doc), { accepted: false });
    });

    it('collects select values', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<select data-field="role"><option value="admin" selected>Admin</option><option value="user">User</option></select>');
        assert.deepStrictEqual(collectAllFieldState(doc), { role: 'admin' });
    });

    it('includes hidden fields (for reactivity evaluation)', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<div data-reactive-hidden><input data-field="secret" value="hidden-val" /></div>');
        const state = collectAllFieldState(doc);
        assert.strictEqual(state['secret'], 'hidden-val');
    });

    it('includes disabled fields (for reactivity evaluation)', async () => {
        const { collectAllFieldState } = await import('./webview');
        const doc = makeDoc('<input data-field="disabledField" value="still-here" disabled />');
        const state = collectAllFieldState(doc);
        assert.strictEqual(state['disabledField'], 'still-here');
    });
});

describe('collectSubmittableFormData', () => {
    it('collects normal fields', async () => {
        const { collectSubmittableFormData } = await import('./webview');
        const doc = makeDoc('<input data-field="name" value="Bob" />');
        assert.deepStrictEqual(collectSubmittableFormData(doc), { name: 'Bob' });
    });

    it('excludes fields inside a hidden component root', async () => {
        const { collectSubmittableFormData } = await import('./webview');
        const doc = makeDoc('<div data-reactive-hidden><input data-field="hidden" value="x" /></div><input data-field="visible" value="y" />');
        const data = collectSubmittableFormData(doc);
        assert.strictEqual('hidden' in data, false);
        assert.strictEqual(data['visible'], 'y');
    });

    it('excludes disabled fields', async () => {
        const { collectSubmittableFormData } = await import('./webview');
        const doc = makeDoc('<input data-field="active" value="yes" /><input data-field="locked" value="no" disabled />');
        const data = collectSubmittableFormData(doc);
        assert.strictEqual(data['active'], 'yes');
        assert.strictEqual('locked' in data, false);
    });

    it('includes fields that are inside a non-hidden component root', async () => {
        const { collectSubmittableFormData } = await import('./webview');
        const doc = makeDoc('<div><input data-field="present" value="here" /></div>');
        assert.deepStrictEqual(collectSubmittableFormData(doc), { present: 'here' });
    });
});

describe('validateRequiredFields', () => {
    it('returns true when all visible required fields are filled', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc('<label class="a2ui-field"><input data-field="x" required value="filled" /></label>');
        assert.strictEqual(validateRequiredFields(doc), true);
    });

    it('returns false when a visible required field is empty', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc('<label class="a2ui-field"><input data-field="x" required value="" /></label>');
        assert.strictEqual(validateRequiredFields(doc), false);
    });

    it('skips hidden required fields (does not block submission)', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc(
            '<div data-reactive-hidden><label class="a2ui-field"><input data-field="hiddenRequired" required value="" /></label></div>',
        );
        assert.strictEqual(validateRequiredFields(doc), true);
    });

    it('skips disabled required fields', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc('<label class="a2ui-field"><input data-field="d" required value="" disabled /></label>');
        assert.strictEqual(validateRequiredFields(doc), true);
    });

    it('returns false when a required checkbox is unchecked', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc('<label class="a2ui-checkbox-label"><input type="checkbox" data-field="agree" required /></label>');
        assert.strictEqual(validateRequiredFields(doc), false);
    });

    it('skips hidden required checkbox', async () => {
        const { validateRequiredFields } = await import('./webview');
        const doc = makeDoc(
            '<div data-reactive-hidden><label class="a2ui-checkbox-label"><input type="checkbox" data-field="agree" required /></label></div>',
        );
        assert.strictEqual(validateRequiredFields(doc), true);
    });
});

describe('applyReactivity', () => {
    it('hides a component when visibleIf evaluates to false', async () => {
        const { applyReactivity } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'show', isTruthy: true }));
        const doc = makeDoc(
            `<div id="comp1" data-visible-if="${predicate}"><input data-field="dep" value="nope" /></div>` +
            `<input data-field="show" value="" />`,
        );
        applyReactivity(doc);
        const comp = doc.getElementById('comp1') as HTMLElement;
        assert.strictEqual(comp.hidden, true);
        assert.ok(comp.hasAttribute('data-reactive-hidden'));
    });

    it('shows a component when visibleIf evaluates to true', async () => {
        const { applyReactivity } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'show', isTruthy: true }));
        const doc = makeDoc(
            `<div id="comp1" data-visible-if="${predicate}"><input data-field="dep" value="yes" /></div>` +
            `<input data-field="show" value="yes" />`,
        );
        applyReactivity(doc);
        const comp = doc.getElementById('comp1') as HTMLElement;
        assert.strictEqual(comp.hidden, false);
        assert.ok(!comp.hasAttribute('data-reactive-hidden'));
    });

    it('disables an interactive element when enabledIf evaluates to false', async () => {
        const { applyReactivity } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'canSubmit', equals: 'yes' }));
        const doc = makeDoc(
            `<button id="btn1" class="a2ui-button" data-action="submit" data-enabled-if="${predicate}">Go</button>` +
            `<input data-field="canSubmit" value="no" />`,
        );
        applyReactivity(doc);
        const btn = doc.getElementById('btn1') as HTMLButtonElement;
        assert.strictEqual(btn.disabled, true);
    });

    it('enables an interactive element when enabledIf evaluates to true', async () => {
        const { applyReactivity } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'canSubmit', equals: 'yes' }));
        const doc = makeDoc(
            `<button id="btn1" class="a2ui-button" data-action="submit" data-enabled-if="${predicate}">Go</button>` +
            `<input data-field="canSubmit" value="yes" />`,
        );
        applyReactivity(doc);
        const btn = doc.getElementById('btn1') as HTMLButtonElement;
        assert.strictEqual(btn.disabled, false);
    });

    it('disables input inside a label when enabledIf evaluates to false', async () => {
        const { applyReactivity } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'toggle', isTruthy: true }));
        const doc = makeDoc(
            `<label id="tf1" data-enabled-if="${predicate}"><input data-field="tf1" value="hello" /></label>` +
            `<input data-field="toggle" value="" />`,
        );
        applyReactivity(doc);
        const input = doc.querySelector('[data-field="tf1"]') as HTMLInputElement;
        assert.strictEqual(input.disabled, true);
    });

    it('reports malformed data-visible-if attributes as webview issues', async () => {
        const { applyReactivity } = await import('./webview');
        const doc = makeDoc('<div id="bad" data-visible-if="not-valid-json"></div>');
        const originalError = console.error;
        const errors: unknown[][] = [];
        console.error = (...args: unknown[]) => {
            errors.push(args);
        };

        try {
            const issues = applyReactivity(doc);
            assert.strictEqual(issues.length, 1);
            assert.strictEqual(issues[0]?.source, 'webview');
            assert.strictEqual(issues[0]?.componentId, 'bad');
            assert.match(issues[0]?.message ?? '', /Invalid data-visible-if predicate/);
            assert.strictEqual(doc.getElementById('bad')?.getAttribute('data-visible-if-error'), issues[0]?.message);
            assert.strictEqual(errors.length, 1);
        } finally {
            console.error = originalError;
        }
    });

    it('reports malformed data-enabled-if attributes as webview issues', async () => {
        const { applyReactivity } = await import('./webview');
        const doc = makeDoc('<button id="bad" class="a2ui-button" data-action="go" data-enabled-if="not-valid-json">Go</button>');
        const originalError = console.error;
        const errors: unknown[][] = [];
        console.error = (...args: unknown[]) => {
            errors.push(args);
        };

        try {
            const issues = applyReactivity(doc);
            assert.strictEqual(issues.length, 1);
            assert.strictEqual(issues[0]?.source, 'webview');
            assert.strictEqual(issues[0]?.componentId, 'bad');
            assert.match(issues[0]?.message ?? '', /Invalid data-enabled-if predicate/);
            assert.strictEqual(doc.getElementById('bad')?.getAttribute('data-enabled-if-error'), issues[0]?.message);
            assert.strictEqual(errors.length, 1);
        } finally {
            console.error = originalError;
        }
    });
});

describe('attachActionHandlers', () => {
    it('re-runs reactivity on input events from data-field elements', async () => {
        const { applyReactivity, attachActionHandlers } = await import('./webview');
        const predicate = escAttr(JSON.stringify({ field: 'canSubmit', equals: 'yes' }));
        const doc = makeDoc(
            `<input data-field="canSubmit" value="no" />` +
            `<button id="btn1" class="a2ui-button" data-action="submit" data-enabled-if="${predicate}">Go</button>`,
        );
        const button = doc.getElementById('btn1') as HTMLButtonElement;
        const field = doc.querySelector('[data-field="canSubmit"]') as HTMLInputElement;
        const view = doc.defaultView;
        assert.ok(view);

        applyReactivity(doc);
        assert.strictEqual(button.disabled, true);

        attachActionHandlers(doc, { postMessage: () => undefined });
        field.value = 'yes';
        field.dispatchEvent(new view.Event('input', { bubbles: true }));

        assert.strictEqual(button.disabled, false);
    });

    it('posts only submittable field data on button click', async () => {
        const { applyReactivity, attachActionHandlers } = await import('./webview');
        const visibleIf = escAttr(JSON.stringify({ field: 'showHidden', isTruthy: true }));
        const doc = makeDoc(
            `<input data-field="name" value="Alice" />` +
            `<input data-field="locked" value="skip-me" disabled />` +
            `<input data-field="showHidden" value="" />` +
            `<div id="hidden-group" data-visible-if="${visibleIf}"><input data-field="secret" value="hidden" /></div>` +
            `<button id="submit" class="a2ui-button" data-action="submit">Submit</button>`,
        );
        const messages: unknown[] = [];
        const view = doc.defaultView;
        assert.ok(view);

        applyReactivity(doc);
        attachActionHandlers(doc, {
            postMessage: (message) => {
                messages.push(message);
            },
        });

        const button = doc.getElementById('submit') as HTMLButtonElement;
        button.dispatchEvent(new view.MouseEvent('click', { bubbles: true }));

        assert.deepStrictEqual(messages, [{
            type: 'userAction',
            name: 'submit',
            data: {
                name: 'Alice',
                showHidden: '',
            },
        }]);
    });
});
