import MarkdownIt from 'markdown-it';

import type { A2UISurface, A2UIDataModel } from './types';
import { isAllowedComponentType } from './catalog';

const markdownRenderer = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
});

export class RendererError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RendererError';
    }
}

function escHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Resolves $data.<path> bindings against the data model */
function resolveBinding(value: unknown, data: A2UIDataModel): unknown {
    if (typeof value !== 'string' || !value.startsWith('$data.')) {
        return value;
    }
    const path = value.slice(6); // strip '$data.'
    const parts = path.split('.');
    let current: unknown = data;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function interpolateBindings(value: string, data: A2UIDataModel): string {
    return value.replace(/\$data(?:\.[A-Za-z0-9_]+)+/g, (match) => {
        const resolved = resolveBinding(match, data);
        if (resolved === undefined || resolved === null) {
            return '';
        }
        if (typeof resolved === 'object') {
            return JSON.stringify(resolved);
        }
        return String(resolved);
    });
}

function resolveValue(value: unknown, data: A2UIDataModel): unknown {
    if (typeof value === 'string' && value.includes('$data.')) {
        if (value.startsWith('$data.') && !value.includes(' ')) {
            return resolveBinding(value, data);
        }
        return interpolateBindings(value, data);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => resolveValue(entry, data));
    }

    if (value && typeof value === 'object') {
        const resolvedObject: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            resolvedObject[key] = resolveValue(nestedValue, data);
        }
        return resolvedObject;
    }

    return resolveBinding(value, data);
}

function resolveProps(
    props: Record<string, unknown>,
    data: A2UIDataModel,
): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        resolved[key] = resolveValue(value, data);
    }
    return resolved;
}

function extractComponentProps(component: Record<string, unknown>): Record<string, unknown> {
    const props = component.props;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
        return props as Record<string, unknown>;
    }

    const extractedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(component)) {
        if (key === 'type') {
            continue;
        }
        extractedProps[key] = value;
    }

    return extractedProps;
}

