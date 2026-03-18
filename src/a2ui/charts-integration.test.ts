import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('A2UI Charts – Integration Demo', () => {
    it('renders a complete dashboard with all chart types', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'row1',
                    component: { type: 'Row', props: {} },
                },
                {
                    id: 'barchart1',
                    parentId: 'row1',
                    component: {
                        type: 'BarChart',
                        props: {
                            title: 'Sales by Region',
                            data: [
                                { label: 'North', value: 120 },
                                { label: 'South', value: 90 },
                                { label: 'East', value: 150 },
                                { label: 'West', value: 80 },
                            ],
                            color: '#4CAF50',
                            showValues: true,
                        },
                    },
                },
                {
                    id: 'linechart1',
                    parentId: 'row1',
                    component: {
                        type: 'LineChart',
                        props: {
                            title: 'Revenue Trend',
                            data: [
                                { label: 'Jan', value: 100 },
                                { label: 'Feb', value: 120 },
                                { label: 'Mar', value: 140 },
                                { label: 'Apr', value: 130 },
                                { label: 'May', value: 160 },
                            ],
                            color: '#2196F3',
                            showPoints: true,
                        },
                    },
                },
                {
                    id: 'piechart1',
                    component: {
                        type: 'PieChart',
                        props: {
                            title: 'Market Share',
                            data: [
                                { label: 'Product A', value: 45, color: '#4CAF50' },
                                { label: 'Product B', value: 30, color: '#2196F3' },
                                { label: 'Product C', value: 25, color: '#FF9800' },
                            ],
                            showLegend: true,
                        },
                    },
                },
            ],
        });

        // Verify all charts are rendered
        assert.ok(html.includes('a2ui-barchart'), 'Should render BarChart');
        assert.ok(html.includes('a2ui-linechart'), 'Should render LineChart');
        assert.ok(html.includes('a2ui-piechart'), 'Should render PieChart');

        // Verify data is present
        assert.ok(html.includes('Sales by Region'), 'Should show BarChart title');
        assert.ok(html.includes('Revenue Trend'), 'Should show LineChart title');
        assert.ok(html.includes('Market Share'), 'Should show PieChart title');

        // Verify values are displayed
        assert.ok(html.includes('120'), 'Should show bar chart values');
        assert.ok(html.includes('May'), 'Should show line chart label');
        assert.ok(html.includes('45'), 'Should show pie chart percentage');
    });

    it('renders Option A: Mermaid diagrams for comparison', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'mermaid1',
                    component: {
                        type: 'MermaidDiagram',
                        props: {
                            text: 'pie title Project Status\n"Completed": 60\n"In Progress": 30\n"Pending": 10',
                        },
                    },
                },
                {
                    id: 'mermaid2',
                    component: {
                        type: 'MermaidDiagram',
                        props: {
                            text: 'graph LR\nA[Start] --> B[Process]\nB --> C[End]',
                        },
                    },
                },
            ],
        });

        // Verify Mermaid diagrams are rendered
        assert.ok(html.includes('a2ui-mermaid'), 'Should render MermaidDiagram');
        assert.ok(html.includes('pie title Project Status'), 'Should show pie chart text');
        assert.ok(html.includes('graph LR'), 'Should show flowchart text');
    });

    it('shows Option B: Native SVG charts are more customizable', async () => {
        const { renderSurface } = await import('./renderer');
        const html = renderSurface({
            components: [
                {
                    id: 'pie1',
                    component: {
                        type: 'PieChart',
                        props: {
                            title: 'Custom Colors',
                            doughnut: true,
                            data: [
                                { label: 'Red', value: 33, color: '#FF0000' },
                                { label: 'Green', value: 33, color: '#00FF00' },
                                { label: 'Blue', value: 34, color: '#0000FF' },
                            ],
                        },
                    },
                },
            ],
        });

        // Verify doughnut chart with custom colors
        assert.ok(html.includes('a2ui-piechart'), 'Should render PieChart');
        assert.ok(html.includes('#FF0000'), 'Should have custom red color');
        assert.ok(html.includes('#00FF00'), 'Should have custom green color');
        assert.ok(html.includes('#0000FF'), 'Should have custom blue color');
    });
});
