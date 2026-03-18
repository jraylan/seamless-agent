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

describe('A2UI Renderer – BarChart Component', () => {
    it('renders basic bar chart', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [
                    { label: 'A', value: 10 },
                    { label: 'B', value: 20 },
                ],
            }),
        );
        assert.ok(html.includes('a2ui-barchart'), `Expected a2ui-barchart class. Got: ${html}`);
        assert.ok(html.includes('a2ui-chart-container'), `Expected chart container. Got: ${html}`);
    });

    it('renders horizontal bar chart when horizontal=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [{ label: 'A', value: 10 }],
                horizontal: true,
            }),
        );
        assert.ok(html.includes('a2ui-barchart'), `Expected a2ui-barchart class. Got: ${html}`);
    });

    it('shows values when showValues=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [{ label: 'A', value: 42 }],
                showValues: true,
            }),
        );
        assert.ok(html.includes('42'), `Expected value 42 to be shown. Got: ${html}`);
    });

    it('applies custom color', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [{ label: 'A', value: 10 }],
                color: '#FF5733',
            }),
        );
        assert.ok(html.includes('#FF5733'), `Expected custom color. Got: ${html}`);
    });

    it('renders title when provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [{ label: 'A', value: 10 }],
                title: 'Sales Data',
            }),
        );
        assert.ok(html.includes('Sales Data'), `Expected title. Got: ${html}`);
    });

    it('handles empty data gracefully', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [],
            }),
        );
        assert.ok(html.includes('a2ui-barchart') || html.includes('No data'), `Expected chart or error message. Got: ${html}`);
    });
});

describe('A2UI Renderer – LineChart Component', () => {
    it('renders basic line chart', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [
                    { label: 'Jan', value: 10 },
                    { label: 'Feb', value: 20 },
                ],
            }),
        );
        assert.ok(html.includes('a2ui-linechart'), `Expected a2ui-linechart class. Got: ${html}`);
        assert.ok(html.includes('a2ui-chart-container'), `Expected chart container. Got: ${html}`);
    });

    it('shows data points when showPoints=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [{ label: 'A', value: 15 }],
                showPoints: true,
            }),
        );
        assert.ok(html.includes('a2ui-line-point'), `Expected data points. Got: ${html}`);
    });

    it('renders smooth curve when smooth=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [{ label: 'A', value: 10 }],
                smooth: true,
            }),
        );
        assert.ok(html.includes('a2ui-linechart'), `Expected line chart. Got: ${html}`);
    });

    it('applies custom color', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [{ label: 'A', value: 10 }],
                color: '#2196F3',
            }),
        );
        assert.ok(html.includes('#2196F3'), `Expected custom color. Got: ${html}`);
    });

    it('handles single data point', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [{ label: 'Only', value: 100 }],
            }),
        );
        assert.ok(html.includes('a2ui-linechart'), `Expected line chart. Got: ${html}`);
    });
});

describe('A2UI Renderer – PieChart Component', () => {
    it('renders basic pie chart', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'A', value: 30 },
                    { label: 'B', value: 70 },
                ],
            }),
        );
        assert.ok(html.includes('a2ui-piechart'), `Expected a2ui-piechart class. Got: ${html}`);
        assert.ok(html.includes('a2ui-chart-container'), `Expected chart container. Got: ${html}`);
    });

    it('renders doughnut chart when doughnut=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [{ label: 'A', value: 100 }],
                doughnut: true,
            }),
        );
        assert.ok(html.includes('a2ui-piechart'), `Expected pie chart. Got: ${html}`);
    });

    it('shows legend when showLegend=true', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'Red', value: 50 },
                    { label: 'Blue', value: 50 },
                ],
                showLegend: true,
            }),
        );
        assert.ok(html.includes('a2ui-legend'), `Expected legend. Got: ${html}`);
    });

    it('uses custom colors when provided', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'A', value: 50, color: '#FF0000' },
                    { label: 'B', value: 50, color: '#00FF00' },
                ],
            }),
        );
        assert.ok(html.includes('#FF0000'), `Expected custom color #FF0000. Got: ${html}`);
        assert.ok(html.includes('#00FF00'), `Expected custom color #00FF00. Got: ${html}`);
    });

    it('calculates percentages correctly', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'A', value: 25 },
                    { label: 'B', value: 75 },
                ],
            }),
        );
        // Should show 25% and 75% in tooltips or legend
        assert.ok(html.includes('25'), `Expected 25%. Got: ${html}`);
        assert.ok(html.includes('75'), `Expected 75%. Got: ${html}`);
    });
});

