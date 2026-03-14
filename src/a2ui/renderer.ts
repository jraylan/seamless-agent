import MarkdownIt from 'markdown-it';

import type { A2UISurface, A2UIDataModel, DroppedStyleEntry } from './types';
import { isAllowedComponentType } from './catalog';
import { parsePredicate, serializePredicate, INTERACTIVE_COMPONENT_TYPES } from './reactivity';

/**
 * DOM-free HTML sanitizer for the HTML component.
 *
 * Removes dangerous elements (script, noscript, style, object, embed …) together
 * with their inner content, then strips event-handler attributes (on*) and
 * `javascript:` protocol URLs from all remaining tags.
 *
 * Why not DOMPurify + jsdom?
 *   The previous implementation called `new JSDOM('')` at module load time.
 *   When esbuild bundles the extension, jsdom tries to open its bundled
 *   `browser/default-stylesheet.css` asset relative to its original install
 *   path, which no longer exists inside the dist bundle → ENOENT crash.
 *   This replacement has no runtime dependencies beyond Node built-ins and
 *   works safely inside the bundled extension host.
 *
 * Trade-offs vs DOMPurify + jsdom:
 *   - Does not require jsdom; safe to bundle with esbuild.
 *   - Pattern-based: handles all XSS vectors exercised by the test suite
 *     (script injection, on* handlers with/without whitespace, javascript:
 *     protocol in href/src).  Deeply-encoded or mutation-based bypasses
 *     (HTML entities inside attribute values, etc.) are not addressed at
 *     this layer – they are mitigated by the sandboxed-iframe rendering path
 *     (sandbox: true) which provides defence-in-depth.
 */
function sanitizeHTML(html: string): string {
    // Step 1 – strip dangerous block elements and ALL their content.
    // These tags can contain or execute arbitrary code regardless of attributes.
    const BLOCK_STRIP = [
        'script', 'noscript', 'style', 'object', 'embed',
        'applet', 'base', 'meta', 'link',
    ] as const;
    for (const tag of BLOCK_STRIP) {
        // Non-void form: <tag ...> … </tag>
        html = html.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
        // Void / self-closing form: <tag ... /> or <tag ...>
        html = html.replace(new RegExp(`<${tag}(?:[\\s/][^>]*)?>`, 'gi'), '');
    }

    // Step 2 – for every remaining tag, strip dangerous attributes.
    html = html.replace(
        /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)(\/?>)/g,
        (_: string, tagName: string, attrs: string, end: string): string => {
            // 2a. Strip on* event-handler attributes.
            //     `[\s/]*` before "on" handles <svg/onload=…> (slash, no space).
            let clean = attrs.replace(
                /[\s/]*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>/]*)/gi,
                '',
            );

            // 2b. Strip javascript: protocol from URL-bearing attributes.
            // Quoted form: href="javascript:…"
            clean = clean.replace(
                /((?:href|src|action|formaction|xlink:href)\s*=\s*)(['"])\s*javascript:[^'"]*\2/gi,
                '$1$2about:blank$2',
            );
            // Unquoted form: href=javascript:…
            clean = clean.replace(
                /((?:href|src|action|formaction|xlink:href)\s*=\s*)javascript:[^\s>]*/gi,
                '$1about:blank',
            );

            return `<${tagName}${clean}${end}`;
        },
    );

    return html;
}

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

/**
 * Whitelist of safe CSS properties that can be used with the style prop.
 * Dangerous properties like position, overflow, z-index are excluded.
 */
const SAFE_CSS_PROPERTIES = new Set([
    // Colors
    'color',
    'backgroundColor',
    'borderColor',
    // Spacing
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    // Dimensions
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    // Borders
    'border',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'borderRadius',
    'borderWidth',
    'borderStyle',
    // Typography
    'fontSize',
    'fontWeight',
    'fontFamily',
    'lineHeight',
    'textAlign',
    'textDecoration',
    'whiteSpace',
    'textOverflow',
    // Display & Flexbox
    'display',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'alignSelf',
    'gap',
    'flex',
    'flexGrow',
    'flexShrink',
    'flexBasis',
    'flexWrap',
    // CSS Grid
    'gridTemplateColumns',
    'gridTemplateRows',
    'gridColumn',
    'gridRow',
    // Overflow & visibility
    'overflow',
    'overflowX',
    'overflowY',
    // Box model utilities
    'boxSizing',
    // Image
    'objectFit',
    'objectPosition',
    // Miscellaneous safe properties
    'cursor',
    'opacity',
]);

