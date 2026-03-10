import mermaid from 'mermaid';

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

type FormFieldElement = HTMLInputElement | HTMLSelectElement;

const vscode = acquireVsCodeApi();

function collectFormData(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    document.querySelectorAll<FormFieldElement>('[data-field]').forEach((element) => {
        const field = element.dataset.field;
        if (!field) {
            return;
        }

        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            data[field] = element.checked;
            return;
        }

        data[field] = element.value;
    });
    return data;
}

function clearValidationErrors(): void {
    document.querySelectorAll('.a2ui-field, .a2ui-checkbox-label').forEach((container) => {
        container.classList.remove('a2ui-invalid');
    });
    document.querySelectorAll('.a2ui-field-error').forEach((element) => {
        element.remove();
    });
}

function appendValidationError(container: Element, message: string): void {
    container.classList.add('a2ui-invalid');
    const error = document.createElement('span');
    error.className = 'a2ui-field-error';
    error.textContent = message;
    container.appendChild(error);
}

function validateRequiredFields(): boolean {
    clearValidationErrors();

    let isValid = true;
    document.querySelectorAll<FormFieldElement>('[data-field][required]').forEach((element) => {
        const container = element.closest('.a2ui-field, .a2ui-checkbox-label');
        if (!container) {
            return;
        }

        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
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

async function renderMermaidDiagrams(): Promise<void> {
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        logLevel: 'fatal',
    });

    const diagrams = Array.from(document.querySelectorAll<HTMLElement>('.a2ui-mermaid'));
    await Promise.all(diagrams.map(async (diagram, index) => {
        const target = diagram.querySelector<HTMLElement>('.a2ui-mermaid-target');
        const source = diagram.querySelector<HTMLElement>('.a2ui-mermaid-source code');
        const details = diagram.querySelector<HTMLElement>('.a2ui-mermaid-details');
        if (!target || !source) {
            return;
        }

        const definition = source.textContent ?? '';
        if (!definition.trim()) {
            return;
        }

        try {
            const { svg } = await mermaid.render(`a2ui_mermaid_${index}`, definition);
            target.innerHTML = svg;
            diagram.dataset.rendered = 'true';
        } catch (error) {
            target.innerHTML = `<div class="a2ui-mermaid-error">Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}</div>`;
            if (details instanceof HTMLDetailsElement) {
                details.open = true;
            }
            diagram.dataset.rendered = 'error';
        }
    }));
}

function attachActionHandlers(): void {
    document.addEventListener('click', (event) => {
        const button = event.target instanceof Element
            ? event.target.closest<HTMLButtonElement>('button.a2ui-button')
            : null;
        if (!button || button.disabled) {
            return;
        }

        const action = button.dataset.action;
        if (!action) {
            return;
        }

        if (!validateRequiredFields()) {
            return;
        }

        vscode.postMessage({
            type: 'userAction',
            name: action,
            data: collectFormData(),
        });
    });
}

void renderMermaidDiagrams();
attachActionHandlers();