import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper: build a minimal A2UISurface for a single component
function surface(
    type: string,
    extraProps: Record<string, unknown> = {},
    entryExtras: Record<string, unknown> = {},
) {
    return {
        components: [
            {
                id: 'c1',
                component: { type, props: extraProps },
                ...entryExtras,
            },
        ],
    };
}

describe('A2UI Renderer – visibleIf metadata', () => {
    it('emits data-visible-if on a Text component', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface(
                'Text',
                { content: 'Hello' },
                { visibleIf: { field: 'showText', isTruthy: true } },
            ),
        );
        assert.ok(
            html.includes('data-visible-if='),
            `Expected data-visible-if attribute. Got: ${html}`,
        );
        // The attribute value is HTML-escaped JSON; the field name value has no special chars
        assert.ok(
            html.includes('showText'),
            `Expected field name value in attribute. Got: ${html}`,
        );
    });

    it('emits data-visible-if on a Button component', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface(
                'Button',
                { label: 'OK', action: 'submit' },
                { visibleIf: { field: 'ready', equals: true } },
            ),
        );
        assert.ok(html.includes('data-visible-if='), `Got: ${html}`);
    });

    it('emits data-visible-if with a combinator predicate', async () => {
        const { renderSurface } = await import('./renderer');
        const predicate = { all: [{ field: 'a', isTruthy: true }, { field: 'b', equals: 'yes' }] };
        const html = renderSurface(
            surface('Badge', { label: 'Active' }, { visibleIf: predicate }),
        );
        assert.ok(html.includes('data-visible-if='), `Got: ${html}`);
        // "all" is a JSON key, HTML-escaped as &quot;all&quot; in the attribute value
        assert.ok(html.includes('&quot;all&quot;'), `Got: ${html}`);
    });

    it('does NOT emit data-visible-if when visibleIf is absent', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(surface('Text', { content: 'Hi' }));
        assert.ok(!html.includes('data-visible-if'), `Unexpected attribute. Got: ${html}`);
    });
});

describe('A2UI Renderer – enabledIf metadata', () => {
    const interactiveTypes = [
        { type: 'Button', props: { label: 'OK', action: 'submit' } },
        { type: 'TextField', props: { label: 'Name' } },
        { type: 'Checkbox', props: { label: 'Agree' } },
        { type: 'Select', props: { label: 'Pick one', options: ['A', 'B'] } },
    ];

    for (const { type, props } of interactiveTypes) {
        it(`emits data-enabled-if on ${type}`, async () => {
            const { renderSurface } = await import('./renderer');
            const html = renderSurface(
                surface(type, props, { enabledIf: { field: 'active', isTruthy: true } }),
            );
            assert.ok(
                html.includes('data-enabled-if='),
                `Expected data-enabled-if on ${type}. Got: ${html}`,
            );
        });
    }

    it('does NOT emit data-enabled-if when enabledIf is absent', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(surface('Button', { label: 'OK', action: 'go' }));
        assert.ok(!html.includes('data-enabled-if'), `Unexpected attribute. Got: ${html}`);
    });

    it('throws RendererError when enabledIf is used on Text (non-interactive)', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Text', { content: 'Hi' }, { enabledIf: { field: 'x', isTruthy: true } }),
            ),
            (err: unknown) => err instanceof RendererError && /enabledIf/i.test(err.message),
        );
    });

    it('throws RendererError when enabledIf is used on Row (non-interactive)', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Row', {}, { enabledIf: { field: 'x', isFalsy: true } }),
            ),
            (err: unknown) => err instanceof RendererError && /enabledIf/i.test(err.message),
        );
    });

    it('throws RendererError when enabledIf is used on Badge (non-interactive)', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Badge', { label: 'Tag' }, { enabledIf: { field: 'y', equals: 1 } }),
            ),
            (err: unknown) => err instanceof RendererError && /enabledIf/i.test(err.message),
        );
    });
});