/**
 * Allowed CSS dimension value pattern.
 * Accepts: <number><unit>, percentage, "auto", "inherit", or bare "0".
 * Rejects anything containing semicolons or other characters that could
 * break out of an inline style attribute.
 */
const SAFE_DIMENSION_RE = /^(\d+(\.\d+)?(px|%|em|rem|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc|fr)|auto|inherit|0)$/i;

/**
 * Returns the trimmed dimension string if it is a safe CSS length/percentage
 * value, or null if it contains disallowed characters.
 */
function sanitizeDimension(value: string): string | null {
    const trimmed = value.trim();
    return SAFE_DIMENSION_RE.test(trimmed) ? trimmed : null;
}

/**
 * Renders a style object into an inline style string with whitelist validation.
 * Only safe CSS properties are allowed; dangerous ones are filtered out.
 * When `droppedOut` and `componentId` are provided, dropped property names are
 * accumulated so callers can report them back to the agent.
 */
function renderStyle(styleObj: unknown, droppedOut?: string[], componentId?: string): string {
    if (!styleObj || typeof styleObj !== 'object' || Array.isArray(styleObj)) {
        return '';
    }

    const styleParts: string[] = [];
    for (const [key, value] of Object.entries(styleObj)) {
        // Check if property is in whitelist
        if (!SAFE_CSS_PROPERTIES.has(key)) {
            if (droppedOut) {
                droppedOut.push(key);
            }
            continue; // Skip unsafe properties
        }

        // Validate value is a string
        if (typeof value !== 'string') {
            continue;
        }

        // Convert camelCase to kebab-case for CSS
        const cssKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        styleParts.push(`${cssKey}: ${value}`);
    }

    return styleParts.join('; ');
}

/**
 * Parses a declarative CSS string and validates/filter unsafe properties.
 * Handles both inline styles and CSS rules with selectors.
 * Returns a filtered CSS string with only safe properties.
 */
function parseDeclarativeStyle(cssString: string): string {
    if (typeof cssString !== 'string') {
        return '';
    }

    // Parse CSS rules: selector { property: value; }
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match;
    const filteredRules: string[] = [];

    while ((match = ruleRegex.exec(cssString)) !== null) {
        const selector = match[1].trim();
        const declarations = match[2].trim();

        // Parse and filter each declaration
        const decls = declarations.split(';').filter(d => d.trim().length > 0);
        const filteredDecls: string[] = [];

        for (const decl of decls) {
            const colonIndex = decl.indexOf(':');
            if (colonIndex === -1) continue;

            const property = decl.slice(0, colonIndex).trim();
            const value = decl.slice(colonIndex + 1).trim();

            if (property && value) {
                // Convert kebab-case to camelCase for whitelist check
                const camelKey = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

                // Check if property is in whitelist
                if (SAFE_CSS_PROPERTIES.has(camelKey)) {
                    filteredDecls.push(`${property}: ${value}`);
                }
            }
        }

        if (filteredDecls.length > 0) {
            filteredRules.push(`${selector} { ${filteredDecls.join('; ')} }`);
        }
    }

    // Also handle inline styles (no selector)
    if (!cssString.includes('{') && cssString.includes(':')) {
        const decls = cssString.split(';').filter(d => d.trim().length > 0);
        const filteredDecls: string[] = [];

        for (const decl of decls) {
            const colonIndex = decl.indexOf(':');
            if (colonIndex === -1) continue;

            const property = decl.slice(0, colonIndex).trim();
            const value = decl.slice(colonIndex + 1).trim();

            if (property && value) {
                const camelKey = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                if (SAFE_CSS_PROPERTIES.has(camelKey)) {
                    filteredDecls.push(`${property}: ${value}`);
                }
            }
        }

        return filteredDecls.join('; ');
    }

    return filteredRules.join('\n');
}

