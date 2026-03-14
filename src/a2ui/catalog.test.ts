import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('A2UI Catalog – Chart Components', () => {
    it('should include BarChart in allowed component types', async () => {
        const { isAllowedComponentType } = await import('./catalog');
        assert.ok(isAllowedComponentType('BarChart'), 'BarChart should be allowed');
    });

    it('should include LineChart in allowed component types', async () => {
        const { isAllowedComponentType } = await import('./catalog');
        assert.ok(isAllowedComponentType('LineChart'), 'LineChart should be allowed');
    });

    it('should include PieChart in allowed component types', async () => {
        const { isAllowedComponentType } = await import('./catalog');
        assert.ok(isAllowedComponentType('PieChart'), 'PieChart should be allowed');
    });

    it('should still allow MermaidDiagram', async () => {
        const { isAllowedComponentType } = await import('./catalog');
        assert.ok(isAllowedComponentType('MermaidDiagram'), 'MermaidDiagram should still be allowed');
    });
});