describe('A2UI Renderer – invalid predicate shapes', () => {
    it('throws RendererError for invalid visibleIf shape', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Text', { content: 'Hi' }, { visibleIf: { bad: 'shape' } }),
            ),
            (err: unknown) => err instanceof RendererError && /predicate/i.test(err.message),
        );
    });

    it('throws RendererError for invalid enabledIf shape on interactive component', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Button', { label: 'Go', action: 'go' }, { enabledIf: 'notAnObject' }),
            ),
            (err: unknown) => err instanceof RendererError && /predicate/i.test(err.message),
        );
    });

    it('throws RendererError for visibleIf with missing field key', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface(
                surface('Heading', { text: 'Title' }, { visibleIf: { equals: 'foo' } }),
            ),
            (err: unknown) => err instanceof RendererError && /predicate/i.test(err.message),
        );
    });
});

describe('A2UI Renderer – backward compatibility', () => {
    it('renders Text without predicates unchanged', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(surface('Text', { content: 'Hello world' }));
        assert.ok(html.includes('Hello world'), `Got: ${html}`);
        assert.ok(!html.includes('data-visible-if'), `Got: ${html}`);
        assert.ok(!html.includes('data-enabled-if'), `Got: ${html}`);
    });

    it('renders Button without predicates unchanged', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(surface('Button', { label: 'Click me', action: 'click' }));
        assert.ok(html.includes('data-action="click"'), `Got: ${html}`);
        assert.ok(!html.includes('data-visible-if'), `Got: ${html}`);
        assert.ok(!html.includes('data-enabled-if'), `Got: ${html}`);
    });

    it('renders a nested surface without predicates unchanged', async () => {
        const { renderSurface } = await import('./renderer');
        const result = renderSurface({
            components: [
                { id: 'row1', component: { type: 'Row' } },
                {
                    id: 'btn1',
                    parentId: 'row1',
                    component: { type: 'Button', props: { label: 'OK', action: 'ok' } },
                },
            ],
        });
        assert.ok(result.includes('a2ui-row'), `Got: ${result}`);
        assert.ok(result.includes('a2ui-button'), `Got: ${result}`);
        assert.ok(!result.includes('data-visible-if'), `Got: ${result}`);
    });
});

describe('A2UI Renderer – CSS flexibility (Phase 1)', () => {
    it('Column should NOT have flex: 1 in CSS class', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'col1', component: { type: 'Column', props: {} } },
                {
                    id: 'text1',
                    parentId: 'col1',
                    component: { type: 'Text', props: { content: 'Hello' } },
                },
            ],
        });

        // Verify the column is rendered
        assert.ok(html.includes('a2ui-column'), `Expected a2ui-column class. Got: ${html}`);

        // Read the CSS file and verify flex: 1 is NOT present
        const fs = await import('fs/promises');
        const cssPath = './media/a2ui.css';
        const cssContent = await fs.readFile(cssPath, 'utf-8');

        // Check that .a2ui-column does NOT contain flex: 1
        const columnCssMatch = cssContent.match(/\.a2ui-column\s*{([^}]+)}/);
        assert.ok(columnCssMatch, `Could not find .a2ui-column in CSS`);

        const columnCss = columnCssMatch[1];
        assert.ok(
            !columnCss.includes('flex: 1') && !columnCss.includes('flex:1'),
            `.a2ui-column should NOT contain 'flex: 1' to allow natural sizing. Found: ${columnCss}`
        );
    });

    it('Multiple columns in Row should not be forced to equal widths', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'row1', component: { type: 'Row', props: {} } },
                {
                    id: 'col1',
                    parentId: 'row1',
                    component: { type: 'Column', props: {} },
                },
                {
                    id: 'text1',
                    parentId: 'col1',
                    component: { type: 'Text', props: { content: 'Short' } },
                },
                {
                    id: 'col2',
                    parentId: 'row1',
                    component: { type: 'Column', props: {} },
                },
                {
                    id: 'text2',
                    parentId: 'col2',
                    component: { type: 'Text', props: { content: 'Much longer text content here' } },
                },
            ],
        });

        // Verify both columns are rendered
        assert.ok(html.includes('a2ui-column'), `Expected a2ui-column classes. Got: ${html}`);
        assert.ok(html.includes('Short'), `Expected 'Short' text. Got: ${html}`);
        assert.ok(html.includes('Much longer text content here'), `Expected long text. Got: ${html}`);
    });
});

