/**
 * Regression tests: zod/v3 subpath compatibility with MCP SDK schema conversion.
 *
 * History: The MCP CLI bundle (dist/seamless-agent-mcp.js) was failing at runtime
 * with "Cannot find module 'zod/v3'" because zod was marked as external in esbuild,
 * but the standalone CLI has no node_modules alongside it.
 *
 * Fix: esbuild CLI bundle now bundles zod (only 'vscode' is external).
 * The CLI also uses `require('zod/v3')` (not `require('zod')`) so the MCP SDK
 * routes schema conversion through zod-to-json-schema instead of z4mini.toJSONSchema,
 * preventing a bundled-duplicate-core conflict.
 *
 * These tests prevent future regressions in either the subpath resolution or
 * the MCP SDK schema detection logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);

describe('zod/v3 subpath resolution', () => {
    it('zod/v3 subpath resolves without MODULE_NOT_FOUND error', () => {
        // This was failing before the esbuild external-list fix.
        // Regression guard: zod package must export the ./v3 subpath with a CJS target.
        let z: typeof import('zod/v3').z;
        assert.doesNotThrow(() => {
            ({ z } = nodeRequire('zod/v3'));
        }, 'require("zod/v3") must not throw MODULE_NOT_FOUND');
        assert.ok(z!, 'z must be defined after require("zod/v3")');
    });

    it('zod/v3 provides the core schema-builder API', () => {
        const { z } = nodeRequire('zod/v3') as typeof import('zod/v3');
        assert.strictEqual(typeof z.object, 'function', 'z.object must be a function');
        assert.strictEqual(typeof z.string, 'function', 'z.string must be a function');
        assert.strictEqual(typeof z.boolean, 'function', 'z.boolean must be a function');
        assert.strictEqual(typeof z.array, 'function', 'z.array must be a function');
        assert.strictEqual(typeof z.union, 'function', 'z.union must be a function');
        assert.strictEqual(typeof z.enum, 'function', 'z.enum must be a function');
    });
});

describe('zod/v3 MCP SDK schema detection', () => {
    it('zod/v3 schemas do NOT have _zod marker (isZ4Schema returns false)', () => {
        // The MCP SDK uses `isZ4Schema(s) = !!s._zod` to branch between:
        //   - zod v4 path: calls z4mini.toJSONSchema() — requires duplicate-free zod core
        //   - zod v3 path: calls zod-to-json-schema — safe in a bundled standalone binary
        //
        // If this test fails, it means zod/v3 was swapped to return a v4 schema object,
        // which would break schema conversion in the bundled MCP CLI.
        const { z } = nodeRequire('zod/v3') as typeof import('zod/v3');
        const schema = z.object({ question: z.string() });
        assert.ok(
            !('_zod' in schema),
            'zod/v3 schema must NOT have _zod property — MCP SDK must route through zod-to-json-schema'
        );
    });

    it('zod/v4 schemas DO have _zod marker (baseline sanity check)', () => {
        // Confirm the main zod export IS v4, so the subpath distinction is real.
        const { z: zV4 } = nodeRequire('zod') as typeof import('zod');
        const schema = zV4.object({ x: zV4.string() });
        assert.ok('_zod' in schema, 'zod v4 schema must have _zod property');
    });
});

describe('zod/v3 schema validation', () => {
    it('validates a valid input correctly', () => {
        const { z } = nodeRequire('zod/v3') as typeof import('zod/v3');
        const schema = z.object({
            question: z.string(),
            title: z.string().optional(),
            agentName: z.string().optional(),
        });
        const result = schema.safeParse({ question: 'Hello?', agentName: 'TestAgent' });
        assert.ok(result.success, 'safeParse must succeed for valid input');
        assert.strictEqual(result.data?.question, 'Hello?');
        assert.strictEqual(result.data?.agentName, 'TestAgent');
        assert.strictEqual(result.data?.title, undefined);
    });

    it('rejects invalid input', () => {
        const { z } = nodeRequire('zod/v3') as typeof import('zod/v3');
        const schema = z.object({ question: z.string() });
        const result = schema.safeParse({ question: 42 });
        assert.ok(!result.success, 'safeParse must fail for wrong type');
    });

    it('handles union schemas (used in ask_user options)', () => {
        const { z } = nodeRequire('zod/v3') as typeof import('zod/v3');
        const optionSchema = z.union([
            z.string(),
            z.object({ label: z.string(), description: z.string().optional() }),
        ]);
        const schema = z.object({ options: z.array(optionSchema).optional() });

        const result = schema.safeParse({
            options: ['Yes', { label: 'No', description: 'Decline' }],
        });
        assert.ok(result.success, 'union schema with array must validate correctly');
    });
});
