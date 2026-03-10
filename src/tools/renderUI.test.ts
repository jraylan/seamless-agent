import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(__filename);

// =====================================================
// Schema validation tests
// =====================================================

describe('render_ui schema', () => {
    it('defaults waitForAction to false', async () => {
        const { parseRenderUIInput } = await import('./schemas');
        const result = parseRenderUIInput({
            surfaceId: 'surf1',
            title: 'Sample surface',
            components: [
                {
                    id: 'c1',
                    component: { type: 'Text', props: { content: 'Hello' } },
                },
            ],
        });
        assert.strictEqual(result.waitForAction, false);
        assert.strictEqual(result.enableA2UI, false);
        assert.strictEqual(result.a2uiLevel, 'basic');
        assert.strictEqual(result.surfaceId, 'surf1');
    });

    it('accepts waitForAction: true', async () => {
        const { parseRenderUIInput } = await import('./schemas');
        const result = parseRenderUIInput({
            components: [
                {
                    id: 'c1',
                    component: { type: 'Button', props: { label: 'OK', action: 'ok' } },
                },
            ],
            waitForAction: true,
        });
        assert.strictEqual(result.waitForAction, true);
    });

    it('rejects missing components', async () => {
        const { RenderUIInputSchema, safeParseInput } = await import('./schemas');
        const result = safeParseInput(RenderUIInputSchema, {});
        assert.strictEqual(result.success, false);
    });

    it('accepts arbitrary component records in schema and leaves catalog validation to runtime', async () => {
        const { parseRenderUIInput } = await import('./schemas');
        const result = parseRenderUIInput({
            components: [
                {
                    id: 'c1',
                    component: {
                        type: 'Table',
                        columns: ['$data.columns'],
                    },
                },
            ],
        });
        assert.equal(result.components[0]?.component.type, 'Table');
    });

    it('preserves parentId adjacency entries', async () => {
        const { parseRenderUIInput } = await import('./schemas');
        const result = parseRenderUIInput({
            components: [
                {
                    id: 'row1',
                    component: { type: 'Row' },
                },
                {
                    id: 'text1',
                    parentId: 'row1',
                    component: { type: 'Text', props: { content: 'Child' } },
                },
            ],
        });
        assert.equal(result.components[1]?.parentId, 'row1');
    });

    it('rejects missing component payloads', async () => {
        const { RenderUIInputSchema, safeParseInput } = await import('./schemas');
        const result = safeParseInput(RenderUIInputSchema, {
            components: [
                {
                    id: 'c1',
                },
            ],
        });
        assert.strictEqual(result.success, false);
    });

    it('accepts a top-level dataModel', async () => {
        const { parseRenderUIInput } = await import('./schemas');
        const result = parseRenderUIInput({
            components: [
                {
                    id: 'c1',
                    component: { type: 'Text', props: { content: '$data.greeting' } },
                },
            ],
            dataModel: {
                greeting: 'Hello from data',
            },
        });
        assert.equal(result.dataModel?.greeting, 'Hello from data');
    });
});

// =====================================================
// Catalog tests
// =====================================================

describe('a2ui catalog', () => {
    it('allows all catalog types', async () => {
        const { isAllowedComponentType } = await import('../a2ui/catalog');
        const allowed = [
            'Row', 'Column', 'Card', 'Divider',
            'Text', 'Heading', 'Image', 'Markdown', 'CodeBlock',
            'Button', 'TextField', 'Checkbox', 'Select',
            'MermaidDiagram', 'ProgressBar', 'Badge',
        ];
        for (const type of allowed) {
            assert.ok(isAllowedComponentType(type), `Expected ${type} to be allowed`);
        }
    });

    it('rejects unsupported types', async () => {
        const { isAllowedComponentType } = await import('../a2ui/catalog');
        assert.strictEqual(isAllowedComponentType('Unknown'), false);
        assert.strictEqual(isAllowedComponentType('Table'), false);
        assert.strictEqual(isAllowedComponentType(''), false);
        assert.strictEqual(isAllowedComponentType('Grid'), false);
    });
});

// =====================================================
// Renderer tests
// =====================================================

