import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { A2UIComponentType } from './types';

describe('A2UI Types – Chart Components', () => {
    it('should include BarChart in A2UIComponentType union', async () => {
        // This test verifies that BarChart is a valid component type
        // This will FAIL until we add BarChart to the type union
        const validTypes: A2UIComponentType[] = [
            'BarChart',
            'LineChart',
            'PieChart',
        ];
        assert.ok(validTypes.length === 3, 'Expected 3 chart types');
    });

    it('should have MermaidDiagram type with proper documentation', async () => {
        // This test verifies MermaidDiagram is still available
        const mermaidType: A2UIComponentType = 'MermaidDiagram';
        assert.strictEqual(mermaidType, 'MermaidDiagram');
    });
});