describe('A2UI Renderer – MermaidDiagram Examples (Option A)', () => {
    it('renders pie chart Mermaid diagram', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('MermaidDiagram', {
                text: 'pie title Data\n"A": 70\n"B": 30',
            }),
        );
        assert.ok(html.includes('a2ui-mermaid'), `Expected mermaid class. Got: ${html}`);
        assert.ok(html.includes('pie title Data'), `Expected diagram text. Got: ${html}`);
    });

    it('renders flowchart Mermaid diagram', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('MermaidDiagram', {
                text: 'graph TD\nA[Start] --> B[End]',
            }),
        );
        assert.ok(html.includes('a2ui-mermaid'), `Expected mermaid class. Got: ${html}`);
        assert.ok(html.includes('graph TD'), `Expected diagram text. Got: ${html}`);
    });

    it('renders gantt chart Mermaid diagram', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('MermaidDiagram', {
                text: 'gantt\n    title Project\n    dateFormat YYYY-MM-DD\n    section Phase 1\n    Task 1 :2024-01-01, 30d',
            }),
        );
        assert.ok(html.includes('a2ui-mermaid'), `Expected mermaid class. Got: ${html}`);
        assert.ok(html.includes('gantt'), `Expected diagram text. Got: ${html}`);
    });
});

// ─── Regression: props.data as a JSON string ─────────────────────────────────
// When the LLM serialises the data array to a string before passing it through
// the tool schema, `props.data` arrives as a stringified JSON array instead of
// a native array.  The renderer must normalise it so charts render correctly
// instead of falling back to the `.a2ui-chart-error` sentinel.
// -----------------------------------------------------------------
describe('A2UI Renderer – BarChart accepts stringified JSON data (regression)', () => {
    it('renders bar chart when data is a JSON string', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: JSON.stringify([
                    { label: 'Alpha', value: 42 },
                    { label: 'Beta', value: 17 },
                ]),
            }),
        );
        assert.ok(
            !html.includes('a2ui-chart-error'),
            `Expected no chart-error fallback when data is a JSON string. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-barchart'),
            `Expected a2ui-barchart class when data is a JSON string. Got: ${html}`,
        );
    });

    it('renders BarChart bar labels from stringified JSON data', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: JSON.stringify([{ label: 'Gamma', value: 99 }]),
                showValues: true,
            }),
        );
        assert.ok(
            html.includes('Gamma'),
            `Expected label "Gamma" to appear when data is a JSON string. Got: ${html}`,
        );
    });
});

describe('A2UI Renderer – LineChart accepts stringified JSON data (regression)', () => {
    it('renders line chart when data is a JSON string', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: JSON.stringify([
                    { label: 'Jan', value: 5 },
                    { label: 'Feb', value: 15 },
                ]),
            }),
        );
        assert.ok(
            !html.includes('a2ui-chart-error'),
            `Expected no chart-error fallback when data is a JSON string. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-linechart'),
            `Expected a2ui-linechart class when data is a JSON string. Got: ${html}`,
        );
    });
});