describe('A2UI Renderer – Width/Height Props (Phase 2)', () => {
    it('Row should render with inline width style when width prop is provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'row1', component: { type: 'Row', props: { width: '500px' } } },
                {
                    id: 'text1',
                    parentId: 'row1',
                    component: { type: 'Text', props: { content: 'Hello' } },
                },
            ],
        });

        // Verify the row is rendered
        assert.ok(html.includes('a2ui-row'), `Expected a2ui-row class. Got: ${html}`);

        // Verify inline style with width is present
        assert.ok(
            html.includes('style="') && html.includes('width: 500px'),
            `Expected inline style with width: 500px. Got: ${html}`
        );
    });

    it('Column should render with inline height style when height prop is provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'col1', component: { type: 'Column', props: { height: '300px' } } },
                {
                    id: 'text1',
                    parentId: 'col1',
                    component: { type: 'Text', props: { content: 'Hello' } },
                },
            ],
        });

        // Verify the column is rendered
        assert.ok(html.includes('a2ui-column'), `Expected a2ui-column class. Got: ${html}`);

        // Verify inline style with height is present
        assert.ok(
            html.includes('style="') && html.includes('height: 300px'),
            `Expected inline style with height: 300px. Got: ${html}`
        );
    });

    it('Card should render with inline width and height styles when both props are provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'card1',
                    component: { type: 'Card', props: { width: '400px', height: '200px' } },
                },
                {
                    id: 'text1',
                    parentId: 'card1',
                    component: { type: 'Text', props: { content: 'Card content' } },
                },
            ],
        });

        // Verify the card is rendered
        assert.ok(html.includes('a2ui-card'), `Expected a2ui-card class. Got: ${html}`);

        // Verify inline styles with width and height are present
        assert.ok(
            html.includes('style="') && html.includes('width: 400px') && html.includes('height: 200px'),
            `Expected inline style with width: 400px and height: 200px. Got: ${html}`
        );
    });

    it('Row should not render inline style when width prop is not provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'row1', component: { type: 'Row', props: {} } },
                {
                    id: 'text1',
                    parentId: 'row1',
                    component: { type: 'Text', props: { content: 'Hello' } },
                },
            ],
        });

        // Verify the row is rendered
        assert.ok(html.includes('a2ui-row'), `Expected a2ui-row class. Got: ${html}`);

        // Verify no inline style is present (or if present, doesn't have width)
        const rowMatch = html.match(/<div class="a2ui-row" id="[^"]*"([^>]*)>/);
        assert.ok(rowMatch, `Could not find Row element. Got: ${html}`);

        const attrs = rowMatch[1];
        assert.ok(
            !attrs.includes('style='),
            `Expected no inline style when width prop is absent. Found: ${attrs}`
        );
    });

    it('Column should render with percentage width', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                { id: 'col1', component: { type: 'Column', props: { width: '50%' } } },
                {
                    id: 'text1',
                    parentId: 'col1',
                    component: { type: 'Text', props: { content: 'Half width' } },
                },
            ],
        });

        // Verify the column is rendered
        assert.ok(html.includes('a2ui-column'), `Expected a2ui-column class. Got: ${html}`);

        // Verify inline style with percentage width is present
        assert.ok(
            html.includes('style="') && html.includes('width: 50%'),
            `Expected inline style with width: 50%. Got: ${html}`
        );
    });
});

describe('A2UI Renderer – Table Component (Phase 3.1)', () => {
    it('should render Table with data and columns props', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'table1',
                    component: {
                        type: 'Table',
                        props: {
                            data: [
                                { name: 'Alice', age: '30' },
                                { name: 'Bob', age: '25' },
                            ],
                            columns: [
                                { key: 'name', label: 'Name' },
                                { key: 'age', label: 'Age' },
                            ],
                        },
                    },
                },
            ],
        });

        // Verify the table is rendered
        assert.ok(html.includes('a2ui-table'), `Expected a2ui-table class. Got: ${html}`);

        // Verify table structure
        assert.ok(html.includes('<table'), `Expected <table> element. Got: ${html}`);
        assert.ok(html.includes('<thead>'), `Expected <thead>. Got: ${html}`);
        assert.ok(html.includes('<tbody>'), `Expected <tbody>. Got: ${html}`);
        assert.ok(html.includes('<tr>'), `Expected <tr> elements. Got: ${html}`);

        // Verify headers
        assert.ok(html.includes('Name'), `Expected 'Name' header. Got: ${html}`);
        assert.ok(html.includes('Age'), `Expected 'Age' header. Got: ${html}`);

        // Verify data rows
        assert.ok(html.includes('Alice'), `Expected 'Alice' data. Got: ${html}`);
        assert.ok(html.includes('Bob'), `Expected 'Bob' data. Got: ${html}`);
        assert.ok(html.includes('30'), `Expected '30' data. Got: ${html}`);
        assert.ok(html.includes('25'), `Expected '25' data. Got: ${html}`);
    });

    it('should render empty Table when data array is empty', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'table1',
                    component: {
                        type: 'Table',
                        props: {
                            data: [],
                            columns: [
                                { key: 'name', label: 'Name' },
                                { key: 'age', label: 'Age' },
                            ],
                        },
                    },
                },
            ],
        });

        // Verify the table is rendered
        assert.ok(html.includes('a2ui-table'), `Expected a2ui-table class. Got: ${html}`);

        // Verify headers are still present
        assert.ok(html.includes('Name'), `Expected 'Name' header. Got: ${html}`);
        assert.ok(html.includes('Age'), `Expected 'Age' header. Got: ${html}`);
    });
});

