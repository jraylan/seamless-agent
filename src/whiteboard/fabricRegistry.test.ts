import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';

describe('whiteboard fabric browser registry', () => {
    it('keeps seeded object classes registered in the browser bundle', async () => {
        const { JSDOM } = require('jsdom') as {
            JSDOM: new (html?: string, options?: Record<string, unknown>) => {
                window: Window & { eval(code: string): void };
            };
        };

        const bundle = await esbuild.build({
            stdin: {
                contents: `
                    import { ensureWhiteboardFabricRegistry } from './src/whiteboard/fabricRegistry.ts';
                    import { classRegistry } from 'fabric';

                    ensureWhiteboardFabricRegistry();
                    const requiredTypes = ['rect', 'ellipse', 'triangle', 'line', 'path', 'i-text', 'image'];
                    globalThis.__whiteboardFabricRegistryResult = requiredTypes.map((type) => {
                        try {
                            classRegistry.getClass(type);
                            return [type, true];
                        } catch {
                            return [type, false];
                        }
                    });
                `,
                resolveDir: process.cwd(),
                sourcefile: 'whiteboard-fabric-registry-entry.ts',
                loader: 'ts',
            },
            bundle: true,
            format: 'iife',
            platform: 'browser',
            write: false,
        });

        const code = bundle.outputFiles[0]?.text;
        assert.ok(code, 'Expected esbuild to produce an in-memory bundle');

        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            pretendToBeVisual: true,
            runScripts: 'outside-only',
            url: 'https://example.test/',
        });

        dom.window.eval(code);
        const result = JSON.parse(JSON.stringify((dom.window as Window & {
            __whiteboardFabricRegistryResult?: Array<[string, boolean]>;
        }).__whiteboardFabricRegistryResult));

        assert.deepStrictEqual(result, [
            ['rect', true],
            ['ellipse', true],
            ['triangle', true],
            ['line', true],
            ['path', true],
            ['i-text', true],
            ['image', true],
        ]);
    });
});