describe('A2UI Renderer – PieChart accepts stringified JSON data (regression)', () => {
    it('renders pie chart when data is a JSON string', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: JSON.stringify([
                    { label: 'X', value: 60 },
                    { label: 'Y', value: 40 },
                ]),
            }),
        );
        assert.ok(
            !html.includes('a2ui-chart-error'),
            `Expected no chart-error fallback when data is a JSON string. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-piechart'),
            `Expected a2ui-piechart class when data is a JSON string. Got: ${html}`,
        );
    });
});

// ─── Regression: all-zero values must not emit NaN geometry ──────────────────
// When every data item has value 0, division-by-zero in the vertical BarChart
// (barHeight = value / maxValue) and in PieChart (angle = value / total) would
// previously produce NaN coordinates in the SVG output.  Both must render
// cleanly (no NaN, no chart-error) when all values are zero.
// ─────────────────────────────────────────────────────────────────────────────

describe('A2UI Renderer – BarChart with all-zero values (regression)', () => {
    it('vertical BarChart does not emit NaN when all values are zero', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [
                    { label: 'A', value: 0 },
                    { label: 'B', value: 0 },
                    { label: 'C', value: 0 },
                ],
            }),
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in SVG output for all-zero vertical BarChart. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-barchart'),
            `Expected a2ui-barchart class for all-zero data. Got: ${html}`,
        );
    });

    it('horizontal BarChart does not emit NaN when all values are zero', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [
                    { label: 'A', value: 0 },
                    { label: 'B', value: 0 },
                ],
                horizontal: true,
            }),
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in SVG output for all-zero horizontal BarChart. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-barchart'),
            `Expected a2ui-barchart class for all-zero horizontal data. Got: ${html}`,
        );
    });
});

describe('A2UI Renderer – PieChart with all-zero values (regression)', () => {
    it('PieChart does not emit NaN when all values are zero', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'X', value: 0 },
                    { label: 'Y', value: 0 },
                ],
            }),
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in SVG output for all-zero PieChart. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-piechart'),
            `Expected a2ui-piechart class for all-zero data. Got: ${html}`,
        );
    });

    it('doughnut PieChart does not emit NaN when all values are zero', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'X', value: 0 },
                    { label: 'Y', value: 0 },
                ],
                doughnut: true,
            }),
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in SVG output for all-zero doughnut PieChart. Got: ${html}`,
        );
        assert.ok(
            html.includes('a2ui-piechart'),
            `Expected a2ui-piechart class for all-zero doughnut data. Got: ${html}`,
        );
    });
});

// ─── Regression: string-numeric `value` fields must be coerced to numbers ────
// When the LLM or tool schema serialises numeric values as strings (e.g.
// `value: "42"` instead of `value: 42`), the renderer must coerce them to
// actual numbers so bars/lines/slices are plotted with correct non-zero
// geometry rather than collapsing everything to 0.
// ─────────────────────────────────────────────────────────────────────────────

describe('A2UI Renderer – BarChart coerces string numeric values (regression)', () => {
    it('vertical BarChart renders non-zero bar heights when values are numeric strings', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [
                    { label: 'A', value: '10' },
                    { label: 'B', value: '40' },
                ],
            }),
        );
        assert.ok(
            html.includes('a2ui-barchart'),
            `Expected a2ui-barchart class. Got: ${html}`,
        );
        // With string values collapsed to 0, maxValue=0 → every bar gets height="0".
        // After coercion the tallest bar should have height="70" (100% of range).
        assert.ok(
            !html.includes('height="0"'),
            `Expected non-zero bar heights when values are numeric strings. Got: ${html}`,
        );
    });

    it('horizontal BarChart renders non-zero bar widths when values are numeric strings', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [
                    { label: 'X', value: '20' },
                    { label: 'Y', value: '80' },
                ],
                horizontal: true,
            }),
        );
        assert.ok(
            html.includes('a2ui-barchart'),
            `Expected a2ui-barchart class. Got: ${html}`,
        );
        // With string values collapsed to 0, every bar gets width="0".
        assert.ok(
            !html.includes('width="0"'),
            `Expected non-zero bar widths when values are numeric strings. Got: ${html}`,
        );
    });

    it('showValues displays the original numeric string value coerced correctly', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('BarChart', {
                data: [{ label: 'A', value: '99' }],
                showValues: true,
            }),
        );
        assert.ok(
            html.includes('99'),
            `Expected value "99" to appear in rendered output. Got: ${html}`,
        );
    });
});