describe('A2UI Renderer – Tabs Component (Phase 3.2)', () => {
    it('should render Tabs with tabs prop and activeTab', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'tabs1',
                    component: {
                        type: 'Tabs',
                        props: {
                            tabs: [
                                { id: 'tab1', label: 'First Tab' },
                                { id: 'tab2', label: 'Second Tab' },
                                { id: 'tab3', label: 'Third Tab' },
                            ],
                            activeTab: 'tab2',
                        },
                    },
                },
            ],
        });

        // Verify the tabs container is rendered
        assert.ok(html.includes('a2ui-tabs'), `Expected a2ui-tabs class. Got: ${html}`);

        // Verify tab buttons are rendered
        assert.ok(html.includes('a2ui-tab-button'), `Expected a2ui-tab-button class. Got: ${html}`);
        assert.ok(html.includes('First Tab'), `Expected 'First Tab' label. Got: ${html}`);
        assert.ok(html.includes('Second Tab'), `Expected 'Second Tab' label. Got: ${html}`);
        assert.ok(html.includes('Third Tab'), `Expected 'Third Tab' label. Got: ${html}`);

        // Verify active tab is marked
        assert.ok(html.includes('data-active-tab="tab2"'), `Expected data-active-tab attribute. Got: ${html}`);
    });

    it('should render Tabs with content panels for each tab', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'tabs1',
                    component: {
                        type: 'Tabs',
                        props: {
                            tabs: [
                                { id: 'tab1', label: 'Overview' },
                                { id: 'tab2', label: 'Details' },
                            ],
                            activeTab: 'tab1',
                        },
                    },
                },
                {
                    id: 'content-tab1',
                    parentId: 'tabs1',
                    component: {
                        type: 'Text',
                        props: { content: 'This is the overview content' },
                    },
                },
                {
                    id: 'content-tab2',
                    parentId: 'tabs1',
                    component: {
                        type: 'Text',
                        props: { content: 'This is the details content' },
                    },
                },
            ],
        });

        // Verify tab panels are rendered
        assert.ok(html.includes('a2ui-tab-panel'), `Expected a2ui-tab-panel class. Got: ${html}`);
        assert.ok(html.includes('This is the overview content'), `Expected overview content. Got: ${html}`);
        assert.ok(html.includes('This is the details content'), `Expected details content. Got: ${html}`);
    });
});

describe('A2UI Renderer – Toggle Component (Phase 3.3)', () => {
    it('should render Toggle with checked and label props', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'toggle1',
                    component: {
                        type: 'Toggle',
                        props: {
                            label: 'Enable Feature',
                            checked: true,
                        },
                    },
                },
            ],
        });

        // Verify the toggle is rendered
        assert.ok(html.includes('a2ui-toggle'), `Expected a2ui-toggle class. Got: ${html}`);

        // Verify label is rendered
        assert.ok(html.includes('Enable Feature'), `Expected 'Enable Feature' label. Got: ${html}`);

        // Verify checked state
        assert.ok(html.includes('checked'), `Expected checked attribute. Got: ${html}`);
    });

    it('should render Toggle with unchecked state', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'toggle1',
                    component: {
                        type: 'Toggle',
                        props: {
                            label: 'Dark Mode',
                            checked: false,
                        },
                    },
                },
            ],
        });

        // Verify the toggle is rendered
        assert.ok(html.includes('a2ui-toggle'), `Expected a2ui-toggle class. Got: ${html}`);

        // Verify label is rendered
        assert.ok(html.includes('Dark Mode'), `Expected 'Dark Mode' label. Got: ${html}`);

        // Verify unchecked state (no checked attribute)
        const toggleMatch = html.match(/<input type="checkbox"[^>]*>/);
        assert.ok(toggleMatch, `Expected checkbox input. Got: ${html}`);
        assert.ok(!toggleMatch[0].includes('checked'), `Expected no checked attribute. Got: ${toggleMatch[0]}`);
    });
});

