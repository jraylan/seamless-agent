import mermaid from 'mermaid';
import { parsePredicate, evaluatePredicate } from './reactivity';
import type { A2UIPredicate } from './reactivity';
import type { A2UIRenderIssue } from './types';

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

type FormFieldElement = HTMLInputElement | HTMLSelectElement;
type PredicateAttributeName = 'data-visible-if' | 'data-enabled-if';
type VsCodeApi = { postMessage(message: unknown): void };

// ---------------------------------------------------------------------------
// Pure DOM helpers (accept `doc` for testability)
// ---------------------------------------------------------------------------

function isCheckboxElement(doc: Document, element: Element): element is HTMLInputElement {
    const view = doc.defaultView;
    return Boolean(view && element instanceof view.HTMLInputElement && element.type === 'checkbox');
}

function isDetailsElement(doc: Document, element: Element | null): element is HTMLDetailsElement {
    const view = doc.defaultView;
    return Boolean(view && element instanceof view.HTMLDetailsElement);
}

function isDomElement(doc: Document, value: unknown): value is Element {
    const view = doc.defaultView;
    return Boolean(view && value instanceof view.Element);
}

function getPredicateErrorAttribute(attributeName: PredicateAttributeName): string {
    return attributeName === 'data-visible-if' ? 'data-visible-if-error' : 'data-enabled-if-error';
}

function createPredicateIssue(rootEl: HTMLElement, attributeName: PredicateAttributeName, error: unknown): A2UIRenderIssue {
    const componentId = rootEl.id || undefined;
    const suffix = componentId ? ` on component "${componentId}"` : '';
    const detail = error instanceof Error ? error.message : String(error);
    return {
        source: 'webview',
        componentId,
        message: `Invalid ${attributeName} predicate${suffix}: ${detail}`,
    };
}

function parsePredicateAttribute(
    rootEl: HTMLElement,
    attributeName: PredicateAttributeName,
    issues: A2UIRenderIssue[],
): A2UIPredicate | undefined {
    const raw = rootEl.getAttribute(attributeName);
    if (!raw) {
        rootEl.removeAttribute(getPredicateErrorAttribute(attributeName));
        return undefined;
    }

    try {
        const predicate = parsePredicate(JSON.parse(raw));
        rootEl.removeAttribute(getPredicateErrorAttribute(attributeName));
        return predicate;
    } catch (error) {
        const issue = createPredicateIssue(rootEl, attributeName, error);
        rootEl.setAttribute(getPredicateErrorAttribute(attributeName), issue.message);
        issues.push(issue);
        console.error(`[A2UI] ${issue.message}`, error);
        return undefined;
    }
}

/**
 * Collect ALL field values (including hidden/disabled) for reactivity evaluation.
 * This is deliberately inclusive so predicate logic has full field state.
 */
export function collectAllFieldState(doc: Document): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    doc.querySelectorAll<FormFieldElement>('[data-field]').forEach((element) => {
        const field = element.dataset['field'];
        if (!field) return;

        if (isCheckboxElement(doc, element)) {
            data[field] = element.checked;
            return;
        }

        data[field] = element.value;
    });
    return data;
}

/**
 * Returns true when the element is inside a reactivity-hidden component root.
 * Uses the `data-reactive-hidden` marker attribute set by `applyReactivity`.
 */
export function isFieldHidden(element: Element): boolean {
    return element.closest('[data-reactive-hidden]') !== null;
}

/**
 * Collect field values for submission, excluding fields that are hidden or disabled.
 */
export function collectSubmittableFormData(doc: Document): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    doc.querySelectorAll<FormFieldElement>('[data-field]').forEach((element) => {
        const field = element.dataset['field'];
        if (!field) return;
        if (isFieldHidden(element) || element.disabled) return;

        if (isCheckboxElement(doc, element)) {
            data[field] = element.checked;
            return;
        }

        data[field] = element.value;
    });
    return data;
}

/**
 * Clear any previously appended validation error markers.
 */
function clearValidationErrors(doc: Document): void {
    doc.querySelectorAll('.a2ui-field, .a2ui-checkbox-label').forEach((container) => {
        container.classList.remove('a2ui-invalid');
    });
    doc.querySelectorAll('.a2ui-field-error').forEach((el) => el.remove());
}

function appendValidationError(container: Element, message: string): void {
    container.classList.add('a2ui-invalid');
    const error = container.ownerDocument.createElement('span');
    error.className = 'a2ui-field-error';
    error.textContent = message;
    container.appendChild(error);
}

/**
 * Validate required fields, skipping those that are hidden or disabled.
 * Returns true when all visible/enabled required fields pass validation.
 */
export function validateRequiredFields(doc: Document): boolean {
    clearValidationErrors(doc);

    let isValid = true;
    doc.querySelectorAll<FormFieldElement>('[data-field][required]').forEach((element) => {
        if (isFieldHidden(element) || element.disabled) return;

        const container = element.closest('.a2ui-field, .a2ui-checkbox-label');
        if (!container) return;

        if (isCheckboxElement(doc, element)) {
            if (!element.checked) {
                appendValidationError(container, 'This field is required.');
                isValid = false;
            }
            return;
        }

        if (!element.value.trim()) {
            appendValidationError(container, 'This field is required.');
            isValid = false;
        }
    });

    return isValid;
}