describe('A2UI Renderer – LineChart coerces string numeric values (regression)', () => {
    it('renders non-flat polyline when values are numeric strings', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [
                    { label: 'Jan', value: '10' },
                    { label: 'Feb', value: '50' },
                    { label: 'Mar', value: '30' },
                ],
            }),
        );
        assert.ok(
            html.includes('a2ui-linechart'),
            `Expected a2ui-linechart class. Got: ${html}`,
        );
        // When all values collapse to 0 the range becomes 1 (0-0 → fallback 1)
        // and every point lands on y=85.  The polyline therefore has identical y
        // values: "5,85 50,85 95,85".  After coercion the y values must differ.
        // We detect the collapsed case by checking that NOT all y-coords are 85.
        const allAtBottom = /\d+,85 \d+,85 \d+,85/.test(html);
        assert.ok(
            !allAtBottom,
            `Expected varied y-coordinates when values are numeric strings (not all collapsed to y=85). Got: ${html}`,
        );
    });

    it('single-point LineChart coerces string value without error', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('LineChart', {
                data: [{ label: 'Only', value: '42' }],
            }),
        );
        assert.ok(
            html.includes('a2ui-linechart'),
            `Expected a2ui-linechart class. Got: ${html}`,
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in output when single value is a numeric string. Got: ${html}`,
        );
    });
});

describe('A2UI Renderer – PieChart coerces string numeric values (regression)', () => {
    it('renders large-arc flag when one slice exceeds 180° with string values', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'A', value: '30' },
                    { label: 'B', value: '70' },
                ],
            }),
        );
        assert.ok(
            html.includes('a2ui-piechart'),
            `Expected a2ui-piechart class. Got: ${html}`,
        );
        // The 70% slice spans 252° (> 180°) so its arc command must have largeArcFlag=1.
        // The SVG arc syntax is: A rx ry x-rotation large-arc-flag sweep-flag x y
        // → "A 50 50 0 1 1" appears only when a non-zero >180° arc is drawn.
        // Without coercion total=0 → angle=0 for every slice → largeArcFlag is always 0
        // → "A 50 50 0 1 1" never appears.
        assert.ok(
            html.includes('A 50 50 0 1 1'),
            `Expected "A 50 50 0 1 1" (large-arc) in PieChart SVG for the 70% slice. Got: ${html}`,
        );
    });

    it('doughnut PieChart has large-arc inner segment when slice > 180° with string values', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'X', value: '60' },
                    { label: 'Y', value: '40' },
                ],
                doughnut: true,
            }),
        );
        assert.ok(
            !html.includes('NaN'),
            `Expected no NaN in doughnut PieChart when values are numeric strings. Got: ${html}`,
        );
        // The 60% slice spans 216° > 180° → inner arc also uses largeArcFlag=1.
        // Inner arc command ends with "0" sweep-flag: "A <innerR> <innerR> 0 1 0"
        // r=50, innerR=30 → "A 30 30 0 1 0"
        assert.ok(
            html.includes('A 30 30 0 1 0'),
            `Expected "A 30 30 0 1 0" (large-arc inner) in doughnut PieChart for the 60% slice. Got: ${html}`,
        );
    });

    it('PieChart legend shows correct percentages from string values', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface(
            surface('PieChart', {
                data: [
                    { label: 'Quarter', value: '25' },
                    { label: 'Rest',    value: '75' },
                ],
                showLegend: true,
            }),
        );
        // 25/(25+75)*100 = 25%; without coercion total=0 → all legend items show "0%".
        // Check for the literal text "25%" which can only come from percent.toFixed(0).
        assert.ok(
            html.includes('25%'),
            `Expected percentage text "25%" in legend when values are numeric strings. Got: ${html}`,
        );
    });
});