describe('A2UI Renderer – Style Prop with Whitelist (Phase 4)', () => {
    it('should render allowed style properties', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'card1',
                    component: {
                        type: 'Card',
                        props: {
                            style: {
                                color: 'red',
                                backgroundColor: '#f0f0f0',
                                margin: '10px',
                                padding: '20px',
                                width: '300px',
                                height: '200px',
                                border: '1px solid black',
                                borderRadius: '8px',
                            },
                        },
                    },
                },
                {
                    id: 'text1',
                    parentId: 'card1',
                    component: { type: 'Text', props: { content: 'Styled Card' } },
                },
            ],
        });

        // Verify the card is rendered
        assert.ok(html.includes('a2ui-card'), `Expected a2ui-card class. Got: ${html}`);

        // Verify allowed styles are rendered
        assert.ok(html.includes('color: red'), `Expected 'color: red'. Got: ${html}`);
        assert.ok(html.includes('background-color: #f0f0f0'), `Expected 'background-color: #f0f0f0'. Got: ${html}`);
        assert.ok(html.includes('margin: 10px'), `Expected 'margin: 10px'. Got: ${html}`);
        assert.ok(html.includes('padding: 20px'), `Expected 'padding: 20px'. Got: ${html}`);
        assert.ok(html.includes('width: 300px'), `Expected 'width: 300px'. Got: ${html}`);
        assert.ok(html.includes('height: 200px'), `Expected 'height: 200px'. Got: ${html}`);
        assert.ok(html.includes('border: 1px solid black'), `Expected 'border: 1px solid black'. Got: ${html}`);
        assert.ok(html.includes('border-radius: 8px'), `Expected 'border-radius: 8px'. Got: ${html}`);
    });

    it('should reject dangerous style properties', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'card1',
                    component: {
                        type: 'Card',
                        props: {
                            style: {
                                position: 'absolute',
                                top: '0px',
                                left: '0px',
                                right: '0px',
                                bottom: '0px',
                                overflow: 'hidden',
                                zIndex: '9999',
                            },
                        },
                    },
                },
                {
                    id: 'text1',
                    parentId: 'card1',
                    component: { type: 'Text', props: { content: 'Dangerous Styles' } },
                },
            ],
        });

        // Verify the card is rendered
        assert.ok(html.includes('a2ui-card'), `Expected a2ui-card class. Got: ${html}`);

        // Verify dangerous styles are NOT rendered
        assert.ok(!html.includes('position: absolute'), `Should not include 'position: absolute'. Got: ${html}`);
        assert.ok(!html.includes('top: 0px'), `Should not include 'top: 0px'. Got: ${html}`);
        assert.ok(!html.includes('left: 0px'), `Should not include 'left: 0px'. Got: ${html}`);
        assert.ok(!html.includes('right: 0px'), `Should not include 'right: 0px'. Got: ${html}`);
        assert.ok(!html.includes('bottom: 0px'), `Should not include 'bottom: 0px'. Got: ${html}`);
        assert.ok(!html.includes('z-index: 9999'), `Should not include 'z-index: 9999'. Got: ${html}`);
    });

    it('should handle empty style object', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'card1',
                    component: {
                        type: 'Card',
                        props: {
                            style: {},
                        },
                    },
                },
                {
                    id: 'text1',
                    parentId: 'card1',
                    component: { type: 'Text', props: { content: 'No Styles' } },
                },
            ],
        });

        // Verify the card is rendered
        assert.ok(html.includes('a2ui-card'), `Expected a2ui-card class. Got: ${html}`);

        // Verify no inline style attribute is rendered
        const cardMatch = html.match(/<div class="a2ui-card" id="[^"]*"([^>]*)>/);
        assert.ok(cardMatch, `Could not find Card element. Got: ${html}`);

        const attrs = cardMatch[1];
        // Should not have style attribute, or if it does, it should be empty
        if (attrs.includes('style=')) {
            assert.ok(attrs.includes('style=""'), `Expected empty style attribute. Found: ${attrs}`);
        }
    });

    it('should mix style prop with width/height props', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'card1',
                    component: {
                        type: 'Card',
                        props: {
                            width: '400px',
                            height: '300px',
                            style: {
                                backgroundColor: 'blue',
                                padding: '10px',
                            },
                        },
                    },
                },
                {
                    id: 'text1',
                    parentId: 'card1',
                    component: { type: 'Text', props: { content: 'Mixed Styles' } },
                },
            ],
        });

        // Verify the card is rendered
        assert.ok(html.includes('a2ui-card'), `Expected a2ui-card class. Got: ${html}`);

        // Verify both props and style are rendered
        assert.ok(html.includes('width: 400px'), `Expected 'width: 400px'. Got: ${html}`);
        assert.ok(html.includes('height: 300px'), `Expected 'height: 300px'. Got: ${html}`);
        assert.ok(html.includes('background-color: blue'), `Expected 'background-color: blue'. Got: ${html}`);
        assert.ok(html.includes('padding: 10px'), `Expected 'padding: 10px'. Got: ${html}`);
    });
});

