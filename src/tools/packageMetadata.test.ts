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
            modelDescription?: string;
            inputSchema?: {
                properties?: Record<string, any>;
            };
        }>;
    };
};

describe('package metadata', () => {
    it('registers open_whiteboard as an image-first language model tool with optional starter canvases', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'open_whiteboard');

        assert.ok(tool, 'Expected open_whiteboard to be declared in package.json');
        assert.deepStrictEqual(tool.tags, [
            'whiteboard',
            'diagramming',
            'visual-context',
            'user-interaction',
            'seamless-agent',
        ]);
        assert.strictEqual(tool.icon, '$(symbol-color)');
        assert.ok(tool.inputSchema?.properties?.context, 'Expected context input schema');
        assert.ok(tool.inputSchema?.properties?.title, 'Expected title input schema');
        assert.ok(tool.inputSchema?.properties?.blankCanvas, 'Expected blankCanvas input schema');
        assert.ok(tool.inputSchema?.properties?.initialCanvases, 'Expected initialCanvases input schema');
        assert.ok(tool.inputSchema?.properties?.importImages, 'Expected importImages input schema');
    });

    it('describes the image-first whiteboard contract in package metadata', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'open_whiteboard');

        assert.ok(tool, 'Expected open_whiteboard to be declared in package.json');
        assert.match(tool?.modelDescription ?? '', /initialCanvases/);
        assert.match(tool?.modelDescription ?? '', /importImages/);
        assert.match(tool?.modelDescription ?? '', /image-first|PNG image URIs/i);
        assert.match(tool?.modelDescription ?? '', /seedElements/);
        assert.doesNotMatch(tool?.modelDescription ?? '', /scene summary|sceneSummary/i);
        assert.match(tool?.inputSchema?.properties?.blankCanvas?.description ?? '', /defaults? to true|blank canvas/i);
        assert.match(tool?.inputSchema?.properties?.initialCanvases?.description ?? '', /starter canvases|seedElements|fabricState/i);
        assert.ok(tool?.inputSchema?.properties?.initialCanvases?.items?.properties?.seedElements?.items, 'Expected seedElements array items schema');
        assert.match(tool?.inputSchema?.properties?.importImages?.description ?? '', /pre-load|annotate/i);
        assert.match(tool?.inputSchema?.properties?.importImages?.items?.properties?.uri?.description ?? '', /file uri/i);
    });

    it('registers render_ui as a language model tool', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'render_ui');

        assert.ok(tool, 'Expected render_ui to be declared in package.json');
        assert.ok(tool.tags?.includes('ui'), 'Expected ui tag');
        assert.ok(tool.tags?.includes('seamless-agent'), 'Expected seamless-agent tag');
        assert.ok(tool.inputSchema?.properties?.surfaceId, 'Expected surfaceId input schema');
        assert.ok(tool.inputSchema?.properties?.title, 'Expected title input schema');
        assert.ok(tool.inputSchema?.properties?.components, 'Expected components input schema');
        assert.ok(tool.inputSchema?.properties?.dataModel, 'Expected dataModel input schema');
        assert.ok(tool.inputSchema?.properties?.enableA2UI, 'Expected enableA2UI input schema');
        assert.ok(tool.inputSchema?.properties?.a2uiLevel, 'Expected a2uiLevel input schema');
        assert.ok(tool.inputSchema?.properties?.waitForAction, 'Expected waitForAction input schema');
    });

    it('declares all catalog component types in render_ui schema', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'render_ui');
        assert.ok(tool, 'Expected render_ui to be declared in package.json');

        const componentTypeEnum: string[] =
            tool.inputSchema?.properties?.components?.items?.properties?.component?.properties?.type?.enum ?? [];

        const expectedTypes = [
            'Row', 'Column', 'Card', 'Divider',
            'Text', 'Heading', 'Image', 'Markdown', 'CodeBlock',
            'Button', 'TextField', 'Checkbox', 'Select',
            'MermaidDiagram', 'ProgressBar', 'Badge',
        ];

        for (const t of expectedTypes) {
            assert.ok(componentTypeEnum.includes(t), `Expected ${t} in component type enum`);
        }
    });

    it('render_ui modelDescription mentions waitForAction and component types', () => {
        const tool = packageJson.contributes?.languageModelTools?.find((entry) => entry.name === 'render_ui');
        assert.ok(tool, 'Expected render_ui to be declared in package.json');
        assert.match(tool?.modelDescription ?? '', /waitForAction/);
        assert.match(tool?.modelDescription ?? '', /Button/);
        assert.match(tool?.modelDescription ?? '', /userAction/);
        assert.match(tool?.modelDescription ?? '', /surfaceId/);
        assert.match(tool?.modelDescription ?? '', /component\.props/);
        assert.match(tool?.modelDescription ?? '', /Markdown content is rendered/i);
        assert.match(tool?.modelDescription ?? '', /enableA2UI/);
        assert.match(tool?.modelDescription ?? '', /diagnostics and applied enhancements/i);
    });
});
