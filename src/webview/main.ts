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
                return hljs.highlight(str, {
                    language: lang, ignoreIllegals: true
                }

                ).value;
            }

            catch (_) {
                // Fall through to default
            }
        }

        // Use auto-detection as fallback
        try {
            return hljs.highlightAuto(str).value;
        }

        catch (_) {
            // Fall through to default
        }

        return ''; // Use external default escaping
    }
}

);

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

        __STRINGS__: {
            noAttachments: string;
            remove: string;
            justNow: string;
            minutesAgo: string;
            hoursAgo: string;
            daysAgo: string;
        };
    }
}

window.renderMarkdown = renderMarkdown;

// Types
interface AttachmentInfo {
    id: string;
    name: string;
    uri: string;
}

interface RequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    attachments: AttachmentInfo[];
}

// Webview initialization
(function () {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();

    // State interface
    interface WebviewState {
        currentRequestId: string | null;
        currentAttachments: AttachmentInfo[];
        hasMultipleRequests: boolean;
    }

    // Restore state from previous session (if any)
    const previousState = vscode.getState() as WebviewState | undefined;
    let currentRequestId: string | null = previousState?.currentRequestId || null;
    let currentAttachments: AttachmentInfo[] = previousState?.currentAttachments || [];
    let hasMultipleRequests = previousState?.hasMultipleRequests || false;

    // Helper to save state
    function saveState(): void {
        vscode.setState({
            currentRequestId,
            currentAttachments,
            hasMultipleRequests
        } as WebviewState);
    }

    // DOM Elements
    const emptyState = document.getElementById('empty-state');
    const requestHeader = document.getElementById('request-header');
    const requestList = document.getElementById('request-list');
    const requestListItems = document.getElementById('request-list-items');
    const requestForm = document.getElementById('request-form');
    const questionContent = document.getElementById('question-content');
    const responseInput = document.getElementById('response-input') as HTMLTextAreaElement;
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const backBtn = document.getElementById('back-btn');
    const headerTitle = document.getElementById('header-title');
    const attachmentsList = document.getElementById('attachments-list');
    const addAttachmentBtn = document.getElementById('add-attachment-btn');

    /**
 * Show the list of pending requests
 */
    function showList(requests: RequestItem[]): void {
        hasMultipleRequests = requests.length > 1;
        saveState();

        if (requests.length === 0) {
            showEmpty();
            return;
        }

        // Hide other views
        emptyState?.classList.add('hidden');
        requestForm?.classList.add('hidden');
        requestHeader?.classList.add('hidden');

        // Show list
        requestList?.classList.remove('hidden');

        // Render list items
        if (requestListItems) {
            requestListItems.innerHTML = requests.map(req => `
                <div class="request-item" data-id="${req.id}" tabindex="0">
                    <div class="request-item-title">${escapeHtml(req.title)}</div>
                    <div class="request-item-preview">${escapeHtml(truncate(req.question, 100))}</div>
                    <div class="request-item-meta">${formatTime(req.createdAt)}</div>
                </div>
            `).join('');

            // Bind click events
            requestListItems.querySelectorAll('.request-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.getAttribute('data-id');

                    if (id) {
                        vscode.postMessage({
                            type: 'selectRequest', requestId: id
                        }

                        );
                    }
                }

                );

                item.addEventListener('keydown', (e: Event) => {
                    const keyEvent = e as KeyboardEvent;

                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                        e.preventDefault();
                        const id = (e.target as HTMLElement).getAttribute('data-id');

                        if (id) {
                            vscode.postMessage({
                                type: 'selectRequest', requestId: id
                            }

                            );
                        }
                    }
                }

                );
            }

            );
        }
    }

    /**
 * Show the question form and hide other views
 */
    function showQuestion(question: string, title: string, requestId: string): void {
        currentRequestId = requestId;
        saveState();

        // Set header title
        if (headerTitle) {
            headerTitle.textContent = title || 'Confirmation Required';
        }

        if (questionContent) {
            questionContent.innerHTML = renderMarkdown(question);
        }

        if (responseInput) {
            responseInput.value = '';
        }

        // Hide other views
        emptyState?.classList.add('hidden');
        requestList?.classList.add('hidden');

        // Show header and form
        requestHeader?.classList.remove('hidden');
        requestForm?.classList.remove('hidden');

        // Update attachments display
        updateAttachmentsDisplay();

        // Focus the textarea for immediate typing
        responseInput?.focus();
    }

    /**
 * Show empty state
 */
    function showEmpty(): void {
        currentRequestId = null;
        hasMultipleRequests = false;
        currentAttachments = [];
        saveState();

        emptyState?.classList.remove('hidden');
        requestForm?.classList.add('hidden');
        requestList?.classList.add('hidden');
        requestHeader?.classList.add('hidden');

        if (responseInput) {
            responseInput.value = '';
        }
    }

    /**
 * Update attachments display
 */
    function updateAttachmentsDisplay(): void {
        if (!attachmentsList) return;

        if (currentAttachments.length === 0) {
            attachmentsList.innerHTML = `<p class="no-attachments">${window.__STRINGS__?.noAttachments || 'No attachments'}</p>`;
        } else {
            attachmentsList.innerHTML = currentAttachments.map(att => `
                <div class="attachment-item" data-id="${att.id}">
                    <span class="attachment-icon"><span class="codicon codicon-${getFileIcon(att.name)}"></span></span>
                    <span class="attachment-name">${escapeHtml(att.name)}</span>
                    <button class="btn-remove" data-remove="${att.id}" title="${window.__STRINGS__?.remove || 'Remove'}">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
            `).join('');

            // Bind remove buttons
            attachmentsList.querySelectorAll('.btn-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const attId = (btn as HTMLElement).getAttribute('data-remove');

                    if (attId && currentRequestId) {
                        vscode.postMessage({
                            type: 'removeAttachment',
                            requestId: currentRequestId,
                            attachmentId: attId
                        });
                    }
                });
            }

            );
        }
    }

    /**
 * Handle submit button click
 */
    function handleSubmit(): void {
        const response = responseInput?.value.trim() || '';

        if (currentRequestId) {
            vscode.postMessage({
                type: 'submit',
                response: response,
                requestId: currentRequestId,
                attachments: currentAttachments
            }

            );
        }

        currentAttachments = [];
        showEmpty();
    }

    /**
 * Handle cancel button click
 */
    function handleCancel(): void {
        if (currentRequestId) {
            vscode.postMessage({
                type: 'cancel',
                requestId: currentRequestId
            }

            );
        }

        currentAttachments = [];
        showEmpty();
    }

    /**
 * Handle back button click
 */
    function handleBack(): void {
        vscode.postMessage({
            type: 'backToList'
        }

        );
    }

    /**
 * Handle add attachment button click
 */
    function handleAddAttachment(): void {
        if (currentRequestId) {
            vscode.postMessage({
                type: 'addAttachment',
                requestId: currentRequestId
            }

            );
        }
    }

    // Utility functions
    function escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function truncate(str: string, maxLen: number): string {
        if (str.length <= maxLen) return str;
        return str.substring(0, maxLen) + '...';
    }

    function formatTime(timestamp: number): string {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const strings = window.__STRINGS__;
        if (minutes < 1) return strings?.justNow || 'just now';
        if (minutes < 60) return (strings?.minutesAgo || '{0}m ago').replace('{0}', String(minutes));
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return (strings?.hoursAgo || '{0}h ago').replace('{0}', String(hours));
        return (strings?.daysAgo || '{0}d ago').replace('{0}', String(Math.floor(hours / 24)));
    }

    /**
 * Get Codicon icon name for a file based on its extension
 */
    function getFileIcon(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() || '';

        const iconMap: Record<string, string> = {
            // TypeScript/JavaScript
            'ts': 'file-code',
            'tsx': 'file-code',
            'js': 'file-code',
            'jsx': 'file-code',
            'mjs': 'file-code',
            'cjs': 'file-code',
            // Python
            'py': 'file-code',
            'pyw': 'file-code',
            'pyx': 'file-code',
            // Web
            'html': 'file-code',
            'htm': 'file-code',
            'css': 'file-code',
            'scss': 'file-code',
            'sass': 'file-code',
            'less': 'file-code',
            // Data
            'json': 'json',
            'yaml': 'file-code',
            'yml': 'file-code',
            'xml': 'file-code',
            'csv': 'file-code',
            // Config
            'env': 'gear',
            'config': 'gear',
            'cfg': 'gear',
            'ini': 'gear',
            'toml': 'gear',
            // Docs
            'md': 'markdown',
            'mdx': 'markdown',
            'txt': 'file-text',
            'pdf': 'file-pdf',
            // Images
            'png': 'file-media',
            'jpg': 'file-media',
            'jpeg': 'file-media',
            'gif': 'file-media',
            'svg': 'file-media',
            'ico': 'file-media',
            'webp': 'file-media',
            // Other languages
            'java': 'file-code',
            'c': 'file-code',
            'cpp': 'file-code',
            'h': 'file-code',
            'hpp': 'file-code',
            'cs': 'file-code',
            'go': 'file-code',
            'rs': 'file-code',
            'rb': 'file-code',
            'php': 'file-code',
            'swift': 'file-code',
            'kt': 'file-code',
            'scala': 'file-code',
            'sh': 'terminal',
            'bash': 'terminal',
            'zsh': 'terminal',
            'ps1': 'terminal',
            'bat': 'terminal',
            'cmd': 'terminal',
            // Archives
            'zip': 'file-zip',
            'tar': 'file-zip',
            'gz': 'file-zip',
            'rar': 'file-zip',
            '7z': 'file-zip',
        }

            ;
        return iconMap[ext] || 'file';
    }

    // Event Listeners
    submitBtn?.addEventListener('click', handleSubmit);
    cancelBtn?.addEventListener('click', handleCancel);
    backBtn?.addEventListener('click', handleBack);
    addAttachmentBtn?.addEventListener('click', handleAddAttachment);

    // Handle Enter key in textarea (Enter to submit, Ctrl+Enter for new line)
    responseInput?.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
            if (event.ctrlKey || event.shiftKey) {
                // Ctrl+Enter or Shift+Enter: insert new line (let default behavior)
                return;
            }
            // Enter alone: submit
            event.preventDefault();
            handleSubmit();
        }
    });

    // Listen for messages from the Extension Host
    window.addEventListener('message', (event: MessageEvent) => {
        const message = event.data;

        switch (message.type) {
            case 'showQuestion': showQuestion(message.question, message.title, message.requestId);
                break;
            case 'showList': showList(message.requests);
                break;

            case 'updateAttachments': if (message.requestId === currentRequestId) {
                currentAttachments = message.attachments || [];
                updateAttachmentsDisplay();
                saveState();
            }

                break;
            case 'clear': showEmpty();
                break;
        }
    }

    );
}

)();

// Type declaration for VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

    ;