/**
 * Shared declarative predicate contracts for A2UI reactivity (Phase 2, Slice 1).
 *
 * Predicates are used by `visibleIf` and `enabledIf` on A2UIComponent entries.
 * They are validated at render time and serialized into `data-*` HTML attributes
 * for consumption by the webview runtime (implemented in the next slice).
 */

import { z } from 'zod';

/**
 * Predicate field references are exact lookups against the browser-side form state map,
 * which is keyed by rendered `data-field` / component ids.
 *
 * They are intentionally not JSON Pointer paths or `$data.*` bindings.
 */
const FieldReferenceSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// Leaf (field) predicate schemas
// ---------------------------------------------------------------------------

const FieldEqualsSchema = z.strictObject({
    field: FieldReferenceSchema,
    equals: z.unknown(),
});

const FieldNotEqualsSchema = z.strictObject({
    field: FieldReferenceSchema,
    notEquals: z.unknown(),
});

const FieldIsTruthySchema = z.strictObject({
    field: FieldReferenceSchema,
    isTruthy: z.literal(true),
});

const FieldIsFalsySchema = z.strictObject({
    field: FieldReferenceSchema,
    isFalsy: z.literal(true),
});

const FieldPredicateSchema = z.union([
    FieldEqualsSchema,
    FieldNotEqualsSchema,
    FieldIsTruthySchema,
    FieldIsFalsySchema,
]);

export type FieldEqualsPredicate = z.infer<typeof FieldEqualsSchema>;
export type FieldNotEqualsPredicate = z.infer<typeof FieldNotEqualsSchema>;
export type FieldIsTruthyPredicate = z.infer<typeof FieldIsTruthySchema>;
export type FieldIsFalsyPredicate = z.infer<typeof FieldIsFalsySchema>;
export type FieldPredicate = z.infer<typeof FieldPredicateSchema>;

// ---------------------------------------------------------------------------
// Combinator types (recursive)
// ---------------------------------------------------------------------------

export type AllPredicate = { all: A2UIPredicate[] };
export type AnyPredicate = { any: A2UIPredicate[] };

export type A2UIPredicate = FieldPredicate | AllPredicate | AnyPredicate;

// z.lazy is required for the recursive combinator references
const A2UIPredicateSchema: z.ZodType<A2UIPredicate> = z.lazy(() =>
    z.union([
        FieldPredicateSchema,
        z.strictObject({ all: z.array(A2UIPredicateSchema) }),
        z.strictObject({ any: z.array(A2UIPredicateSchema) }),
    ]),
);

export { A2UIPredicateSchema };

// ---------------------------------------------------------------------------
// Interactive component set (the only types that support enabledIf)
// ---------------------------------------------------------------------------

export const INTERACTIVE_COMPONENT_TYPES: ReadonlySet<string> = new Set([
    'Button',
    'TextField',
    'Checkbox',
    'Select',
]);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw value as an A2UIPredicate.
 * Throws a descriptive Error if the shape is invalid.
 */
export function parsePredicate(raw: unknown): A2UIPredicate {
    const result = A2UIPredicateSchema.safeParse(raw);
    if (!result.success) {
        throw new Error(`Invalid predicate shape: ${result.error.message}`);
    }
    return result.data;
}

/**
 * Serialize a validated predicate to a JSON string suitable for a data-* attribute.
 */
export function serializePredicate(predicate: A2UIPredicate): string {
    return JSON.stringify(predicate);
}

/**
 * Evaluate a predicate against a field state map.
 *
 * @param predicate - A validated A2UIPredicate (leaf or combinator).
 * @param fieldState - Current field values keyed by field id. Missing fields
 *                     resolve to `undefined` (falsy, not equal to any value).
 * @returns `true` if the predicate condition is satisfied, `false` otherwise.
 */
export function evaluatePredicate(
    predicate: A2UIPredicate,
    fieldState: Record<string, unknown>,
): boolean {
    if ('field' in predicate) {
        if ('all' in (predicate as Record<string, unknown>) || 'any' in (predicate as Record<string, unknown>)) {
            throw new Error('Invalid predicate shape: field predicates cannot also declare combinators.');
        }

        const conditionCount = Number('equals' in predicate)
            + Number('notEquals' in predicate)
            + Number('isTruthy' in predicate)
            + Number('isFalsy' in predicate);
        if (conditionCount !== 1) {
            throw new Error('Invalid predicate shape: field predicates must declare exactly one condition.');
        }

        const value = fieldState[(predicate as FieldPredicate).field];
        if ('equals' in predicate) return value === (predicate as FieldEqualsPredicate).equals;
        if ('notEquals' in predicate) return value !== (predicate as FieldNotEqualsPredicate).notEquals;
        if ('isTruthy' in predicate) return Boolean(value);
        if ('isFalsy' in predicate) return !value;

        throw new Error('Invalid predicate shape: unsupported field predicate condition.');
    }
    if ('all' in predicate) {
        if ('any' in (predicate as Record<string, unknown>)) {
            throw new Error('Invalid predicate shape: combinator predicates cannot declare both all and any.');
        }
        return (predicate as AllPredicate).all.every((p) => evaluatePredicate(p, fieldState));
    }
    if ('any' in predicate) {
        return (predicate as AnyPredicate).any.some((p) => evaluatePredicate(p, fieldState));
    }
    throw new Error('Invalid predicate shape: unsupported predicate.');
}
