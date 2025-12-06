// Agent Console Webview Script with markdown-it and highlight.js
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';

// Register only the languages we need
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import csharp from 'highlight.js/lib/languages/csharp';
import java from 'highlight.js/lib/languages/java';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml'; // for HTML
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);

// Configure markdown-it with highlight.js
const md = new MarkdownIt({
    html: false, // Disable HTML for security
    linkify: true,
    typographer: true,
    highlight: function (str: string, lang: string): string {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
            } catch (_) {
                // Fall through to default
            }
        }
        // Use auto-detection as fallback
        try {
            return hljs.highlightAuto(str).value;
        } catch (_) {
            // Fall through to default
        }
        return ''; // Use external default escaping
    }
});

/**
 * Render markdown content to HTML
 * @param content - Markdown content to render
 * @returns HTML string
 */
export function renderMarkdown(content: string): string {
    if (!content) return '';
    return md.render(content);
}

// Expose to window for global access in webview
declare global {
    interface Window {
        renderMarkdown: typeof renderMarkdown;
    }
}
window.renderMarkdown = renderMarkdown;

// Webview initialization
(function() {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();
    
    // DOM Elements
    const emptyState = document.getElementById('empty-state');
    const requestForm = document.getElementById('request-form');
    const questionTitle = document.getElementById('question-title');
    const questionContent = document.getElementById('question-content');
    const responseInput = document.getElementById('response-input') as HTMLTextAreaElement;
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    
    /**
     * Show the question form and hide empty state
     * @param question - The question to display (supports Markdown)
     * @param title - The title for the question
     */
    function showQuestion(question: string, title?: string): void {
        if (questionTitle) {
            questionTitle.textContent = title || 'Confirmation Required';
        }
        if (questionContent) {
            questionContent.innerHTML = renderMarkdown(question);
        }
        if (responseInput) {
            responseInput.value = '';
        }
        
        if (emptyState) {
            emptyState.classList.add('hidden');
        }
        if (requestForm) {
            requestForm.classList.remove('hidden');
        }
        
        // Focus the textarea for immediate typing
        responseInput?.focus();
    }
    
    /**
     * Clear the form and show empty state
     */
    function clearForm(): void {
        if (requestForm) {
            requestForm.classList.add('hidden');
        }
        if (emptyState) {
            emptyState.classList.remove('hidden');
        }
        if (responseInput) {
            responseInput.value = '';
        }
    }
    
    /**
     * Handle submit button click
     */
    function handleSubmit(): void {
        const response = responseInput?.value.trim() || '';
        vscode.postMessage({
            type: 'submit',
            response: response
        });
        clearForm();
    }
    
    /**
     * Handle cancel button click
     */
    function handleCancel(): void {
        vscode.postMessage({
            type: 'cancel'
        });
        clearForm();
    }
    
    // Event Listeners
    submitBtn?.addEventListener('click', handleSubmit);
    cancelBtn?.addEventListener('click', handleCancel);
    
    // Handle Enter key in textarea (Ctrl+Enter to submit)
    responseInput?.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            handleSubmit();
        }
    });
    
    // Listen for messages from the Extension Host
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;
        
        switch (message.type) {
            case 'showQuestion':
                showQuestion(message.question, message.title);
                break;
            case 'clear':
                clearForm();
                break;
        }
    });
})();

// Type declaration for VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