describe('A2UI Renderer – HTML Component (Phase 5)', () => {
    it('renders basic HTML content', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div class="test">Hello World</div>'
                    }
                }
            }]
        });
        assert.ok(html.includes('<div class="test">Hello World</div>'), `Expected HTML content. Got: ${html}`);
        assert.ok(html.includes('a2ui-html-container'), `Expected a2ui-html-container class. Got: ${html}`);
    });

    it('sanitizes dangerous HTML (script tags removed)', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div><script>alert("XSS")</script><p>Safe content</p></div>'
                    }
                }
            }]
        });
        assert.ok(!html.includes('<script>'), `Should not include script tag. Got: ${html}`);
        assert.ok(!html.includes('XSS'), `Should not include XSS content. Got: ${html}`);
        assert.ok(html.includes('Safe content'), `Expected safe content. Got: ${html}`);
    });

    it('injects CSS when provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div class="styled">Content</div>',
                        css: '.styled { color: red; }'
                    }
                }
            }]
        });
        assert.ok(html.includes('<style'), `Expected style tag. Got: ${html}`);
        assert.ok(html.includes('color: red'), `Expected CSS color. Got: ${html}`);
    });

    it('filters unsafe CSS properties', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div>Content</div>',
                        css: 'div { color: red; position: absolute; z-index: 9999; }'
                    }
                }
            }]
        });
        assert.ok(html.includes('color: red'), `Expected safe CSS. Got: ${html}`);
        assert.ok(!html.includes('position: absolute'), `Should not include position. Got: ${html}`);
        assert.ok(!html.includes('z-index'), `Should not include z-index. Got: ${html}`);
    });

    it('renders with sandbox when enabled', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div>Content</div>',
                        sandbox: true
                    }
                }
            }]
        });
        assert.ok(html.includes('<iframe'), `Expected iframe. Got: ${html}`);
        assert.ok(html.includes('sandbox='), `Expected sandbox attribute. Got: ${html}`);
        assert.ok(html.includes('srcdoc='), `Expected srcdoc attribute. Got: ${html}`);
    });

    it('throws RendererError when html is missing', async () => {
        const { renderSurface, RendererError } = await import('./renderer');
        assert.throws(
            () => renderSurface({
                components: [{
                    id: 'html1',
                    component: { type: 'HTML', props: {} }
                }]
            }),
            (err: unknown) => err instanceof RendererError
        );
    });

    it('handles malformed HTML gracefully', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div><p>Unclosed tags'
                    }
                }
            }]
        });
        // Should not throw, should render something
        assert.ok(html.includes('a2ui-html-container'), `Expected container. Got: ${html}`);
    });
});

// ── Security hardening regression tests ──────────────────────────────────────