function renderTag(
    type: string,
    id: string,
    props: Record<string, unknown>,
    children: string,
): string {
    const labelText = typeof props.label === 'string' ? props.label : '';
    const disabled = props.disabled ? ' disabled' : '';
    const ariaLabel = typeof props.ariaLabel === 'string' && props.ariaLabel.trim().length > 0
        ? ` aria-label="${escHtml(props.ariaLabel)}"`
        : '';
    const helperText = typeof props.helperText === 'string' ? props.helperText : '';
    const requiredMarker = props.required ? '<span class="a2ui-required" aria-hidden="true">*</span>' : '';
    const requiredAttribute = props.required ? ' required' : '';

    switch (type) {
        case 'Row':
            return `<div class="a2ui-row" id="${escHtml(id)}">${children}</div>`;

        case 'Column':
            return `<div class="a2ui-column" id="${escHtml(id)}">${children}</div>`;

        case 'Card':
            return `<div class="a2ui-card" id="${escHtml(id)}">${children}</div>`;

        case 'Divider':
            return `<hr class="a2ui-divider" id="${escHtml(id)}" />`;

        case 'Text':
            return `<p class="a2ui-text" id="${escHtml(id)}">${escHtml(String(props.text ?? props.content ?? ''))}</p>`;

        case 'Heading': {
            const lvl = Math.min(6, Math.max(1, Number(props.level ?? 2)));
            return `<h${lvl} class="a2ui-heading" id="${escHtml(id)}">${escHtml(String(props.text ?? props.content ?? ''))}</h${lvl}>`;
        }

        case 'Image':
            return `<img class="a2ui-image" id="${escHtml(id)}" src="${escHtml(String(props.src ?? ''))}" alt="${escHtml(String(props.alt ?? ''))}"${ariaLabel} />`;

        case 'Markdown':
            return `<div class="a2ui-markdown" id="${escHtml(id)}">${markdownRenderer.render(String(props.text ?? props.content ?? ''))}</div>`;

        case 'CodeBlock': {
            const lang = escHtml(String(props.language ?? 'text'));
            return `<pre class="a2ui-codeblock" id="${escHtml(id)}"><code class="language-${lang}">${escHtml(String(props.content ?? ''))}</code></pre>`;
        }

        case 'Button':
            return `<button class="a2ui-button${typeof props.variant === 'string' ? ` a2ui-button-${escHtml(props.variant)}` : ''}" id="${escHtml(id)}" data-action="${escHtml(String(props.action ?? id))}"${ariaLabel}${disabled}>${escHtml(String(props.label ?? ''))}</button>`;

        case 'TextField':
            return `<label class="a2ui-field" id="${escHtml(id)}"><span class="a2ui-field-label">${escHtml(labelText)}${requiredMarker}</span><input class="a2ui-textfield" type="text" placeholder="${escHtml(String(props.placeholder ?? ''))}" value="${escHtml(String(props.value ?? ''))}" data-field="${escHtml(id)}"${ariaLabel}${disabled}${requiredAttribute} />${helperText ? `<span class="a2ui-field-helper">${escHtml(helperText)}</span>` : ''}</label>`;

        case 'Checkbox': {
            const checked = props.checked ? ' checked' : '';
            return `<label class="a2ui-checkbox-label" id="${escHtml(id)}"><input type="checkbox" class="a2ui-checkbox" data-field="${escHtml(id)}"${ariaLabel}${checked}${disabled} />${escHtml(String(props.label ?? ''))}${requiredMarker}</label>`;
        }

        case 'Select': {
            const opts = Array.isArray(props.options) ? props.options : [];
            const currentValue = String(props.value ?? '');
            const placeholder = typeof props.placeholder === 'string' ? props.placeholder : undefined;
            const optsHtml = opts
                .map((o: unknown) => {
                    const isObjectOption = o !== null && typeof o === 'object' && !Array.isArray(o);
                    const label = isObjectOption
                        ? String((o as Record<string, unknown>).label ?? (o as Record<string, unknown>).value ?? '')
                        : String(o);
                    const value = isObjectOption
                        ? String((o as Record<string, unknown>).value ?? (o as Record<string, unknown>).label ?? '')
                        : String(o);
                    const selected = value === currentValue ? ' selected' : '';
                    return `<option value="${escHtml(value)}"${selected}>${escHtml(label)}</option>`;
                })
                .join('');
            const placeholderHtml = placeholder
                ? `<option value=""${currentValue ? '' : ' selected'}>${escHtml(placeholder)}</option>`
                : '';
            return `<label class="a2ui-field" id="${escHtml(id)}"><span class="a2ui-field-label">${escHtml(labelText)}${requiredMarker}</span><select class="a2ui-select" data-field="${escHtml(id)}"${ariaLabel}${disabled}${requiredAttribute}>${placeholderHtml}${optsHtml}</select>${helperText ? `<span class="a2ui-field-helper">${escHtml(helperText)}</span>` : ''}</label>`;
        }

        case 'MermaidDiagram':
            return `<div class="a2ui-mermaid" id="${escHtml(id)}"><div class="a2ui-mermaid-label">${escHtml(String(props.label ?? 'Mermaid Diagram'))}</div><div class="a2ui-mermaid-target" aria-live="polite"></div><details class="a2ui-mermaid-details"><summary>Diagram source</summary><pre class="a2ui-mermaid-source"><code class="language-mermaid">${escHtml(String(props.text ?? props.content ?? ''))}</code></pre></details></div>`;

        case 'ProgressBar': {
            const val = Number(props.value ?? 0);
            const max = Number(props.max ?? 100);
            const percent = max > 0 ? Math.round((val / max) * 100) : 0;
            const progressLabel = typeof props.label === 'string' ? props.label : '';
            const showValue = props.showValue !== false;
            return `<div class="a2ui-progress" id="${escHtml(id)}"><div class="a2ui-progress-header"><span class="a2ui-progress-label">${escHtml(progressLabel)}</span>${showValue ? `<span class="a2ui-progress-value">${escHtml(String(percent))}%</span>` : ''}</div><progress class="a2ui-progressbar" value="${val}" max="${max}">${percent}%</progress></div>`;
        }

        case 'Badge':
            return `<span class="a2ui-badge" id="${escHtml(id)}">${escHtml(String(props.label ?? ''))}</span>`;

        default:
            return '';
    }
}

/**
 * Converts a flat component list (A2UISurface) into an HTML string.
 * Validates component types against the catalog; throws RendererError on failure.
 * Root components are those without a parentId; nesting is determined by parentId adjacency.
 */
export function renderSurface(surface: A2UISurface): string {
    const data = surface.dataModel ?? {};

    // Build lookup maps from the flat array
    const componentMap = new Map<string, Record<string, unknown>>();
    const childrenMap = new Map<string, string[]>(); // parentId -> ordered child ids

    for (const entry of surface.components) {
        componentMap.set(entry.id, entry.component);
        if (entry.parentId !== undefined) {
            if (!childrenMap.has(entry.parentId)) {
                childrenMap.set(entry.parentId, []);
            }
            childrenMap.get(entry.parentId)!.push(entry.id);
        }
    }

    // Validate all component types upfront
    for (const entry of surface.components) {
        const type = entry.component.type;
        if (typeof type !== 'string' || !isAllowedComponentType(type)) {
            throw new RendererError(
                `Unsupported component type: ${String(type)} (id: ${entry.id})`,
            );
        }
    }

    function renderComponent(id: string): string {
        const component = componentMap.get(id);
        if (!component) {
            throw new RendererError(`Component not found: ${id}`);
        }

        const type = String(component.type ?? '');
        const props = resolveProps(extractComponentProps(component), data);
        const childIds = childrenMap.get(id) ?? [];
        const childrenHtml = childIds.map((childId) => renderComponent(childId)).join('');

        return renderTag(type, id, props, childrenHtml);
    }

    // Render all root components (those with no parentId) in declaration order
    const roots = surface.components
        .filter((e) => e.parentId === undefined)
        .map((e) => e.id);

    return roots.map((id) => renderComponent(id)).join('');
}