describe('a2ui renderer', () => {
    it('renders a Text component', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Text', props: { content: 'Hello World' } } },
            ],
        });
        assert.ok(html.includes('Hello World'), 'Expected content to appear');
        assert.ok(html.includes('a2ui-text'), 'Expected class name');
    });

    it('renders component fields when props wrapper is omitted', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Text', content: 'Direct content' } },
            ],
        });
        assert.ok(html.includes('Direct content'), 'Expected direct component fields to be rendered');
    });

    it('renders Markdown as HTML instead of escaped source text', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Markdown', props: { content: '## Title\n\n**Bold** text' } } },
            ],
        });
        assert.ok(html.includes('<h2>Title</h2>'), 'Expected markdown heading output');
        assert.ok(html.includes('<strong>Bold</strong>'), 'Expected markdown emphasis output');
    });

    it('interpolates bindings embedded inside literal text', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Badge', props: { label: 'Owner: $data.owner' } } },
            ],
            dataModel: { owner: 'Platform Team' },
        });
        assert.ok(html.includes('Owner: Platform Team'), 'Expected embedded binding interpolation');
    });

    it('renders Mermaid components with a target container and collapsible source', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'diagram', component: { type: 'MermaidDiagram', props: { content: 'graph LR\nA-->B' } } },
            ],
        });
        assert.ok(html.includes('a2ui-mermaid-target'), 'Expected Mermaid render target');
        assert.ok(html.includes('a2ui-mermaid-details'), 'Expected Mermaid source details');
    });

    it('throws RendererError for unsupported component type', async () => {
        const { renderSurface, RendererError } = await import('../a2ui/renderer');
        assert.throws(
            () =>
                renderSurface({
                    surfaceId: 'surf1',
                    components: [
                        { id: 'c1', component: { type: 'Table', props: {} } },
                    ],
                }),
            (err: unknown) => {
                assert.ok(err instanceof RendererError, 'Expected RendererError');
                assert.match(err.message, /Unsupported component type/);
                return true;
            },
        );
    });

    it('resolves $data.path bindings', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Text', props: { content: '$data.greeting' } } },
            ],
            dataModel: { greeting: 'Hello from data' },
        });
        assert.ok(html.includes('Hello from data'), 'Expected resolved value');
        assert.ok(!html.includes('$data.greeting'), 'Should not contain unresolved binding');
    });

    it('resolves nested $data.path bindings', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Heading', props: { content: '$data.user.name', level: 2 } } },
            ],
            dataModel: { user: { name: 'Alice' } },
        });
        assert.ok(html.includes('Alice'), 'Expected nested resolved value');
    });

    it('renders nested layout components', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'row1', component: { type: 'Row' } },
                { id: 'text1', parentId: 'row1', component: { type: 'Text', props: { content: 'First' } } },
                { id: 'text2', parentId: 'row1', component: { type: 'Text', props: { content: 'Second' } } },
            ],
        });
        assert.ok(html.includes('a2ui-row'), 'Expected row class');
        assert.ok(html.includes('First'), 'Expected first child');
        assert.ok(html.includes('Second'), 'Expected second child');
    });

    it('renders a Button component with action', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'btn1', component: { type: 'Button', props: { label: 'Submit', action: 'submit' } } },
            ],
        });
        assert.ok(html.includes('a2ui-button'), 'Expected button class');
        assert.ok(html.includes('Submit'), 'Expected label');
        assert.ok(html.includes('data-action="submit"'), 'Expected action attribute');
    });

    it('renders visible labels for text fields and selects', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'name', component: { type: 'TextField', props: { label: 'Name', placeholder: 'Enter your name' } } },
                {
                    id: 'color',
                    component: {
                        type: 'Select',
                        props: {
                            label: 'Favorite Color',
                            value: 'blue',
                            options: [
                                { label: 'Red', value: 'red' },
                                { label: 'Blue', value: 'blue' },
                            ],
                        },
                    },
                },
            ],
        });
        assert.ok(html.includes('a2ui-field-label'), 'Expected visible field labels');
        assert.ok(html.includes('Name'), 'Expected text field label');
        assert.ok(html.includes('Favorite Color'), 'Expected select label');
        assert.ok(html.includes('option value="blue" selected'), 'Expected selected object option value');
    });

    it('renders helper text and required state for form controls', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                {
                    id: 'name',
                    component: {
                        type: 'TextField',
                        props: {
                            label: 'Approver',
                            required: true,
                            helperText: 'Required field',
                            ariaLabel: 'Approver name',
                        },
                    },
                },
            ],
        });
        assert.ok(html.includes('a2ui-required'), 'Expected required marker');
        assert.ok(html.includes('Required field'), 'Expected helper text');
        assert.ok(html.includes('aria-label="Approver name"'), 'Expected aria-label');
    });

    it('renders progress labels and values', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'progress', component: { type: 'ProgressBar', props: { label: 'Completion', value: 72, max: 100 } } },
            ],
        });
        assert.ok(html.includes('Completion'), 'Expected progress label');
        assert.ok(html.includes('72%'), 'Expected progress percentage');
    });

    it('renders a Card with nested children', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'card1', component: { type: 'Card' } },
                { id: 'txt1', parentId: 'card1', component: { type: 'Text', props: { content: 'Card content' } } },
            ],
        });
        assert.ok(html.includes('a2ui-card'), 'Expected card class');
        assert.ok(html.includes('Card content'), 'Expected nested content');
    });

    it('escapes HTML in text content', async () => {
        const { renderSurface } = await import('../a2ui/renderer');
        const html = renderSurface({
            surfaceId: 'surf1',
            components: [
                { id: 'c1', component: { type: 'Text', props: { content: '<script>alert(1)</script>' } } },
            ],
        });
        assert.ok(!html.includes('<script>'), 'Expected script tags to be escaped');
        assert.ok(html.includes('&lt;script&gt;'), 'Expected escaped HTML');
    });
});