describe('Security: sanitizeHTML uses proper Node-compatible DOMPurify (Issue 1)', () => {
    it('strips svg/onload XSS that bypasses the old regex (no whitespace before attribute)', async () => {
        const { renderSurface } = await import('./renderer');
        // <svg/onload=...> has no whitespace before "onload" so the old \s+on\w+ regex
        // never matched it. DOMPurify/jsdom must remove the attribute.
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: { html: '<svg/onload=alert(1)><p>safe</p></svg>' },
                },
            }],
        });
        assert.ok(!html.includes('onload'), `onload handler must be stripped. Got: ${html}`);
        assert.ok(html.includes('safe'), `Safe content must survive. Got: ${html}`);
    });

    it('strips iframe src="javascript:…" XSS (old regex only handled href)', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: { html: '<iframe src="javascript:alert(1)"></iframe><p>safe</p>' },
                },
            }],
        });
        assert.ok(
            !html.includes('src="javascript:'),
            `javascript: iframe src must be stripped. Got: ${html}`,
        );
        assert.ok(html.includes('safe'), `Safe content must survive. Got: ${html}`);
    });
});

describe('Security: sandbox iframe does not use allow-scripts + allow-same-origin (Issue 2)', () => {
    it('does not emit both allow-scripts and allow-same-origin in the same sandbox attribute', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'html1',
                component: {
                    type: 'HTML',
                    props: { html: '<div>Content</div>', sandbox: true },
                },
            }],
        });
        assert.ok(html.includes('<iframe'), `Expected iframe. Got: ${html}`);
        // The unsafe combination: scripts can remove the sandbox when allow-same-origin
        // is present alongside allow-scripts.
        const hasBoth = html.includes('allow-scripts') && html.includes('allow-same-origin');
        assert.ok(!hasBoth, `Unsafe sandbox: both allow-scripts and allow-same-origin present. Got: ${html}`);
    });
});

describe('Security: width/height props cannot inject CSS via semicolons (Issue 3)', () => {
    it('silently drops a width value that contains a semicolon-injected CSS declaration', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'r1',
                component: { type: 'Row', props: { width: '100px; color: red' } },
            }],
        });
        assert.ok(
            !html.includes('color: red'),
            `Injected CSS must not appear in output. Got: ${html}`,
        );
    });

    it('silently drops a height value that contains a semicolon-injected CSS declaration', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'r1',
                component: { type: 'Row', props: { height: '50vh; background: url(evil)' } },
            }],
        });
        assert.ok(
            !html.includes('background:') && !html.includes('background ='),
            `Injected CSS must not appear in output. Got: ${html}`,
        );
    });

    it('still allows safe px, %, em, rem, vw, vh values', async () => {
        const { renderSurface } = await import('./renderer');
        const cases: [string, string][] = [
            ['200px', 'width: 200px'],
            ['50%', 'width: 50%'],
            ['2.5em', 'width: 2.5em'],
            ['100vw', 'width: 100vw'],
            ['auto', 'width: auto'],
        ];
        for (const [val, expected] of cases) {
            const html = renderSurface({
                components: [{
                    id: 'r1',
                    component: { type: 'Row', props: { width: val } },
                }],
            });
            assert.ok(html.includes(expected), `Expected "${expected}" for width="${val}". Got: ${html}`);
        }
    });
});