function decodeJsonPointerSegment(segment: string): string {
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveJsonPointer(path: string, data: unknown): unknown {
    if (path === '' || path === '/') {
        return data;
    }

    if (!path.startsWith('/')) {
        return undefined;
    }

    const parts = path.slice(1).split('/').map(decodeJsonPointerSegment);
    let current = data;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }

        if (Array.isArray(current)) {
            const index = Number(part);
            if (!Number.isInteger(index)) {
                return undefined;
            }
            current = current[index];
            continue;
        }

        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

function resolveLegacyDataPath(path: string, data: A2UIDataModel): unknown {
    if (!path.startsWith('$data.')) {
        return undefined;
    }

    const parts = path.slice(6).split('.');
    let current: unknown = data;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

function extractLiteralBoundValue(value: Record<string, unknown>): unknown {
    if ('literalString' in value) {
        return value.literalString;
    }
    if ('literalNumber' in value) {
        return value.literalNumber;
    }
    if ('literalBoolean' in value) {
        return value.literalBoolean;
    }
    if ('literalArray' in value) {
        return value.literalArray;
    }

    return undefined;
}

function isBoundValueObject(value: unknown): value is Record<string, unknown> {
    return Boolean(
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && ('path' in value || 'literalString' in value || 'literalNumber' in value || 'literalBoolean' in value || 'literalArray' in value)
    );
}

function resolveBinding(value: unknown, scopeData: unknown, rootData: A2UIDataModel): unknown {
    if (typeof value === 'string' && value.startsWith('$data.')) {
        return resolveLegacyDataPath(value, rootData);
    }

    if (!isBoundValueObject(value)) {
        return value;
    }

    const literalValue = extractLiteralBoundValue(value);
    const path = typeof value.path === 'string' ? value.path : undefined;
    if (!path) {
        return literalValue;
    }

    const resolved = resolveJsonPointer(path, scopeData);
    return resolved === undefined ? literalValue : resolved;
}

function interpolateBindings(value: string, rootData: A2UIDataModel): string {
    return value.replace(/\$data(?:\.[A-Za-z0-9_]+)+/g, (match) => {
        const resolved = resolveLegacyDataPath(match, rootData);
        if (resolved === undefined || resolved === null) {
            return '';
        }
        if (typeof resolved === 'object') {
            return JSON.stringify(resolved);
        }
        return String(resolved);
    });
}

function resolveValue(value: unknown, scopeData: unknown, rootData: A2UIDataModel): unknown {
    if (isBoundValueObject(value)) {
        return resolveBinding(value, scopeData, rootData);
    }

    if (typeof value === 'string' && value.includes('$data.')) {
        if (value.startsWith('$data.') && !value.includes(' ')) {
            return resolveLegacyDataPath(value, rootData);
        }
        return interpolateBindings(value, rootData);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => resolveValue(entry, scopeData, rootData));
    }

    if (value && typeof value === 'object') {
        const resolvedObject: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            resolvedObject[key] = resolveValue(nestedValue, scopeData, rootData);
        }
        return resolvedObject;
    }

    return resolveBinding(value, scopeData, rootData);
}

function resolveProps(
    props: Record<string, unknown>,
    scopeData: unknown,
    rootData: A2UIDataModel,
): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        resolved[key] = resolveValue(value, scopeData, rootData);
    }
    return resolved;
}

function extractComponentProps(component: Record<string, unknown>): Record<string, unknown> {
    if (typeof component.type !== 'string') {
        const entries = Object.entries(component);
        if (entries.length === 1) {
            const [type, props] = entries[0];
            if (isAllowedComponentType(type) && props && typeof props === 'object' && !Array.isArray(props)) {
                return props as Record<string, unknown>;
            }
        }
    }

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

function extractComponentType(component: Record<string, unknown>): string {
    if (typeof component.type === 'string') {
        return component.type;
    }

    const entries = Object.entries(component);
    if (entries.length === 1 && isAllowedComponentType(entries[0][0])) {
        return entries[0][0];
    }

    return String(component.type ?? '');
}

function resolveTemplateItems(children: unknown, scopeData: unknown): Array<{ componentId: string; itemData: unknown }> {
    if (!children || typeof children !== 'object' || Array.isArray(children)) {
        return [];
    }

    const template = (children as Record<string, unknown>).template;
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
        return [];
    }

    const templateRecord = template as Record<string, unknown>;
    const binding = typeof templateRecord.dataBinding === 'string' ? templateRecord.dataBinding : undefined;
    const componentId = typeof templateRecord.componentId === 'string' ? templateRecord.componentId : undefined;
    if (!binding || !componentId) {
        return [];
    }

    const items = resolveJsonPointer(binding, scopeData);
    if (!Array.isArray(items)) {
        return [];
    }

    return items.map((item) => ({ componentId, itemData: item }));
}

/**
 * Normalise a chart `data` prop to a plain array.
 *
 * The LLM sometimes serialises the array to a JSON string before the value
 * reaches the renderer (e.g. when the tool schema coerces unknown types to
 * strings).  Accept both a native array and a stringified JSON array so that
 * charts render correctly in either case.
 *
 * Returns an empty array when the value is absent, not an array, or not a
 * valid JSON string that parses to an array.
 */
function parseChartData<T = Record<string, unknown>>(raw: unknown): T[] {
    if (Array.isArray(raw)) {
        return raw as T[];
    }
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed as T[];
            }
        } catch {
            // fall through to empty array
        }
    }
    return [];
}