// =====================================================
// renderUI tool function tests
// =====================================================

describe('render_ui tool', () => {
    it('returns A2UI diagnostics and injects a cancel safeguard when enabled', async () => {
        const { renderUI } = await import('./renderUI');
        const observedSurfaces: Array<Record<string, unknown>> = [];
        const mockPanel = {
            showSurface: async (_uri: unknown, surface: unknown, _wait: boolean) => {
                observedSurfaces.push(surface as Record<string, unknown>);
                return { dismissed: false };
            },
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                surfaceId: 'surf_a2ui',
                enableA2UI: true,
                a2uiLevel: 'strict',
                components: [
                    { id: 'row1', component: { type: 'Row' } },
                    { id: 'delete_btn', parentId: 'row1', component: { type: 'Button', props: { label: 'Delete', action: 'delete_record', variant: 'danger' } } },
                ],
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.strictEqual(result.rendered, true);
        assert.ok(result.a2ui, 'Expected A2UI diagnostics');
        assert.equal(result.a2ui?.level, 'strict');
        assert.ok((result.a2ui?.issues.length ?? 0) > 0, 'Expected A2UI issues');
        assert.ok(result.a2ui?.appliedEnhancements.some((entry) => entry.includes('cancel safeguard')));

        const renderedComponents = observedSurfaces[0]?.components as Array<{ id: string }> | undefined;
        assert.ok(renderedComponents?.some((entry) => entry.id === 'auto_cancel_delete_btn'), 'Expected injected cancel button');
    });

    it('reports action orientation findings when fields have no action button', async () => {
        const { renderUI } = await import('./renderUI');
        const mockPanel = {
            showSurface: async () => ({ dismissed: false }),
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };

        const result = await renderUI(
            {
                surfaceId: 'surf_fields_only',
                enableA2UI: true,
                components: [
                    { id: 'name', component: { type: 'TextField', props: { label: 'Name' } } },
                ],
            },
            { extensionUri: { fsPath: '/test' } } as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.ok(result.a2ui?.issues.some((issue) => issue.principle === 'action_orientation'));
    });

    it('returns immediate success when waitForAction=false', async () => {
        const { renderUI } = await import('./renderUI');
        const mockPanel = {
            showSurface: async (_uri: unknown, _surface: unknown, _wait: boolean) => ({ dismissed: false }),
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                surfaceId: 'surf1',
                components: [
                    { id: 'c1', component: { type: 'Text', props: { content: 'test' } } },
                ],
                waitForAction: false,
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.strictEqual(result.surfaceId, 'surf1');
        assert.strictEqual(result.rendered, true);
        assert.strictEqual(result.userAction, undefined);
        assert.strictEqual(result.a2ui, undefined);
    });

    it('returns userAction when waitForAction=true and user acts', async () => {
        const { renderUI } = await import('./renderUI');
        const mockPanel = {
            showSurface: async (_uri: unknown, _surface: unknown, _wait: boolean) => ({
                dismissed: false,
                userAction: { name: 'submit', data: { value: 'hello' } },
            }),
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                surfaceId: 'surf1',
                components: [
                    { id: 'c1', component: { type: 'Button', props: { label: 'Submit', action: 'submit' } } },
                ],
                waitForAction: true,
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.strictEqual(result.surfaceId, 'surf1');
        assert.strictEqual(result.rendered, true);
        assert.deepStrictEqual(result.userAction, { name: 'submit', data: { value: 'hello' } });
    });

    it('returns rendered: false when cancelled', async () => {
        const { renderUI } = await import('./renderUI');
        const mockToken = {
            isCancellationRequested: true,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                surfaceId: 'surf1',
                components: [
                    { id: 'c1', component: { type: 'Text', props: { content: 'test' } } },
                ],
                waitForAction: false,
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
        );

        assert.strictEqual(result.rendered, false);
        assert.strictEqual(result.surfaceId, 'surf1');
    });

    it('closes a waiting surface when cancellation happens after rendering starts', async () => {
        const { renderUI } = await import('./renderUI');
        let cancellationHandler: (() => void) | undefined;
        let resolveSurface: ((value: { dismissed: boolean }) => void) | undefined;
        const closedSurfaceIds: string[] = [];
        const mockPanel = {
            showSurface: async () => new Promise<{ dismissed: boolean }>((resolve) => {
                resolveSurface = resolve;
            }),
            closeIfOpen(surfaceId: string) {
                closedSurfaceIds.push(surfaceId);
                resolveSurface?.({ dismissed: true });
                return true;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested(callback: () => void) {
                cancellationHandler = callback;
                return {
                    dispose() {
                        if (cancellationHandler === callback) {
                            cancellationHandler = undefined;
                        }
                    },
                };
            },
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const pendingResult = renderUI(
            {
                surfaceId: 'surf_cancel',
                components: [
                    { id: 'c1', component: { type: 'Button', props: { label: 'Wait', action: 'wait' } } },
                ],
                waitForAction: true,
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        cancellationHandler?.();

        const result = await Promise.race([
            pendingResult,
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
        ]);

        assert.notEqual(result, 'timeout', 'expected renderUI to settle after cancellation');
        assert.deepStrictEqual(closedSurfaceIds, ['surf_cancel']);
        assert.deepStrictEqual(result, {
            surfaceId: 'surf_cancel',
            rendered: false,
        });
    });

    it('generates and returns a surfaceId when one is omitted', async () => {
        const { renderUI } = await import('./renderUI');
        const observedSurfaces: unknown[] = [];
        const mockPanel = {
            showSurface: async (_uri: unknown, surface: unknown, _wait: boolean) => {
                observedSurfaces.push(surface);
                return { dismissed: false };
            },
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                title: 'Generated id surface',
                components: [
                    { id: 'c1', component: { type: 'Text', props: { content: 'test' } } },
                ],
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.match(result.surfaceId, /^surface_/);
        assert.deepStrictEqual(observedSurfaces, [
            {
                surfaceId: result.surfaceId,
                title: 'Generated id surface',
                components: [
                    { id: 'c1', component: { type: 'Text', props: { content: 'test' } } },
                ],
            },
        ]);
    });

    it('omits userAction field when dismissed without action', async () => {
        const { renderUI } = await import('./renderUI');
        const mockPanel = {
            showSurface: async (_uri: unknown, _surface: unknown, _wait: boolean) => ({ dismissed: true }),
            closeIfOpen() {
                return false;
            },
        };
        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => { } }),
        };
        const mockContext = { extensionUri: { fsPath: '/test' } };

        const result = await renderUI(
            {
                surfaceId: 'surf1',
                components: [
                    { id: 'c1', component: { type: 'Text' } },
                ],
                waitForAction: true,
            },
            mockContext as unknown as import('vscode').ExtensionContext,
            {} as unknown as import('../webview/webviewProvider').AgentInteractionProvider,
            mockToken as unknown as import('vscode').CancellationToken,
            { panel: mockPanel },
        );

        assert.strictEqual(result.rendered, true);
        assert.strictEqual(result.userAction, undefined);
    });
});
