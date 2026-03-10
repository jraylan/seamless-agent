import type { A2UIComponentType } from './types';

export const ALLOWED_COMPONENT_TYPES: ReadonlySet<string> = new Set<A2UIComponentType>([
    'Row',
    'Column',
    'Card',
    'Divider',
    'Text',
    'Heading',
    'Image',
    'Markdown',
    'CodeBlock',
    'Button',
    'TextField',
    'Checkbox',
    'Select',
    'MermaidDiagram',
    'ProgressBar',
    'Badge',
]);

export function isAllowedComponentType(type: string): type is A2UIComponentType {
    return ALLOWED_COMPONENT_TYPES.has(type);
}
