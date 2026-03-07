import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
) as {
    contributes?: {
        languageModelTools?: Array<{
            name: string;
            tags?: string[];
            icon?: string;
            inputSchema?: {
                properties?: Record<string, unknown>;
            };
        }>;
    };
};

describe('package metadata', () => {
    it('registers open_whiteboard as a language model tool', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'open_whiteboard');

        assert.ok(tool, 'Expected open_whiteboard to be declared in package.json');
        assert.deepStrictEqual(tool.tags, [
            'whiteboard',
            'diagramming',
            'visual-context',
            'user-interaction',
            'seamless-agent'
        ]);
        assert.strictEqual(tool.icon, '$(symbol-color)');
        assert.ok(tool.inputSchema?.properties?.context, 'Expected context input schema');
        assert.ok(tool.inputSchema?.properties?.title, 'Expected title input schema');
        assert.ok(tool.inputSchema?.properties?.blankCanvas, 'Expected blankCanvas input schema');
        assert.ok(tool.inputSchema?.properties?.initialCanvases, 'Expected initialCanvases input schema');
    });
});