// ── DOM-free sanitizer regression tests (no jsdom at runtime) ─────────────────
// These tests verify the new allowlist-based sanitizer covers the same XSS
// vectors as DOMPurify+jsdom without requiring jsdom in the extension bundle.
describe('Security: DOM-free sanitizeHTML – no jsdom at runtime (Issue 4)', () => {
    it('strips <script> tags and their payload content', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<p>ok</p><script>evil_payload()</script><p>after</p>' },
                },
            }],
        });
        assert.ok(!html.includes('<script'), `Script open tag must be gone. Got: ${html}`);
        assert.ok(!html.includes('evil_payload'), `Script content must be gone. Got: ${html}`);
        assert.ok(html.includes('ok'), `Content before script must survive. Got: ${html}`);
        assert.ok(html.includes('after'), `Content after script must survive. Got: ${html}`);
    });

    it('strips on* event handlers when separated by a slash (svg/onload)', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<svg/onload=alert(1)><p>safe</p></svg>' },
                },
            }],
        });
        assert.ok(!html.includes('onload'), `onload handler must be stripped. Got: ${html}`);
        assert.ok(html.includes('safe'), `Safe content must survive. Got: ${html}`);
    });

    it('strips onerror handler on img tags', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<img src="x.png" onerror="alert(1)" />' },
                },
            }],
        });
        assert.ok(!html.includes('onerror'), `onerror must be stripped. Got: ${html}`);
        // img itself and src may survive – only the handler is stripped
    });

    it('strips onclick and other on* handlers from arbitrary elements', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<button onclick="steal()">click me</button>' },
                },
            }],
        });
        assert.ok(!html.includes('onclick'), `onclick must be stripped. Got: ${html}`);
        assert.ok(html.includes('click me'), `Button text must survive. Got: ${html}`);
    });

    it('strips javascript: protocol from href attributes', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<a href="javascript:alert(1)">link text</a>' },
                },
            }],
        });
        assert.ok(!html.includes('javascript:'), `javascript: href must be stripped. Got: ${html}`);
        assert.ok(html.includes('link text'), `Link text must survive. Got: ${html}`);
    });

    it('strips javascript: protocol from src attributes (iframe)', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<iframe src="javascript:alert(1)"></iframe><p>safe</p>' },
                },
            }],
        });
        assert.ok(!html.includes('src="javascript:'), `javascript: iframe src must be stripped. Got: ${html}`);
        assert.ok(html.includes('safe'), `Content after iframe must survive. Got: ${html}`);
    });

    it('preserves safe HTML structure unchanged', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: {
                        html: '<div class="card"><h2>Title</h2><p>Body <strong>text</strong>.</p></div>',
                    },
                },
            }],
        });
        assert.ok(html.includes('<div class="card">'), `Safe div class must survive. Got: ${html}`);
        assert.ok(html.includes('<h2>Title</h2>'), `Safe h2 must survive. Got: ${html}`);
        assert.ok(html.includes('<strong>text</strong>'), `Safe strong must survive. Got: ${html}`);
    });

    it('strips noscript tags and their content', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{
                id: 'h1',
                component: {
                    type: 'HTML',
                    props: { html: '<noscript><img src="x" onerror="evil()"></noscript><p>visible</p>' },
                },
            }],
        });
        assert.ok(!html.includes('<noscript'), `noscript must be stripped. Got: ${html}`);
        assert.ok(!html.includes('evil()'), `noscript content must be stripped. Got: ${html}`);
        assert.ok(html.includes('visible'), `Content outside noscript must survive. Got: ${html}`);
    });
});

describe('CodeBlock component', () => {
    it('renders code prop (schema-correct prop name)', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{ id: 'cb1', component: { type: 'CodeBlock', props: { code: 'const x = 1;', language: 'typescript' } } }],
        });
        assert.ok(html.includes('const x = 1;'), `code prop must render. Got: ${html}`);
        assert.ok(html.includes('language-typescript'), `language class must be set. Got: ${html}`);
    });

    it('auto-upgrades CodeBlock with language=mermaid to MermaidDiagram structure', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [{ id: 'cb2', component: { type: 'CodeBlock', props: { code: 'graph TD\n  A --> B', language: 'mermaid' } } }],
        });
        assert.ok(html.includes('a2ui-mermaid'), `auto-upgrade must emit .a2ui-mermaid. Got: ${html}`);
        assert.ok(html.includes('a2ui-mermaid-target'), `must include render target. Got: ${html}`);
        assert.ok(html.includes('graph TD'), `mermaid source must be preserved. Got: ${html}`);
        assert.ok(!html.includes('a2ui-codeblock'), `must NOT be a plain code block. Got: ${html}`);
    });
});

describe('Markdown mermaid auto-upgrade', () => {
    it('auto-upgrades mermaid fenced code block inside Markdown to MermaidDiagram structure', async () => {
        const { renderSurface } = await import('./renderer');
        const content = 'Here is a diagram:\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nEnd.';
        const html = renderSurface({
            components: [{ id: 'md1', component: { type: 'Markdown', props: { content } } }],
        });
        assert.ok(html.includes('a2ui-mermaid'), `mermaid fence must be auto-upgraded. Got: ${html}`);
        assert.ok(html.includes('a2ui-mermaid-target'), `must include render target. Got: ${html}`);
        assert.ok(html.includes('graph TD'), `mermaid source must be preserved. Got: ${html}`);
        assert.ok(html.includes('Here is a diagram'), `surrounding text must survive. Got: ${html}`);
    });
});