/**
 * Evaluate all `data-visible-if` and `data-enabled-if` predicates and update
 * component visibility / interactive-element enabled state accordingly.
 *
 * Visibility is controlled by the `hidden` attribute + `data-reactive-hidden`
 * marker on the component root element (the one carrying `data-visible-if`).
 *
 * Enabled state is controlled by the `disabled` property on the interactive
 * element: for Button that is the root itself; for TextField/Checkbox/Select
 * it is the child element carrying `data-field`.
 */
export function applyReactivity(doc: Document): A2UIRenderIssue[] {
    const fieldState = collectAllFieldState(doc);
    const issues: A2UIRenderIssue[] = [];

    // visibleIf
    doc.querySelectorAll<HTMLElement>('[data-visible-if]').forEach((rootEl) => {
        const predicate = parsePredicateAttribute(rootEl, 'data-visible-if', issues);
        if (!predicate) return;

        const visible = evaluatePredicate(predicate, fieldState);
        rootEl.hidden = !visible;
        if (!visible) {
            rootEl.setAttribute('data-reactive-hidden', '');
        } else {
            rootEl.removeAttribute('data-reactive-hidden');
        }
    });

    // enabledIf
    doc.querySelectorAll<HTMLElement>('[data-enabled-if]').forEach((rootEl) => {
        const predicate = parsePredicateAttribute(rootEl, 'data-enabled-if', issues);
        if (!predicate) return;

        const enabled = evaluatePredicate(predicate, fieldState);
        // Interactive element is either the root itself (button) or a child with data-field.
        const interactive = (rootEl.querySelector('[data-field]') ?? rootEl) as HTMLButtonElement | HTMLInputElement | HTMLSelectElement;
        interactive.disabled = !enabled;
    });

    return issues;
}

// ---------------------------------------------------------------------------
// Mermaid rendering (browser-only)
// ---------------------------------------------------------------------------

async function renderMermaidDiagrams(doc: Document): Promise<void> {
    // Check if mermaid is available
    if (typeof mermaid === 'undefined') {
        console.error('[A2UI] Mermaid library not loaded');
        return;
    }

    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        logLevel: 'fatal',
    });

    const diagrams = Array.from(doc.querySelectorAll<HTMLElement>('.a2ui-mermaid'));
    console.log('[A2UI] Found Mermaid diagrams:', diagrams.length);

    await Promise.all(diagrams.map(async (diagram, index) => {
        const target = diagram.querySelector<HTMLElement>('.a2ui-mermaid-target');
        const source = diagram.querySelector<HTMLElement>('.a2ui-mermaid-source');
        const details = diagram.querySelector<HTMLElement>('.a2ui-mermaid-details');
        if (!target || !source) {
            console.warn('[A2UI] Mermaid diagram missing target or source element');
            return;
        }

        const definition = source.textContent ?? '';
        if (!definition.trim()) {
            console.warn('[A2UI] Mermaid diagram has empty definition');
            return;
        }

        console.log('[A2UI] Rendering Mermaid diagram:', index, definition.substring(0, 50));

        try {
            const { svg } = await mermaid.render(`a2ui_mermaid_${index}`, definition);
            target.innerHTML = svg;
            diagram.dataset['rendered'] = 'true';
            console.log('[A2UI] Mermaid diagram rendered successfully:', index);
        } catch (error) {
            console.error('[A2UI] Failed to render Mermaid diagram:', error);
            target.innerHTML = `<div class="a2ui-mermaid-error">Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}</div>`;
            if (isDetailsElement(doc, details)) {
                (details as HTMLDetailsElement).open = true;
            }
            diagram.dataset['rendered'] = 'error';
        }
    }));
}

// ---------------------------------------------------------------------------
// Action handlers (browser-only)
// ---------------------------------------------------------------------------

export function attachActionHandlers(doc: Document, vsCodeApi: VsCodeApi): void {
    doc.addEventListener('click', (event) => {
        const button = isDomElement(doc, event.target)
            ? event.target.closest<HTMLButtonElement>('button.a2ui-button')
            : null;
        if (!button || button.disabled) return;

        const action = button.dataset['action'];
        if (!action) return;

        if (!validateRequiredFields(doc)) return;

        vsCodeApi.postMessage({
            type: 'userAction',
            name: action,
            data: collectSubmittableFormData(doc),
        });
    });

    doc.addEventListener('input', (event) => {
        if (isDomElement(doc, event.target) && event.target.closest('[data-field]')) {
            applyReactivity(doc);
        }
    });

    doc.addEventListener('change', (event) => {
        if (isDomElement(doc, event.target) && event.target.closest('[data-field]')) {
            applyReactivity(doc);
        }
    });
}

// ---------------------------------------------------------------------------
// Browser bootstrap – guarded so module can be imported in Node tests
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
    const vscode = acquireVsCodeApi();
    // Wait for DOM to be ready before rendering
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyReactivity(document);
            attachActionHandlers(document, vscode);
            void renderMermaidDiagrams(document);
        });
    } else {
        // DOM is already ready
        applyReactivity(document);
        attachActionHandlers(document, vscode);
        void renderMermaidDiagrams(document);
    }
}