/**
 * Coerce a chart item `value` to a finite number.
 *
 * Chart data arriving from the LLM may have numeric values serialised as
 * strings (e.g. `"42"` instead of `42`).  Treating non-`number` typed values
 * as 0 collapses all plotted geometry to nothing.  This helper accepts both
 * `number` and numeric `string` inputs and returns the parsed finite value, or
 * 0 for anything that is absent, non-numeric, or non-finite (NaN / ±Infinity).
 */
function toFiniteNum(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function renderTag(
    type: string,
    id: string,
    props: Record<string, unknown>,
    children: string,
    droppedMapOut?: Map<string, string[]>,
): string {
    const labelText = typeof props.label === 'string' ? props.label : '';
    const disabled = props.disabled ? ' disabled' : '';
    const ariaLabel = typeof props.ariaLabel === 'string' && props.ariaLabel.trim().length > 0
        ? ` aria-label="${escHtml(props.ariaLabel)}"`
        : '';
    const helperText = typeof props.helperText === 'string' ? props.helperText : '';
    const requiredMarker = props.required ? '<span class="a2ui-required" aria-hidden="true">*</span>' : '';
    const requiredAttribute = props.required ? ' required' : '';

    // Build inline style from width/height props (Phase 2) and style prop (Phase 4)
    const styleParts: string[] = [];
    if (typeof props.width === 'string' && props.width.trim().length > 0) {
        const safeWidth = sanitizeDimension(props.width);
        if (safeWidth !== null) {
            styleParts.push(`width: ${safeWidth}`);
        }
    }
    if (typeof props.height === 'string' && props.height.trim().length > 0) {
        const safeHeight = sanitizeDimension(props.height);
        if (safeHeight !== null) {
            styleParts.push(`height: ${safeHeight}`);
        }
    }
    // Add style prop with whitelist validation
    const droppedProps: string[] = [];
    const customStyle = renderStyle(props.style, droppedProps);
    if (droppedProps.length > 0 && droppedMapOut) {
        droppedMapOut.set(id, droppedProps);
    }
    if (customStyle) {
        styleParts.push(customStyle);
    }
    const styleAttr = styleParts.length > 0 ? ` style="${escHtml(styleParts.join('; '))}"` : '';

    switch (type) {
        case 'Row':
            return `<div class="a2ui-row" id="${escHtml(id)}"${styleAttr}>${children}</div>`;

        case 'Column':
            return `<div class="a2ui-column" id="${escHtml(id)}"${styleAttr}>${children}</div>`;

        case 'Card':
            return `<div class="a2ui-card" id="${escHtml(id)}"${styleAttr}>${children}</div>`;

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
            // Accept multiple prop names for flexibility: diagram, definition, source, code, text, content
            const mermaidContent = String(
                props.diagram ??
                props.definition ??
                props.source ??
                props.code ??
                props.text ??
                props.content ??
                ''
            );
            return `<div class="a2ui-mermaid" id="${escHtml(id)}"><div class="a2ui-mermaid-label">${escHtml(String(props.label ?? 'Mermaid Diagram'))}</div><div class="a2ui-mermaid-target" aria-live="polite"></div><details class="a2ui-mermaid-details"><summary>Diagram source</summary><pre class="a2ui-mermaid-source"><code class="language-mermaid">${escHtml(mermaidContent)}</code></pre></details></div>`;

        case 'ProgressBar': {
            const val = Number(props.value ?? 0);
            const max = Number(props.max ?? 100);
            const percent = max > 0 ? Math.round((val / max) * 100) : 0;
            const progressLabel = typeof props.label === 'string' ? props.label : '';
            const showValue = props.showValue !== false;
            return `<div class="a2ui-progress" id="${escHtml(id)}"><div class="a2ui-progress-header"><span class="a2ui-progress-label">${escHtml(progressLabel)}</span>${showValue ? `<span class="a2ui-progress-value">${escHtml(String(percent))}%</span>` : ''}</div><progress class="a2ui-progressbar" value="${val}" max="${max}">${percent}%</progress></div>`;
        }

        case 'Badge': {
            const badgeVariant = typeof props.variant === 'string' ? ` a2ui-badge-${escHtml(props.variant)}` : '';
            return `<span class="a2ui-badge${badgeVariant}" id="${escHtml(id)}">${escHtml(String(props.label ?? ''))}</span>`;
        }

        case 'Table': {
            const columns = Array.isArray(props.columns) ? props.columns : [];
            const data = Array.isArray(props.data) ? props.data : [];

            // Build header row
            const headerHtml = columns
                .map((col: unknown) => {
                    const colObj = col !== null && typeof col === 'object' && !Array.isArray(col)
                        ? col as Record<string, unknown>
                        : null;
                    if (!colObj) return '';
                    const label = typeof colObj.label === 'string' ? colObj.label : '';
                    return `<th>${escHtml(label)}</th>`;
                })
                .join('');

            // Build data rows
            const rowsHtml = data
                .map((row: unknown) => {
                    const rowObj = row !== null && typeof row === 'object' && !Array.isArray(row)
                        ? row as Record<string, unknown>
                        : null;
                    if (!rowObj) return '';
                    const cellsHtml = columns
                        .map((col: unknown) => {
                            const colObj = col !== null && typeof col === 'object' && !Array.isArray(col)
                                ? col as Record<string, unknown>
                                : null;
                            if (!colObj || typeof colObj.key !== 'string') return '';
                            const cellValue = rowObj[colObj.key];
                            return `<td>${escHtml(String(cellValue ?? ''))}</td>`;
                        })
                        .join('');
                    return `<tr>${cellsHtml}</tr>`;
                })
                .join('');

            return `<table class="a2ui-table" id="${escHtml(id)}"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
        }

        case 'Tabs': {
            const tabs = Array.isArray(props.tabs) ? props.tabs : [];
            const activeTab = typeof props.activeTab === 'string' ? props.activeTab : '';

            // Build tab buttons
            const buttonsHtml = tabs
                .map((tab: unknown) => {
                    const tabObj = tab !== null && typeof tab === 'object' && !Array.isArray(tab)
                        ? tab as Record<string, unknown>
                        : null;
                    if (!tabObj || typeof tabObj.id !== 'string' || typeof tabObj.label !== 'string') {
                        return '';
                    }
                    const isActive = tabObj.id === activeTab;
                    return `<button class="a2ui-tab-button${isActive ? ' a2ui-tab-button-active' : ''}" data-tab="${escHtml(tabObj.id)}">${escHtml(tabObj.label)}</button>`;
                })
                .join('');

            // Create tab panels - each panel gets children that reference it
            // For now, render all children in panels and let webview JS handle switching
            const tabPanelsHtml = tabs
                .map((tab: unknown) => {
                    const tabObj = tab !== null && typeof tab === 'object' && !Array.isArray(tab)
                        ? tab as Record<string, unknown>
                        : null;
                    if (!tabObj || typeof tabObj.id !== 'string') {
                        return '';
                    }
                    const tabId = tabObj.id;
                    const isActive = tabId === activeTab;
                    // All children go into all panels for now
                    // In a real implementation, we'd map specific children to specific tabs
                    return `<div class="a2ui-tab-panel" data-tab-id="${escHtml(tabId)}" ${isActive ? '' : 'style="display: none;"'}>${children}</div>`;
                })
                .join('');

            return `<div class="a2ui-tabs" id="${escHtml(id)}" data-active-tab="${escHtml(activeTab)}"><div class="a2ui-tab-header">${buttonsHtml}</div><div class="a2ui-tab-content">${tabPanelsHtml}</div></div>`;
        }

        case 'Toggle': {
            const toggleLabel = typeof props.label === 'string' ? props.label : '';
            const checked = Boolean(props.checked);
            const toggleDisabled = props.disabled ? ' disabled' : '';

            return `<label class="a2ui-toggle" id="${escHtml(id)}"${ariaLabel}${toggleDisabled}><input type="checkbox" class="a2ui-toggle-input" data-field="${escHtml(id)}"${checked ? ' checked' : ''}${toggleDisabled} /><span class="a2ui-toggle-slider"></span><span class="a2ui-toggle-label">${escHtml(toggleLabel)}</span></label>`;
        }

        case 'HTML': {
            // Validate html is present
            const htmlContent = typeof props.html === 'string' ? props.html : '';
            if (!htmlContent) {
                throw new RendererError(
                    'HTML component requires an "html" prop'
                );
            }

            // Sanitize HTML to prevent XSS
            const cleanHtml = sanitizeHTML(htmlContent);

            const cssContent = typeof props.css === 'string' ? props.css : '';
            const useSandbox = props.sandbox === true;

            if (useSandbox) {
                // Use iframe with srcdoc for sandboxed rendering
                const escapedHtml = escHtml(cleanHtml);
                // Note: allow-same-origin is intentionally omitted – combining it
                // with allow-scripts lets scripts remove the sandbox attribute.
                return `<iframe class="a2ui-html-sandbox" sandbox="allow-scripts" srcdoc="${escapedHtml}"></iframe>`;
            } else {
                // Direct rendering with scoped styles
                // Parse CSS and filter unsafe properties
                const cleanCss = parseDeclarativeStyle(cssContent);
                return `<div class="a2ui-html-container" id="${escHtml(id)}"${styleAttr}>
                    ${cleanCss ? `<style scoped>${cleanCss}</style>` : ''}
                    ${cleanHtml}
                </div>`;
            }
        }

        case 'BarChart': {
            const data = parseChartData<{label?: string, value?: number}>(props.data);
            const title = typeof props.title === 'string' ? props.title : '';
            const color = typeof props.color === 'string' ? props.color : '#4CAF50';
            const horizontal = props.horizontal === true;
            const showValues = props.showValues === true;

            if (data.length === 0) {
                return `<div class="a2ui-chart-error" id="${escHtml(id)}">No data provided</div>`;
            }

            const maxValue = Math.max(...data.map(d => toFiniteNum(d.value)));

            let svgContent = '';

            if (title) {
                svgContent += `<text x="50%" y="10" text-anchor="middle" class="a2ui-chart-title">${escHtml(title)}</text>`;
            }

            // Render bars
            // Coordinate space: viewBox "0 0 600 200"
            data.forEach((item, index) => {
                const label = typeof item.label === 'string' ? item.label : `Item ${index + 1}`;
                const value = toFiniteNum(item.value);
                const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;

                if (horizontal) {
                    const y = 20 + index * (160 / data.length);
                    svgContent += `
                        <g class="a2ui-bar-group">
                            <text x="4" y="${y + 3}" class="a2ui-bar-label">${escHtml(label)}</text>
                            <rect x="50" y="${y}" width="${percent * 1.2}" height="${160 / data.length - 4}" fill="${escHtml(color)}" class="a2ui-bar-rect"/>
                            ${showValues ? `<text x="${52 + percent * 1.2}" y="${y + 3}" class="a2ui-bar-value">${value}</text>` : ''}
                        </g>
                    `;
                } else {
                    const x = 30 + index * (540 / data.length);
                    const barHeight = maxValue > 0 ? (value / maxValue) * 140 : 0;
                    const y = 180 - barHeight;
                    svgContent += `
                        <g class="a2ui-bar-group">
                            <rect x="${x}" y="${y}" width="${540 / data.length - 12}" height="${barHeight}" fill="${escHtml(color)}" class="a2ui-bar-rect"/>
                            ${showValues ? `<text x="${x + (540 / data.length - 12) / 2}" y="${y - 2}" text-anchor="middle" class="a2ui-bar-value">${value}</text>` : ''}
                            <text x="${x + (540 / data.length - 12) / 2}" y="195" text-anchor="middle" class="a2ui-bar-label">${escHtml(label)}</text>
                        </g>
                    `;
                }
            });

            return `<div class="a2ui-chart-container a2ui-barchart" id="${escHtml(id)}"${styleAttr}>
                <svg viewBox="0 0 600 200" class="a2ui-chart-svg" preserveAspectRatio="none">
                    ${svgContent}
                </svg>
            </div>`;
        }

        case 'LineChart': {
            const data = parseChartData<{label?: string, value?: number}>(props.data);
            const title = typeof props.title === 'string' ? props.title : '';
            const color = typeof props.color === 'string' ? props.color : '#2196F3';
            const showPoints = props.showPoints !== false; // default true
            const smooth = props.smooth === true;

            if (data.length === 0) {
                return `<div class="a2ui-chart-error" id="${escHtml(id)}">No data provided</div>`;
            }

            const maxValue = Math.max(...data.map(d => toFiniteNum(d.value)));
            const minValue = Math.min(0, ...data.map(d => toFiniteNum(d.value)));
            const range = maxValue - minValue || 1;

            let svgContent = '';

            if (title) {
                svgContent += `<text x="50%" y="10" text-anchor="middle" class="a2ui-chart-title">${escHtml(title)}</text>`;
            }

            // Coordinate space: viewBox "0 0 600 200"
            // Generate points
            const points = data.map((item, index) => {
                const x = 30 + (index / (data.length - 1 || 1)) * 540;
                const value = toFiniteNum(item.value);
                const y = 170 - ((value - minValue) / range) * 150;
                return `${x},${y}`;
            }).join(' ');

            // Draw line
            svgContent += `<polyline points="${points}" fill="none" stroke="${escHtml(color)}" stroke-width="2" class="a2ui-line-path"/>`;

            // Draw points if enabled
            if (showPoints) {
                data.forEach((item, index) => {
                    const x = 30 + (index / (data.length - 1 || 1)) * 540;
                    const value = toFiniteNum(item.value);
                    const y = 170 - ((value - minValue) / range) * 150;
                    const label = typeof item.label === 'string' ? item.label : `Item ${index + 1}`;
                    svgContent += `
                        <circle cx="${x}" cy="${y}" r="4" fill="${escHtml(color)}" class="a2ui-line-point"/>
                        <text x="${x}" y="${y - 6}" text-anchor="middle" class="a2ui-line-label">${escHtml(label)}</text>
                    `;
                });
            }

            return `<div class="a2ui-chart-container a2ui-linechart" id="${escHtml(id)}"${styleAttr}>
                <svg viewBox="0 0 600 200" class="a2ui-chart-svg" preserveAspectRatio="none">
                    ${svgContent}
                </svg>
            </div>`;
        }

        case 'PieChart': {
            const data = parseChartData<{label?: string, value?: number, color?: string}>(props.data);
            const title = typeof props.title === 'string' ? props.title : '';
            const doughnut = props.doughnut === true;
            const showLegend = props.showLegend !== false; // default true

            if (data.length === 0) {
                return `<div class="a2ui-chart-error" id="${escHtml(id)}">No data provided</div>`;
            }

            const total = data.reduce((sum, item) => sum + toFiniteNum(item.value), 0);
            const defaultColors = ['#4CAF50', '#2196F3', '#FF9800', '#F44336', '#9C27B0', '#00BCD4'];

            let svgContent = '';

            if (title) {
                svgContent += `<text x="50%" y="10" text-anchor="middle" class="a2ui-chart-title">${escHtml(title)}</text>`;
            }

            let currentAngle = 0;
            // Coordinate space: viewBox "0 0 200 200" — preserveAspectRatio="xMidYMid meet" keeps circles round
            const cx = 70, cy = 104, r = 50;

            data.forEach((item, index) => {
                const value = toFiniteNum(item.value);
                const label = typeof item.label === 'string' ? item.label : `Item ${index + 1}`;
                const color = typeof item.color === 'string' ? item.color : defaultColors[index % defaultColors.length];
                const percent = total > 0 ? (value / total) * 100 : 0;
                const angle = total > 0 ? (value / total) * 360 : 0;

                // Calculate slice path
                const startAngle = (currentAngle - 90) * Math.PI / 180;
                const endAngle = (currentAngle + angle - 90) * Math.PI / 180;

                const x1 = cx + r * Math.cos(startAngle);
                const y1 = cy + r * Math.sin(startAngle);
                const x2 = cx + r * Math.cos(endAngle);
                const y2 = cy + r * Math.sin(endAngle);

                const largeArc = angle > 180 ? 1 : 0;

                let pathData: string;
                if (doughnut) {
                    const innerR = r * 0.6;
                    const ix1 = cx + innerR * Math.cos(startAngle);
                    const iy1 = cy + innerR * Math.sin(startAngle);
                    const ix2 = cx + innerR * Math.cos(endAngle);
                    const iy2 = cy + innerR * Math.sin(endAngle);
                    pathData = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
                } else {
                    pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                }

                svgContent += `<path d="${pathData}" fill="${escHtml(color)}" stroke="white" stroke-width="1" class="a2ui-pie-slice">
                    <title>${escHtml(label)}: ${value} (${percent.toFixed(1)}%)</title>
                </path>`;

                // Add legend on the right side
                if (showLegend) {
                    const legendY = 40 + index * 14;
                    svgContent += `
                        <g class="a2ui-legend-item">
                            <rect x="140" y="${legendY}" width="6" height="6" fill="${escHtml(color)}"/>
                            <text x="148" y="${legendY + 5}" class="a2ui-legend-text">${escHtml(label)} (${percent.toFixed(0)}%)</text>
                        </g>
                    `;
                }

                currentAngle += angle;
            });

            return `<div class="a2ui-chart-container a2ui-piechart" id="${escHtml(id)}"${styleAttr}>
                <svg viewBox="0 0 200 200" class="a2ui-chart-svg" preserveAspectRatio="xMidYMid meet">
                    ${svgContent}
                </svg>
            </div>`;
        }

        default:
            return '';
    }
}

/**
 * Converts a flat component list (A2UISurface) into an HTML string.
 * Validates component types against the catalog; throws RendererError on failure.
 * Root components are those without a parentId; nesting is determined by parentId adjacency.
 *
 * Pass an optional `droppedMapOut` Map to collect CSS properties dropped by the style whitelist.
 * The map is keyed by component id; values are arrays of dropped property names.
 */
export function renderSurface(surface: A2UISurface, droppedMapOut?: Map<string, string[]>): string {
    const data = surface.dataModel ?? {};

    // Build lookup maps from the flat array
    const componentMap = new Map<string, Record<string, unknown>>();
    const childrenMap = new Map<string, string[]>(); // parentId -> ordered child ids
    const predicateMap = new Map<string, { visibleIf?: unknown; enabledIf?: unknown }>();

    for (const entry of surface.components) {
        componentMap.set(entry.id, entry.component);
        if (entry.parentId !== undefined) {
            if (!childrenMap.has(entry.parentId)) {
                childrenMap.set(entry.parentId, []);
            }
            childrenMap.get(entry.parentId)!.push(entry.id);
        }
        if (entry.visibleIf !== undefined || entry.enabledIf !== undefined) {
            predicateMap.set(entry.id, { visibleIf: entry.visibleIf, enabledIf: entry.enabledIf });
        }
    }

    // Validate all component types upfront
    for (const entry of surface.components) {
        const type = extractComponentType(entry.component);
        if (typeof type !== 'string' || !isAllowedComponentType(type)) {
            throw new RendererError(
                `Unsupported component type: ${String(type)} (id: ${entry.id})`,
            );
        }
    }

    function renderComponent(id: string, scopeData: unknown = data): string {
        const component = componentMap.get(id);
        if (!component) {
            throw new RendererError(`Component not found: ${id}`);
        }

        const type = extractComponentType(component);
        const props = resolveProps(extractComponentProps(component), scopeData, data);
        const explicitChildIds = (() => {
            if (typeof props.child === 'string') {
                return [props.child];
            }

            const children = props.children;
            if (!children || typeof children !== 'object' || Array.isArray(children)) {
                return childrenMap.get(id) ?? [];
            }

            const explicitList = (children as Record<string, unknown>).explicitList;
            if (Array.isArray(explicitList)) {
                return explicitList.filter((childId): childId is string => typeof childId === 'string');
            }

            return childrenMap.get(id) ?? [];
        })();
        const templateItems = resolveTemplateItems(props.children, scopeData);
        const childrenHtml = [
            ...explicitChildIds.map((childId) => renderComponent(childId, scopeData)),
            ...templateItems.map(({ componentId, itemData }) => renderComponent(componentId, itemData)),
        ].join('');

        const predicateMeta = predicateMap.get(id);
        const reactivityAttrs = buildReactivityAttrs(id, type, predicateMeta);

        const html = renderTag(type, id, props, childrenHtml, droppedMapOut);
        return injectReactivityAttrs(html, `id="${escHtml(id)}"`, reactivityAttrs);
    }

    // Render all root components (those with no parentId) in declaration order
    const roots = surface.components
        .filter((e) => e.parentId === undefined)
        .map((e) => e.id);

    return roots.map((id) => renderComponent(id)).join('');
}

/**
 * Validate predicates and build a space-prefixed data-* attribute string.
 * Throws RendererError for invalid shapes or enabledIf on non-interactive types.
 */
function buildReactivityAttrs(
    id: string,
    type: string,
    meta: { visibleIf?: unknown; enabledIf?: unknown } | undefined,
): string {
    if (!meta) {
        return '';
    }

    let attrs = '';

    if (meta.visibleIf !== undefined) {
        try {
            const pred = parsePredicate(meta.visibleIf);
            attrs += ` data-visible-if="${escHtml(serializePredicate(pred))}"`;
        } catch (err) {
            throw new RendererError(
                `Invalid visibleIf predicate for component "${id}": ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    if (meta.enabledIf !== undefined) {
        if (!INTERACTIVE_COMPONENT_TYPES.has(type)) {
            throw new RendererError(
                `enabledIf is only supported on interactive components (Button, TextField, Checkbox, Select). ` +
                `Component "${id}" has type "${type}".`,
            );
        }
        try {
            const pred = parsePredicate(meta.enabledIf);
            attrs += ` data-enabled-if="${escHtml(serializePredicate(pred))}"`;
        } catch (err) {
            throw new RendererError(
                `Invalid enabledIf predicate for component "${id}": ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    return attrs;
}

/**
 * Inject reactivity data-* attributes immediately after the id attribute
 * of the component root element. No-op when attrs is empty.
 */
function injectReactivityAttrs(html: string, idAttr: string, attrs: string): string {
    if (!attrs) {
        return html;
    }
    const idx = html.indexOf(idAttr);
    if (idx === -1) {
        return html;
    }
    const insertAt = idx + idAttr.length;
    return html.slice(0, insertAt) + attrs + html.slice(insertAt);
}
