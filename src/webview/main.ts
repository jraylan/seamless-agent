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
                }).value;
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

        __STRINGS__: {
            cspSource: string;
            nonce: string;
            styleUri: string;
            highlightStyleUri: string;
            codiconsUri: string;
            scriptUri: string;
            consoleTitle: string;
            back: string;
            noPendingRequests: string;
            noPendingItems: string;
            pendingItems: string;
            pendingRequests: string;
            yourResponse: string;
            inputPlaceholder: string;
            attachments: string;
            noAttachments: string;
            addAttachment: string;
            pastedImage: string;
            submit: string;
            close: string;
            cancel: string;
            remove: string;
            justNow: string;
            minutesAgo: string;
            hoursAgo: string;
            daysAgo: string;
            selectFile: string;
            noFilesFound: string;
            dropImageHere: string;
            // Session histors
            recentSessions: string;
            noRecentSessions: string;
            clearHistory: string;
            sessionInput: string;
            sessionOutput: string;
            input: string;
            output: string;
            addFolder: string;
            // Chat histors
            pendingReviews: string;
            noPendingReviews: string;
            chatHistory: string;
            noChats: string;
            openInPanel: string;
            deleteChat: string;
            approved: string;
            rejected: string;
            pending: string;
            acknowledged: string;
            cancelled: string;
            question: string;
            response: string;
            noResponse: string;
            // History filtes
            historyFilterAll: string;
            historyFilterAskUser: string;
            historyFilterPlanReview: string;
            // Batch selection
            batchSelectMode: string;
            batchExitSelectMode: string;
            batchSelectAll: string;
            batchDeselectAll: string;
            batchDeleteSelected: string;
            batchSelectedCount: string;
            confirmDeleteSelected: string;
            // Options
            orTypeYourOwn: string;
            options: string;
        };
        __CONFIG__: {
            historyTimeDisplay: 'relative' | 'absolute' | 'hybrid';
        };
    }
}

window.renderMarkdown = renderMarkdown;

// Types (centralized)
import type {
    AttachmentInfo,
    RequestItem,
    FileSearchResult,
    ToolCallInteraction,
    RequiredPlanRevisions,
    StoredInteraction
} from './types';
import { truncate } from './utils';

// Webview initialization
(function () {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();

    // State
    let currentRequestId: string | null = null;
    let currentAttachments: AttachmentInfo[] = [];
    let currentInteractionId: string | null = null;
    const draftResponses = new Map<string, string>();

    // Active options stepper instance (for pending request form)
    let activeOptionsStepper: OptionsStepper | null = null;

    // Autocomplete state
    let autocompleteVisible = false;
    let autocompleteResults: FileSearchResult[] = [];
    let selectedAutocompleteIndex = -1;
    let autocompleteQuery = '';
    let autocompleteStartPos = -1;
    let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // IME composition state - prevents scroll issues on Windows during IME input
    let isComposing = false;

    // DOM Elements
    const homeView = document.getElementById('home-view');
    const pendingPlaceholder = document.getElementById('pending-placeholder');
    const pendingRequestsList = document.getElementById('pending-requests-list');
    const pendingReviewsList = document.getElementById('pending-reviews-list');
    const historyList = document.getElementById('history-list');
    const interactionDetailView = document.getElementById('interaction-detail-view');
    const recentInteractionsList = document.getElementById('recent-interactions-list');
    const requestHeader = document.getElementById('request-header');
    const requestList = document.getElementById('request-list');
    const requestForm = document.getElementById('request-form');
    const questionContent = document.getElementById('question-content');
    const responseInput = document.getElementById('response-input') as HTMLTextAreaElement;
    const submitBtn = document.getElementById('submit-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const srAnnounce = document.getElementById('sr-announce');
    const optionsContainer = document.getElementById('options-container');

    // Tab content elements
    const contentPending = document.getElementById('content-pending');
    const contentHistory = document.getElementById('content-history');

    // Batch selection elements
    const batchSelectBtn = document.getElementById('batch-select-btn');
    const batchActionsBar = document.getElementById('batch-actions-bar');
    const batchSelectedCount = document.getElementById('batch-selected-count');
    const batchSelectAllBtn = document.getElementById('batch-select-all-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const batchCancelBtn = document.getElementById('batch-cancel-btn');
    const historyClearBtn = document.getElementById('history-clear-btn');

    // Batch selection state
    let batchSelectMode = false;
    let selectedInteractionIds: Set<string> = new Set();

    // History filter state
    let currentHistoryFilter: string = 'all';

    type HomeTab = 'pending' | 'history';

    function setHomeToolbarActiveTab(tab: HomeTab): void {
        document.querySelectorAll('.home-toolbar-btn[data-tab]').forEach(btn => {
            const btnTab = btn.getAttribute('data-tab') as HomeTab | null;
            const isActive = btnTab === tab;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function formatBadgeCount(count: number): string {
        if (count > 99) return '99+';
        return String(count);
    }

    function setHomeToolbarBadge(kind: 'pending' | 'history', count: number): void {
        const el = document.querySelector(`.home-toolbar-badge[data-badge-for="${kind}"]`) as HTMLElement | null;
        if (!el) return;

        if (count <= 0) {
            el.textContent = '';
            el.classList.add('hidden');
            return;
        }

        el.textContent = formatBadgeCount(count);
        el.classList.remove('hidden');
    }

    function setHomeToolbarLabelWithCount(tab: HomeTab, count: number): void {
        const btn = document.querySelector(`.home-toolbar-btn[data-tab="${tab}"]`) as HTMLElement | null;
        if (!btn) return;

        const base = btn.getAttribute('data-label') || btn.getAttribute('aria-label') || '';

        const withCount = count > 0 ? `${base} (${count})` : base;
        btn.setAttribute('title', withCount);
        btn.setAttribute('aria-label', withCount);
    }

    function updateHomeToolbarBadgesFromDom(): void {
        const pendingRequestsCount = pendingRequestsList ? pendingRequestsList.querySelectorAll('.request-item').length : 0;

        const pendingReviewsCount = pendingReviewsList ? pendingReviewsList.querySelectorAll('.pending-review-item').length : 0;

        const pendingCount = pendingRequestsCount + pendingReviewsCount;
        const historyCount = historyList ? historyList.querySelectorAll('.history-item').length : 0;

        // Keep UI minimal: numeric badge only for pending.
        setHomeToolbarBadge('pending', pendingCount);
        setHomeToolbarBadge('history', 0);

        // Still expose counts via tooltip/aria without changing layout.
        setHomeToolbarLabelWithCount('pending', pendingCount);
        setHomeToolbarLabelWithCount('history', historyCount);
    }

    function initHomeToolbar(): void {
        document.querySelectorAll('.home-toolbar-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = (btn.getAttribute('data-tab') || 'pending') as HomeTab;
                switchTab(tab);
            });
        });
    }

    /**
 * Apply filter to history items
 */
    function applyHistoryFilter(filter: string): void {
        currentHistoryFilter = filter;

        // Update button active states (only filter buttons, not batch select)
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
        });

        // Show/hide history items based on filter
        if (historyList) {
            historyList.querySelectorAll('.history-item').forEach(item => {
                const type = item.getAttribute('data-type') || '';
                let show = false;

                if (filter === 'all') {
                    show = true;
                }

                else if (filter === 'ask_user') {
                    show = type === 'ask_user';
                }

                else if (filter === 'plan_review') {
                    show = type === 'plan_review';
                }

                (item as HTMLElement).style.display = show ? '' : 'none';
            });
        }
    }

    /**
     * Toggle batch selection mode
     */
    function toggleBatchSelectMode(enable?: boolean): void {
        batchSelectMode = enable !== undefined ? enable : !batchSelectMode;

        if (batchSelectMode) {
            batchActionsBar?.classList.remove('hidden');
            historyList?.querySelectorAll('.history-item').forEach(item => {
                item.classList.add('batch-mode');
            });
        } else {
            batchActionsBar?.classList.add('hidden');
            selectedInteractionIds.clear();
            historyList?.querySelectorAll('.history-item').forEach(item => {
                item.classList.remove('batch-mode', 'selected');
            });
        }

        updateBatchSelectionUI();
    }

    /**
     * Toggle selection of a single item
     */
    function toggleItemSelection(id: string, element: HTMLElement): void {
        if (selectedInteractionIds.has(id)) {
            selectedInteractionIds.delete(id);
            element.classList.remove('selected');
        } else {
            selectedInteractionIds.add(id);
            element.classList.add('selected');
        }
        updateBatchSelectionUI();
    }

    /**
     * Select or deselect all visible items
     */
    function toggleSelectAll(): void {
        const visibleItems = historyList?.querySelectorAll('.history-item:not([style*="display: none"])') || [];
        const allSelected = Array.from(visibleItems).every(item => {
            const id = item.getAttribute('data-id');
            return id && selectedInteractionIds.has(id);
        });

        visibleItems.forEach(item => {
            const id = item.getAttribute('data-id');
            if (!id) return;

            if (allSelected) {
                selectedInteractionIds.delete(id);
                item.classList.remove('selected');
            } else {
                selectedInteractionIds.add(id);
                item.classList.add('selected');
            }
        });

        updateBatchSelectionUI();
    }

    /**
     * Update batch selection UI (count display, button states)
     */
    function updateBatchSelectionUI(): void {
        const count = selectedInteractionIds.size;
        const countText = window.__STRINGS__?.batchSelectedCount?.replace('{count}', count.toString()) || `${count} selected`;

        if (batchSelectedCount) {
            batchSelectedCount.textContent = countText;
        }

        if (batchDeleteBtn) {
            (batchDeleteBtn as HTMLButtonElement).disabled = count === 0;
        }

        // Update select all button icon based on state
        const visibleItems = historyList?.querySelectorAll('.history-item:not([style*="display: none"])') || [];
        const allSelected = visibleItems.length > 0 && Array.from(visibleItems).every(item => {
            const id = item.getAttribute('data-id');
            return id && selectedInteractionIds.has(id);
        });

        if (batchSelectAllBtn) {
            const icon = batchSelectAllBtn.querySelector('.codicon');
            if (icon) {
                icon.className = allSelected ? 'codicon codicon-close-all' : 'codicon codicon-check-all';
            }
            batchSelectAllBtn.title = allSelected
                ? (window.__STRINGS__?.batchDeselectAll || 'Deselect all')
                : (window.__STRINGS__?.batchSelectAll || 'Select all');
        }
    }

    /**
     * Delete selected items
     */
    function deleteSelectedItems(): void {
        if (selectedInteractionIds.size === 0) return;

        // Send to extension host - confirmation is handled there via VS Code modal
        vscode.postMessage({
            type: 'deleteMultipleInteractions',
            interactionIds: Array.from(selectedInteractionIds)
        });

        toggleBatchSelectMode(false);
    }

    /**
     * Initialize batch selection event handlers
     */
    function initBatchSelection(): void {
        batchSelectBtn?.addEventListener('click', () => toggleBatchSelectMode());
        batchSelectAllBtn?.addEventListener('click', () => toggleSelectAll());
        batchDeleteBtn?.addEventListener('click', () => deleteSelectedItems());
        batchCancelBtn?.addEventListener('click', () => toggleBatchSelectMode(false));
    }

    /**
 * Initialize history filter buttons
 */
    function initHistoryFilters(): void {
        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter') || 'all';
                applyHistoryFilter(filter);
            });
        });
    }

    function initHistoryActions(): void {
        historyClearBtn?.addEventListener('click', () => {
            vscode.postMessage({
                type: 'clearHistory'
            });
        });
    }

    /**
     * Initialize delegated event handlers for pending items (requests + reviews)
     * This handles delete button clicks without losing handlers during re-renders
     */
    function initPendingItemsDelegation(): void {
        // Handle pending requests list
        if (pendingRequestsList) {
            // Use capture phase to intercept delete clicks BEFORE inline listeners
            pendingRequestsList.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;

                // Delete button takes precedence
                const deleteBtn = target.closest('.pending-item-delete') as HTMLElement | null;

                if (deleteBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    const id = deleteBtn.getAttribute('data-id');
                    if (!id) return;

                    vscode.postMessage({
                        type: 'cancelPendingRequest',
                        requestId: id
                    });

                    return;
                }

                // Allow normal request selection to happen (handled by inline listeners)
            }, true); // Use capture phase
        }

        // Handle pending reviews list
        if (pendingReviewsList) {
            // Use capture phase to intercept delete clicks BEFORE inline listeners
            pendingReviewsList.addEventListener('click', (e: Event) => {
                const target = e.target as HTMLElement;

                // Delete button takes precedence
                const deleteBtn = target.closest('.pending-item-delete') as HTMLElement | null;

                if (deleteBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    const id = deleteBtn.getAttribute('data-id');
                    if (!id) return;

                    vscode.postMessage({
                        type: 'cancelPendingRequest',
                        requestId: id
                    });

                    return;
                }

                // Allow normal review selection to happen (handled by inline listeners)
            }, true); // Use capture phase
        }
    }

    /**
 * Bind a single delegated handler for history list interactions.
 * This avoids losing per-item handlers when the list is re-rendered via innerHTML.
 */
    function initHistoryListDelegation(): void {
        if (!historyList) return;

        historyList.addEventListener('click', (e: Event) => {
            const target = e.target as HTMLElement;

            // Delete button takes precedence
            const deleteBtn = target.closest('.history-item-delete') as HTMLElement | null;

            if (deleteBtn) {
                e.stopPropagation();
                const id = deleteBtn.getAttribute('data-id');
                if (!id) return;

                vscode.postMessage({
                    type: 'deleteInteraction', interactionId: id
                });

                return;
            }

            // View button (magnifier) - opens item even in batch mode
            const viewBtn = target.closest('.history-item-view') as HTMLElement | null;

            if (viewBtn) {
                e.stopPropagation();
                const item = viewBtn.closest('.history-item') as HTMLElement | null;
                if (!item) return;

                const id = item.getAttribute('data-id');
                const type = item.getAttribute('data-type');
                if (!id) return;

                if (type === 'plan_review') {
                    vscode.postMessage({
                        type: 'openPlanReviewPanel', interactionId: id
                    });
                } else {
                    vscode.postMessage({
                        type: 'selectInteraction', interactionId: id
                    });
                }

                return;
            }

            const item = target.closest('.history-item') as HTMLElement | null;
            if (!item) return;

            const id = item.getAttribute('data-id');
            const type = item.getAttribute('data-type');
            if (!id) return;

            // In batch mode, clicking the item toggles selection
            if (batchSelectMode) {
                toggleItemSelection(id, item);
                return;
            }

            // Normal mode: open the item
            if (type === 'plan_review') {
                vscode.postMessage({
                    type: 'openPlanReviewPanel', interactionId: id
                });
            }

            else {
                vscode.postMessage({
                    type: 'selectInteraction', interactionId: id
                });
            }
        });

        historyList.addEventListener('keydown', (e: Event) => {
            const keyEvent = e as KeyboardEvent;
            if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;

            const target = e.target as HTMLElement;
            const item = target.closest('.history-item') as HTMLElement | null;
            if (!item) return;

            keyEvent.preventDefault();
            (item as HTMLElement).click();
        });
    }

    /**
 * Announce a message to screen readers via the live region
 * @param message The message to announce
 */
    function announceToScreenReader(message: string): void {
        if (srAnnounce) {
            // Clear and set text to trigger announcement
            srAnnounce.textContent = '';

            // Use setTimeout to ensure the DOM change is detected
            setTimeout(() => {
                srAnnounce.textContent = message;
            }

                , 50);
        }
    }

    const backBtn = document.getElementById('back-btn');
    const headerTitle = document.getElementById('header-title');
    const chipsContainer = document.getElementById('chips-container');
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    const autocompleteList = document.getElementById('autocomplete-list');
    const autocompleteEmpty = document.getElementById('autocomplete-empty');
    const dropZone = document.getElementById('drop-zone');
    const attachBtn = document.getElementById('attach-btn');

    // Interaction history state
    let recentInteractions: ToolCallInteraction[] = [];

    type ElementChild = Node | string | null | undefined;

    function clearChildren(element: Element): void {
        // `replaceChildren()` é suportado no webview (Chromium).
        element.replaceChildren();
    }

    function appendChildren(parent: Element, ...children: ElementChild[]): void {
        for (const child of children) {
            if (child === null || child === undefined) continue;
            if (typeof child === 'string') {
                parent.appendChild(document.createTextNode(child));
            }

            else {
                parent.appendChild(child);
            }
        }
    }

    function tn(text: string): Text {
        return document.createTextNode(text);
    }

    function el<K extends keyof HTMLElementTagNameMap>(
        tag: K,
        options?: {
            className?: string;
            text?: string;
            html?: string;
            title?: string;
            attrs?: Record<string, string>;
            on?: Partial<{
                [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => any;
            }>
        },
        ...children: ElementChild[]
    ): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);

        if (options?.className) node.className = options.className;
        if (options?.title !== undefined) node.title = options.title;
        if (options?.text !== undefined) node.textContent = options.text;
        if (options?.html !== undefined) node.innerHTML = options.html;
        if (options?.attrs) {
            for (const [key, value] of Object.entries(options.attrs)) {
                node.setAttribute(key, value);
            }
        }

        if (options?.on) {
            for (const [event, handler] of Object.entries(options.on)) {
                node.addEventListener(event, handler as EventListener);
            }
        }

        appendChildren(node, ...children);
        return node;
    }

    function codicon(name: string): HTMLSpanElement {
        return el('span', { className: `codicon codicon-${name}` });
    }

    /**
    * Show the list of pending requests
    */
    function showList(requests: RequestItem[]): void {
        const activeRequestIds = new Set(requests.map(req => req.id));
        for (const id of draftResponses.keys()) {
            if (!activeRequestIds.has(id)) {
                draftResponses.delete(id);
            }
        }

        if (requests.length === 0) {

            // No pending requests - clear list and update placeholder
            if (pendingRequestsList) {
                clearChildren(pendingRequestsList);
            }

            updatePendingPlaceholder();
            updateHomeToolbarBadgesFromDom();
            return;
        }

        // Hide other views, show home view
        requestForm?.classList.add('hidden');
        requestHeader?.classList.add('hidden');
        requestList?.classList.add('hidden');
        homeView?.classList.remove('hidden');

        // Render pending requests in home view
        if (pendingRequestsList) {
            clearChildren(pendingRequestsList);

            for (const req of requests) {
                const item = el('div', {
                    className: 'request-item',
                    attrs: { 'data-id': req.id, tabindex: '0' }
                });

                const titleEl = el('div', { className: 'request-item-title', text: req.title });
                const previewEl = el('div', { className: 'request-item-preview', text: truncate(req.question, 100) });
                const metaEl = el('div', { className: 'request-item-meta' });
                const timeEl = el('span', { text: formatTime(req.createdAt) });
                const deleteBtn = el('button', {
                    className: 'pending-item-delete',
                    title: window.__STRINGS__.close || 'Close',
                    attrs: { type: 'button', 'data-id': req.id }
                }, codicon('circle-slash'));
                appendChildren(metaEl, deleteBtn, ' ', timeEl);

                appendChildren(item, titleEl, previewEl, metaEl);

                item.addEventListener('click', () => {
                    vscode.postMessage({ type: 'selectRequest', requestId: req.id });
                });

                item.addEventListener('keydown', (e: Event) => {
                    const keyEvent = e as KeyboardEvent;
                    if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
                    e.preventDefault();
                    vscode.postMessage({ type: 'selectRequest', requestId: req.id });
                });

                pendingRequestsList.appendChild(item);
            }

            // Update placeholder visibility
            updatePendingPlaceholder();
            updateHomeToolbarBadgesFromDom();
        }
    }

    /**
* Show the question form and hide other views
*/
    function showQuestion(question: string, title: string, requestId: string, options?: any[]): void {
        if (responseInput && currentRequestId && currentRequestId !== requestId) {
            draftResponses.set(currentRequestId, responseInput.value);
        }

        currentRequestId = requestId;

        // Reset previous stepper instance
        if (activeOptionsStepper) {
            activeOptionsStepper.destroy();
            activeOptionsStepper = null;
        }

        // Set header title
        if (headerTitle) {
            headerTitle.textContent = title || 'Confirmation Required';
        }

        if (questionContent) {
            questionContent.innerHTML = renderMarkdown(question);
        }

        if (responseInput) {
            responseInput.value = draftResponses.get(requestId) || '';
            // Initialize textarea height
            autoResizeTextarea();
        }

        // Render option buttons if provided
        renderOptions(options);

        // Hide ALL other views
        homeView?.classList.add('hidden');
        requestList?.classList.add('hidden');
        interactionDetailView?.classList.add('hidden');

        // Show header and form
        requestHeader?.classList.remove('hidden');
        requestForm?.classList.remove('hidden');

        // Update attachments display
        updateAttachmentsDisplay();

        // Focus the textarea for immediate typing
        responseInput?.focus();
    }

    // ================================
    // Options rendering helpers
    // ================================

    interface NormalizedOptionItem {
        label: string;
        description?: string;
    }

    interface NormalizedOptionGroup {
        title: string;
        options: NormalizedOptionItem[];
        multiSelect: boolean;
    }

    /**
     * Check if a value looks like an option group (has 'title' and 'options' fields)
     */
    function isOptionGroupLike(value: any): boolean {
        return typeof value === 'object'
            && value !== null
            && 'title' in value
            && 'options' in value
            && Array.isArray(value.options);
    }

    /**
     * Check if the options array contains option groups.
     * Validates all elements to avoid incorrect parsing of heterogeneous arrays.
     */
    function isOptionGroupArray(options: any[]): boolean {
        if (options.length === 0) return false;
        if (!isOptionGroupLike(options[0])) return false;
        return options.every(isOptionGroupLike);
    }

    /**
     * Normalize raw options to a unified group structure
     */
    function parseOptionsToGroups(options: any[]): NormalizedOptionGroup[] {
        if (isOptionGroupArray(options)) {
            return options.map((g: any) => ({
                title: String(g.title || ''),
                options: (Array.isArray(g.options) ? g.options : [])
                    .map((o: any) =>
                        typeof o === 'string' ? { label: o } : { label: String(o.label || ''), description: o.description ? String(o.description) : undefined }
                    )
                    .filter((o: NormalizedOptionItem) => o.label.trim().length > 0),
                multiSelect: Boolean(g.multiSelect)
            }));
        } else {
            return [{
                title: '',
                options: options
                    .map((o: any) =>
                        typeof o === 'string' ? { label: o } : { label: String(o.label || ''), description: o.description ? String(o.description) : undefined }
                    )
                    .filter((o: NormalizedOptionItem) => o.label.trim().length > 0),
                multiSelect: false
            }];
        }
    }

    /**
     * Render options in the options container.
     * Creates an OptionsStepper instance and mounts it into the fieldset.
     */
    function renderOptions(options?: any[]): void {
        if (!optionsContainer) return;

        // Destroy previous stepper if any
        if (activeOptionsStepper) {
            activeOptionsStepper.destroy();
            activeOptionsStepper = null;
        }

        if (!options || options.length === 0) {
            optionsContainer.classList.add('hidden');
            return;
        }

        // Create interactive stepper
        activeOptionsStepper = createOptionsStepper({
            options,
            readOnly: false,
        });

        // Mount stepper before the separator
        const separator = optionsContainer.querySelector('.options-separator');
        if (separator) {
            optionsContainer.insertBefore(activeOptionsStepper.element, separator);
        } else {
            optionsContainer.appendChild(activeOptionsStepper.element);
        }

        optionsContainer.classList.remove('hidden');
    }

    /**
     * Build option button elements for a group.
     * Shared between pending (interactive) and history (read-only) views.
     * @param group The option group to render
     * @param selected Set of currently selected labels
     * @param readOnly If true, buttons are non-interactive (for history view)
     * @param onToggle Optional callback for interactive mode
     * @returns Array of button elements
     */
    function buildOptionButtons(
        group: NormalizedOptionGroup,
        selected: Set<string>,
        readOnly: boolean,
        onToggle?: (label: string, btn: HTMLElement) => void,
    ): HTMLElement[] {
        const buttons: HTMLElement[] = [];

        for (const opt of group.options) {
            const btnChildren: ElementChild[] = [
                el('span', { className: 'option-btn-label', text: opt.label })
            ];

            if (opt.description) {
                const descEl = el('span', { className: 'option-btn-description', text: opt.description });
                btnChildren.push(descEl);

                // Always add tooltip for descriptions - will show on hover
                const tooltip = el('span', {
                    className: 'option-btn-tooltip',
                    text: opt.description
                });
                btnChildren.push(tooltip);
            }

            const isSelected = selected.has(opt.label);
            // Set button title to show full description on hover - single line break, no empty line
            const btnTitle = opt.description ? `${opt.label}\n${opt.description}` : opt.label;
            const classNames = 'option-btn'
                + (isSelected ? ' selected' : '')
                + (readOnly ? ' readonly' : '');
            const btn = el('button', {
                className: classNames,
                attrs: {
                    type: 'button',
                    title: btnTitle,
                    'aria-pressed': String(isSelected),
                    ...(readOnly ? { disabled: '' } : {})
                }
            }, ...btnChildren);

            if (!readOnly && onToggle) {
                btn.addEventListener('click', () => {
                    onToggle(opt.label, btn);
                });
            }

            buttons.push(btn);
        }

        return buttons;
    }

    /**
     * Options stepper instance interface.
     * Returned by createOptionsStepper() for both pending (interactive) and history (read-only) views.
     */
    interface OptionsStepper {
        /** Root DOM element to mount */
        element: HTMLElement;
        /** Get current selections as Record<groupTitle, selectedLabels[]> */
        getSelections(): Record<string, string[]>;
        /** Build a response string from selected options */
        getSelectedResponse(): string;
        /** Clean up the stepper DOM and event listeners */
        destroy(): void;
    }

    /**
     * Create an options stepper (wizard-style or single-group).
     * Encapsulates its own state via closure — multiple instances can coexist.
     * Used by both the pending request form (interactive) and the history detail view (read-only).
     *
     * @param config.options Raw options data (AskUserOptions)
     * @param config.readOnly If true, buttons are non-interactive
     * @param config.selectedLabels Pre-populated selections (for history view)
     * @param config.onSelectionChange Callback when selection changes (for pending view)
     */
    function createOptionsStepper(config: {
        options: any[];
        readOnly: boolean;
        selectedLabels?: Record<string, string[]>;
        onSelectionChange?: () => void;
    }): OptionsStepper {
        const groups = parseOptionsToGroups(config.options);
        let currentIndex = 0;
        const selectionsMap = new Map<string, Set<string>>();
        const multiSelectMap = new Map<string, boolean>();

        // Initialize selections from saved labels or empty
        for (const group of groups) {
            if (config.selectedLabels?.[group.title]) {
                selectionsMap.set(group.title, new Set(config.selectedLabels[group.title]));
            } else {
                selectionsMap.set(group.title, new Set());
            }
            multiSelectMap.set(group.title, group.multiSelect);
        }

        // Root container
        const root = el('div', { className: 'options-stepper-root' });

        // Stepper navigation (only for multi-group)
        let stepperNav: HTMLElement | null = null;
        let stepIndicatorEl: HTMLElement | null = null;
        let prevBtnEl: HTMLButtonElement | null = null;
        let nextBtnEl: HTMLButtonElement | null = null;
        let summaryEl: HTMLElement | null = null;

        if (groups.length > 1) {
            prevBtnEl = el('button', {
                className: 'step-nav-btn',
                attrs: { type: 'button', title: 'Previous', 'aria-label': 'Previous step' }
            },
                el('span', { className: 'codicon codicon-chevron-left' })
            ) as HTMLButtonElement;

            stepIndicatorEl = el('span', { className: 'step-indicator' });

            nextBtnEl = el('button', {
                className: 'step-nav-btn',
                attrs: { type: 'button', title: 'Next', 'aria-label': 'Next step' }
            },
                el('span', { className: 'codicon codicon-chevron-right' })
            ) as HTMLButtonElement;

            stepperNav = el('div', { className: 'options-stepper' }, prevBtnEl, stepIndicatorEl, nextBtnEl);
            root.appendChild(stepperNav);

            summaryEl = el('div', { className: 'options-summary hidden' });
            root.appendChild(summaryEl);

            prevBtnEl.addEventListener('click', () => {
                if (currentIndex > 0) { currentIndex--; renderStep(); }
            });
            nextBtnEl.addEventListener('click', () => {
                if (currentIndex < groups.length - 1) { currentIndex++; renderStep(); }
            });
        }

        const buttonsContainer = el('div', { className: 'options-buttons', attrs: { 'aria-label': 'Options' } });
        root.appendChild(buttonsContainer);

        /** Render the current step (buttons + nav + summary) */
        function renderStep(): void {
            const group = groups[currentIndex];

            // Update step indicator
            if (stepIndicatorEl) {
                const stepText = group.title
                    ? `${currentIndex + 1}/${groups.length}: ${group.title}`
                    : `${currentIndex + 1}/${groups.length}`;
                stepIndicatorEl.textContent = stepText;
            }

            // Update navigation buttons
            if (prevBtnEl) { prevBtnEl.disabled = currentIndex === 0; }
            if (nextBtnEl) { nextBtnEl.disabled = currentIndex === groups.length - 1; }

            // Render current group's buttons
            clearChildren(buttonsContainer);
            const selected = selectionsMap.get(group.title) || new Set<string>();
            const buttons = buildOptionButtons(
                group, selected, config.readOnly,
                config.readOnly ? undefined : (label, btn) => {
                    handleToggle(group.title, label, btn, group.multiSelect);
                }
            );
            for (const btn of buttons) { buttonsContainer.appendChild(btn); }

            // Update summary
            if (groups.length > 1) { renderSummary(); }
        }

        /** Toggle an option's selection state (interactive mode only) */
        function handleToggle(groupTitle: string, label: string, btn: HTMLElement, multiSelect: boolean): void {
            const selected = selectionsMap.get(groupTitle) || new Set<string>();

            if (selected.has(label)) {
                selected.delete(label);
                btn.classList.remove('selected');
                btn.setAttribute('aria-pressed', 'false');
            } else {
                if (!multiSelect) {
                    selected.clear();
                    buttonsContainer.querySelectorAll('.option-btn.selected').forEach(b => {
                        b.classList.remove('selected');
                        b.setAttribute('aria-pressed', 'false');
                    });
                }
                selected.add(label);
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');
            }

            selectionsMap.set(groupTitle, selected);
            if (groups.length > 1) { renderSummary(); }
            config.onSelectionChange?.();
        }

        /** Render the selection summary showing all groups' selected values */
        function renderSummary(): void {
            if (!summaryEl) return;
            clearChildren(summaryEl);

            const items: HTMLElement[] = [];
            for (let i = 0; i < groups.length; i++) {
                const group = groups[i];
                const selected = selectionsMap.get(group.title) || new Set<string>();
                if (selected.size === 0) continue;

                const values = Array.from(selected).join(', ');
                const stepIdx = i;
                const itemEl = el('div', {
                    className: 'options-summary-item' + (i === currentIndex ? ' current' : ''),
                    attrs: { role: 'button', tabindex: '0', title: group.title ? `Go to: ${group.title}` : 'Go to selection' }
                });

                if (group.title) {
                    itemEl.appendChild(el('span', { className: 'options-summary-label', text: `${group.title}: ` }));
                }
                itemEl.appendChild(document.createTextNode(values));

                // Click to navigate to that step
                itemEl.addEventListener('click', () => { currentIndex = stepIdx; renderStep(); });
                itemEl.addEventListener('keydown', (event: KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); itemEl.click(); }
                });

                items.push(itemEl);
            }

            if (items.length > 0) {
                appendChildren(summaryEl, ...items);
                summaryEl.classList.remove('hidden');
            } else {
                summaryEl.classList.add('hidden');
            }
        }

        // Initial render
        renderStep();

        return {
            element: root,
            getSelections(): Record<string, string[]> {
                const result: Record<string, string[]> = {};
                for (const group of groups) {
                    const selected = selectionsMap.get(group.title);
                    if (selected && selected.size > 0) {
                        result[group.title] = Array.from(selected);
                    }
                }
                return result;
            },
            getSelectedResponse(): string {
                const parts: string[] = [];
                for (const group of groups) {
                    const selected = selectionsMap.get(group.title);
                    if (!selected || selected.size === 0) continue;
                    const values = Array.from(selected).join(', ');
                    if (group.title) {
                        parts.push(`${group.title}: ${values}`);
                    } else {
                        parts.push(values);
                    }
                }
                return parts.join('\n');
            },
            destroy(): void {
                clearChildren(root);
                root.remove();
            }
        };
    }

    /**
 * Switch between tabs in the home view
 */
    function switchTab(tab: 'pending' | 'history'): void {
        // Update content panes visibility
        contentPending?.classList.toggle('hidden', tab !== 'pending');
        contentHistory?.classList.toggle('hidden', tab !== 'history');

        setHomeToolbarActiveTab(tab);

        // Announce tab change to screen readers
        const tabNames: Record<string, string> = {
            pending: window.__STRINGS__?.pendingItems || 'Pending Items',
            history: window.__STRINGS__?.chatHistory || 'Chat History',
        };

        announceToScreenReader(`${tabNames[tab]}tab selected`);
    }

    /**
 * Update the unified pending placeholder visibility
 * Shows placeholder only when both requests and reviews are empty
 */
    function updatePendingPlaceholder(): void {
        const hasRequests = ! !(pendingRequestsList && pendingRequestsList.children.length > 0);
        const hasReviews = ! !(pendingReviewsList && pendingReviewsList.children.length > 0);

        if (pendingPlaceholder) {
            pendingPlaceholder.classList.toggle('hidden', hasRequests || hasReviews);
        }
    }

    /**
 * Show home view (pending requests + recent interactions)
 */
    function showHome(): void {
        currentRequestId = null;
        currentInteractionId = null;

        // Hide other views
        requestForm?.classList.add('hidden');
        requestList?.classList.add('hidden');
        requestHeader?.classList.add('hidden');
        interactionDetailView?.classList.add('hidden');

        // Show home view
        homeView?.classList.remove('hidden');

        // Update unified pending placeholder
        updatePendingPlaceholder();

        // Update history list placeholder if empty
        if (historyList && historyList.children.length === 0) {
            const p = el('p', { className: 'placeholder' });
            p.innerText = window.__STRINGS__?.noChats || 'No history yet';
            historyList.appendChild(p);
        }

        // Render recent interactions (legacy)
        renderRecentInteractions();

        if (responseInput) {
            responseInput.value = '';
        }
    }

    /**
 * Extract a meaningful title from the LLM's input question
 * Uses the first sentence (up to ~80 chars) as the title
 */
    function extractTitleFromQuestion(question: string): string {
        if (!question) return 'Tool Call';

        // Remove markdown formatting for cleaner extraction
        let text = question.replace(/^\s*#+\s*/gm, '') // Remove heading markers
            .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
            .replace(/\*([^*]+)\*/g, '$1') // Remove italic
            .replace(/`([^`]+)`/g, '$1') // Remove inline code
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
            .trim();

        // Get first sentence (ending with . ! ? or first line)
        const sentenceMatch = text.match(/^[^. !?\n]+[. !?]?/);
        let firstSentence = sentenceMatch ? sentenceMatch[0].trim() : text.split('\n')[0].trim();

        // Truncate to ~80 chars if too long
        if (firstSentence.length > 80) {
            firstSentence = firstSentence.substring(0, 77).trim() + '...';
        }

        return firstSentence || 'Tool Call';
    }

    function renderRecentInteractions(): void {
        if (!recentInteractionsList) return;

        if (recentInteractions.length === 0) {
            clearChildren(recentInteractionsList);
            recentInteractionsList.appendChild(el('p', {
                className: 'placeholder',
                text: window.__STRINGS__?.noRecentSessions || 'No recent tool calls'
            }));
            return;
        }

        clearChildren(recentInteractionsList);
        const fragment = document.createDocumentFragment();

        for (const [index, interaction] of recentInteractions.entries()) {
            const titleText = extractTitleFromQuestion(interaction.input.question);
            const statusClass = interaction.status === 'completed' ? 'completed' : 'cancelled';
            const iconName = interaction.status === 'completed' ? 'check' : 'x';

            // Only first item (newest) is expanded by default
            const isExpanded = index === 0;
            const collapsedClass = isExpanded ? '' : 'collapsed';

            const item = el('div', {
                className: `interaction-item ${statusClass} ${collapsedClass}`,
                attrs: { 'data-interaction-id': interaction.id }
            });

            const header = el('div', {
                className: 'interaction-header',
                attrs: { role: 'button', tabindex: '0', 'aria-expanded': String(isExpanded) }
            });

            const chevronWrap = el('div', { className: 'interaction-chevron' });
            const chevronIcon = codicon(isExpanded ? 'chevron-down' : 'chevron-right');
            chevronWrap.appendChild(chevronIcon);

            const iconWrap = el('div', { className: 'interaction-icon' }, codicon(iconName));
            const title = el('div', { className: 'interaction-title', text: titleText });
            const time = el('div', { className: 'interaction-time', text: formatTime(interaction.timestamp) });
            appendChildren(header, chevronWrap, iconWrap, title, time);

            const body = el('div', { className: 'interaction-body' });

            const aiSection = el('div', { className: 'interaction-section' });
            const aiLabel = el('div', { className: 'interaction-section-label' });
            appendChildren(aiLabel, codicon('hubot'), ' AI');
            const aiContent = el('div', { className: 'interaction-content', html: renderMarkdown(interaction.input.question) });
            appendChildren(aiSection, aiLabel, aiContent);

            const userSection = el('div', { className: 'interaction-section' });
            const userLabel = el('div', { className: 'interaction-section-label' });
            appendChildren(userLabel, codicon('account'), ' USER');

            const userContent = el('div', { className: 'interaction-content' });
            if (interaction.output.response) {
                userContent.textContent = interaction.output.response;
            }

            else {
                userContent.appendChild(el('em', { text: window.__STRINGS__?.noResponse || 'No response' }));
            }

            appendChildren(userSection, userLabel, userContent);

            if (interaction.output.attachments && interaction.output.attachments.length > 0) {
                const attachments = el('div', { className: 'interaction-attachments' });
                for (const att of interaction.output.attachments) {
                    const chip = el('span', { className: 'attachment-chip' });
                    appendChildren(chip, codicon(att.isFolder ? 'folder' : 'file'), ' ', att.name);
                    attachments.appendChild(chip);
                }
                userSection.appendChild(attachments);
            }

            appendChildren(body, aiSection, userSection);
            appendChildren(item, header, body);

            const toggleCollapsed = (): void => {
                const isCollapsed = item.classList.toggle('collapsed');
                header.setAttribute('aria-expanded', String(!isCollapsed));
                chevronIcon.className = `codicon codicon-${isCollapsed ? 'chevron-right' : 'chevron-down'}`;
                announceToScreenReader(`${titleText}, ${isCollapsed ? 'collapsed' : 'expanded'}`);
            };

            header.addEventListener('click', toggleCollapsed);
            header.addEventListener('keydown', (e: Event) => {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
                e.preventDefault();
                toggleCollapsed();
            });

            fragment.appendChild(item);
        }

        recentInteractionsList.appendChild(fragment);
    }

    /**
     * Render pending plan reviews in the home view
     */
    function renderPendingReviews(reviews: StoredInteraction[]): void {
        if (!pendingReviewsList) return;

        if (reviews.length === 0) {
            clearChildren(pendingReviewsList);
            updatePendingPlaceholder();
            updateHomeToolbarBadgesFromDom();
            return;
        }

        clearChildren(pendingReviewsList);

        for (const review of reviews) {
            const item = el('div', {
                className: 'request-item pending-review-item',
                attrs: { 'data-id': review.id, tabindex: '0' }
            });

            const title = el('div', { className: 'request-item-title' });
            appendChildren(title, codicon('file-text'), ' ', (review.title || 'Plan Review'));

            const preview = el('div', { className: 'request-item-preview', text: truncate(review.plan || '', 100) });

            const meta = el('div', { className: 'request-item-meta' });
            const status = review.status || 'pending';
            const statusBadge = el('span', { className: `status-badge status-${status}`, text: getStatusLabel(review.status) });
            const time = el('span', { text: formatTime(review.timestamp) });
            const deleteBtn = el('button', {
                className: 'pending-item-delete',
                title: window.__STRINGS__.close || 'Close',
                attrs: { type: 'button', 'data-id': review.id }
            }, codicon('circle-slash'));
            appendChildren(meta, statusBadge, ' ', deleteBtn, ' ', time);

            appendChildren(item, title, preview, meta);

            item.addEventListener('click', () => {
                vscode.postMessage({ type: 'openPlanReviewPanel', interactionId: review.id });
            });

            item.addEventListener('keydown', (e: Event) => {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
                e.preventDefault();
                vscode.postMessage({ type: 'openPlanReviewPanel', interactionId: review.id });
            });

            pendingReviewsList.appendChild(item);
        }

        // Update placeholder visibility
        updatePendingPlaceholder();
        updateHomeToolbarBadgesFromDom();
    }

    /**
     * Render unified history (ask_user + plan_review), sorted by timestamp desc.
     */
    function renderUnifiedHistory(interactions: StoredInteraction[]): void {
        if (!historyList) return;

        type UnifiedEntry = {
            id: string;
            type: 'ask_user' | 'plan_review';
            timestamp: number;
            title: string;
            preview: string;
            status?: string;
        };

        const entries: UnifiedEntry[] = [];

        for (const interaction of interactions || []) {
            const isPlanReview = interaction.type === 'plan_review';

            const title = isPlanReview ? (interaction.title || 'Plan Review') : (interaction.agentName ?? interaction.question ?? 'Ask User');
            const preview = isPlanReview ? truncate(interaction.plan || '', 80) : truncate(interaction.question || '', 80);

            entries.push({
                id: interaction.id,
                type: interaction.type,
                timestamp: interaction.timestamp,
                title,
                preview,
                status: interaction.status
            });
        }

        // Sort newest first, regardless of type
        entries.sort((a, b) => b.timestamp - a.timestamp);

        clearChildren(historyList);

        if (entries.length === 0) {
            historyList.appendChild(el('p', {
                className: 'placeholder',
                text: window.__STRINGS__?.noChats || 'No history yet'
            }));
            updateHomeToolbarBadgesFromDom();
            return;
        }

        const fragment = document.createDocumentFragment();

        for (const entry of entries) {
            const isPlanReview = entry.type === 'plan_review';
            const icon = isPlanReview ? 'file-text' : 'comment';
            const statusClass = entry.status || 'pending';

            const itemClasses = batchSelectMode ? 'history-item batch-mode' : 'history-item';
            const item = el('div', {
                className: itemClasses,
                attrs: { 'data-id': entry.id, 'data-type': entry.type, tabindex: '0' }
            });

            // View button (magnifier) - visible on hover or in batch mode
            const viewBtn = el('button', {
                className: 'history-item-view',
                title: window.__STRINGS__?.openInPanel || 'View',
                attrs: { type: 'button' }
            }, codicon('search'));
            item.appendChild(viewBtn);

            const header = el('div', { className: 'history-item-header' });
            const title = el('span', { className: 'history-item-title', text: entry.title });
            const deleteBtn = el('button', {
                className: 'history-item-delete',
                title: 'Remove',
                attrs: { type: 'button', 'data-id': entry.id }
            }, codicon('trash'));
            appendChildren(header, codicon(icon), ' ', title, deleteBtn);

            const preview = el('div', { className: 'history-item-preview', text: entry.preview });
            const meta = el('div', { className: 'history-item-meta' });
            const time = el('span', { className: 'history-item-time', text: formatTime(entry.timestamp) });

            if (isPlanReview) {
                const statusBadge = el('span', {
                    className: `status-badge status-${statusClass}`,
                    text: getStatusLabel(entry.status)
                });
                appendChildren(meta, statusBadge, ' ', time);
            }

            else {
                appendChildren(meta, time);
            }

            appendChildren(item, header, preview, meta);
            fragment.appendChild(item);
        }

        historyList.appendChild(fragment);

        // Apply current filter after render
        applyHistoryFilter(currentHistoryFilter);

        updateHomeToolbarBadgesFromDom();
    }

    /**
     * Render read-only options for history detail view.
     * Uses createOptionsStepper() with readOnly=true to show the same stepper UI
     * as the pending view, but with non-interactive buttons.
     * Returns an empty text node if no options exist.
     */
    function renderReadOnlyOptionsDetail(interaction: StoredInteraction): HTMLElement | Text {
        if (!interaction.options || !Array.isArray(interaction.options) || interaction.options.length === 0) {
            return tn('');
        }

        const optionsLabel = window.__STRINGS__?.options || 'Options';

        const container = el('div', { className: 'detail-section detail-section-plain' },
            el('div', { className: 'detail-label' },
                el('span', { className: 'codicon codicon-list-selection' }),
                optionsLabel
            )
        );

        const stepper = createOptionsStepper({
            options: interaction.options,
            readOnly: true,
            selectedLabels: interaction.selectedOptionLabels,
        });

        container.appendChild(stepper.element);

        return container;
    }

    /**
     * Show interaction detail view (for ask_user)
     */
    function showInteractionDetail(interaction: StoredInteraction): void {
        currentInteractionId = interaction.id;

        // Hide ALL other views
        homeView?.classList.add('hidden');
        requestForm?.classList.add('hidden');
        requestList?.classList.add('hidden');

        // Show interaction detail view with header
        interactionDetailView?.classList.remove('hidden');
        requestHeader?.classList.remove('hidden');

        // Set header title
        if (headerTitle) {
            const title = interaction.type === 'plan_review'
                ? (interaction.title || 'Plan Review')
                : (interaction.agentName ? `${interaction.agentName}: Ask User` : 'Ask User');
            headerTitle.textContent = title;
        }

        // Render the detail content
        if (interactionDetailView) {
            const detailContent = interactionDetailView.querySelector('.interaction-detail-content') || interactionDetailView;

            if (interaction.type === 'ask_user') {
                const questionLabel = window.__STRINGS__?.question || 'Question';
                const responseLabel = window.__STRINGS__?.response || 'Response';
                const noResponseLabel = window.__STRINGS__?.noResponse || 'No response';
                const attachmentsLabel = window.__STRINGS__?.attachments || 'Attachments';
                const cancelledLabel = window.__STRINGS__?.cancelled || 'Cancelled';
                const legacyCancelledValues = new Set([
                    'Cancelled',
                    'Request was cancelled',
                    'Request cancelled',
                    'All requests cancelled',
                    'Agent stopped the request'
                ]);
                const isCancelled = interaction.status === 'cancelled'
                    || interaction.response === cancelledLabel
                    || (interaction.response ? legacyCancelledValues.has(interaction.response) : false);

                const displayResponse = isCancelled
                    ? ((interaction.response && !legacyCancelledValues.has(interaction.response)) ? interaction.response : cancelledLabel)
                    : (interaction.response || noResponseLabel);

                const attachmentsHtml = (interaction.attachments && interaction.attachments.length > 0)
                    ? (() => (
                        el('div', { className: 'detail-section detail-section-plain' },
                            el('div', { className: 'detail-label' },
                                el('span', { className: 'codicon codicon-file' }),
                                attachmentsLabel
                            ),
                            el('div', { className: 'detail-attachments' },
                                ...interaction.attachments.map(att => {
                                    const name = att.split('/').pop() || att;
                                    return el('span', { className: 'attachment-chip', text: name });
                                })
                            ))
                    ))() : tn('');

                // Build read-only options display if the interaction had options
                const optionsHtml = renderReadOnlyOptionsDetail(interaction);

                detailContent.replaceChildren(
                    el('div', { className: 'detail-section detail-section-plain' },
                        el('div', { className: 'detail-label' },
                            el('span', { className: 'codicon codicon-question' }),
                            questionLabel
                        ),
                        el('div', { className: 'detail-content markdown-content', html: renderMarkdown(interaction.question || '') })
                    ),
                    optionsHtml,
                    el('div', { className: 'detail-section detail-section-plain' },
                        el('div', { className: 'detail-label' },
                            el('span', { className: 'codicon codicon-reply' }),
                            responseLabel
                        ),
                        el('div', { className: `detail-content ${isCancelled ? 'cancelled-response' : ''}`, html: escapeHtml(displayResponse) }),
                    ),
                    attachmentsHtml,
                    el('div', { className: 'detail-meta' },
                        el('span', { text: formatTime(interaction.timestamp) })
                    )
                );
            }

            else {

                // For plan_review, redirect to panel
                vscode.postMessage({
                    type: 'openPlanReviewPanel', interactionId: interaction.id
                });
            }
        }
    }

    /**
     * Get localized status label
     */
    function getStatusLabel(status?: string): string {
        switch (status) {
            case 'approved': return window.__STRINGS__?.approved || 'Approved';
            case 'recreateWithChanges': return window.__STRINGS__?.rejected || 'Rejected';
            case 'acknowledged': return window.__STRINGS__?.acknowledged || 'Acknowledged';
            case 'pending': return window.__STRINGS__?.pending || 'Pending';
            case 'cancelled': return window.__STRINGS__?.cancelled || 'Cancelled';
            default: return window.__STRINGS__?.pending || 'Pending';
        }
    }

    /**
    * Update attachments display - renders chips above textarea
    */
    function updateAttachmentsDisplay(): void {
        updateChipsDisplay();
    }

    /**
    * Update chips display above textarea
    */
    function updateChipsDisplay(): void {
        if (!chipsContainer) return;

        if (currentAttachments.length === 0) {
            chipsContainer.classList.add('hidden');
            chipsContainer.innerHTML = '';
        }

        else {
            chipsContainer.classList.remove('hidden');


            const preview = document.querySelector('.image-hover-preview') as HTMLElement;
            const previewImg = preview?.querySelector('img') as HTMLImageElement;

            preview.classList.add('hidden');
            chipsContainer.replaceChildren(...currentAttachments.map(att => {
                const isImage = att.isImage || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name);
                const isFolder = att.isFolder;

                // Determine display name and icon
                let displayName: string;
                let iconClass: string;
                let chipClass: string;

                if (isFolder) {
                    displayName = att.name;
                    iconClass = 'folder';
                    chipClass = 'chip chip-folder';
                    // No depth indicator - just show folder name
                }

                else if (isImage) {
                    displayName = att.id.startsWith('img_') ? window.__STRINGS__.pastedImage : att.name;
                    iconClass = 'file-media';
                    chipClass = 'chip chip-image';
                }

                else {
                    displayName = att.name;
                    iconClass = getFileIcon(att.name);
                    chipClass = 'chip';
                }

                const element = el(
                    'div',
                    {
                        className: chipClass,
                        title: att.folderPath || att.uri || att.name,
                        attrs: { 'data-id': att.id },
                        on: {
                            'mouseenter': async () => {
                                previewImg.setAttribute('src', att?.thumbnail || att.uri);
                                previewImg.setAttribute('alt', att.name);

                                const rect = element.getBoundingClientRect();
                                const previewRect = preview.getBoundingClientRect();
                                const top = rect.top - previewRect.height - 8
                                preview.style.top = `${top}px`;
                                preview.classList.remove('hidden');
                            },
                            'mouseleave': () => {
                                preview.classList.add('hidden');
                            }
                        }
                    },
                    el('span', { className: 'chip-icon' },
                        el('span', { className: `codicon codicon-${iconClass}` })
                    ),
                    el('span', { className: 'chip-text', text: displayName }),
                    el(
                        'button',
                        {
                            className: 'chip-remove',
                            title: window.__STRINGS__?.remove || 'Remove',
                            attrs: { type: 'button', 'data-remove': att.id },
                            on: {
                                'click': (e) => {
                                    e.stopPropagation();
                                    removeAttachment(att.id);
                                    preview.classList.add('hidden');
                                }
                            }
                        },
                        el('span', { className: 'codicon codicon-close' })
                    )
                );

                return element
            }));
        }
    }

    /**
    * Remove an attachment by ID
    */
    function removeAttachment(attachmentId: string): void {
        if (currentRequestId) {
            vscode.postMessage({
                type: 'removeAttachment',
                requestId: currentRequestId,
                attachmentId: attachmentId
            });
        }

        // Optimistically update local state
        currentAttachments = currentAttachments.filter(a => a.id !== attachmentId);
        updateChipsDisplay();
    }

    /**
    * Handle submit button click
    */
    function handleSubmit(): void {
        const typedResponse = responseInput?.value.trim() || '';
        const selectedResponse = activeOptionsStepper?.getSelectedResponse() || '';

        // Combine selected options and typed response
        let response = '';
        if (selectedResponse && typedResponse) {
            response = `${selectedResponse}\n\n${typedResponse}`;
        } else {
            response = selectedResponse || typedResponse;
        }

        // Build selectedOptions map for storage
        const selectedOptions = activeOptionsStepper?.getSelections() || {};

        if (currentRequestId) {
            vscode.postMessage({
                type: 'submit',
                response: response,
                requestId: currentRequestId,
                attachments: currentAttachments,
                selectedOptions: Object.keys(selectedOptions).length > 0 ? selectedOptions : undefined,
            });
            draftResponses.delete(currentRequestId);
        }

        // Reset stepper
        if (activeOptionsStepper) {
            activeOptionsStepper.destroy();
            activeOptionsStepper = null;
        }

        currentAttachments = [];
        // Don't show home - the extension will send showCurrentSession or showSessionDetail
    }

    /**
    * Handle cancel button click
    */
    function handleCancel(): void {
        if (currentRequestId) {
            vscode.postMessage({
                type: 'cancel',
                requestId: currentRequestId
            });
            draftResponses.delete(currentRequestId);
        }

        currentAttachments = [];
        // Don't show home - the extension will send showCurrentSession or showSessionDetail
    }

    /**
     * Handle back button click
     */
    function handleBack(): void {

        // If viewing any detail, go back to home
        if (currentInteractionId) {
            vscode.postMessage({
                type: 'backToHome'
            });
        }

        else {

            // Go back to list or home
            vscode.postMessage({
                type: 'backToList'
            });
        }
    }


    // Utility functions
    function escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatIsoDate(timestamp: number): string {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().slice(0, 10);
    }

    function formatTime(timestamp: number): string {
        const strings = window.__STRINGS__;
        const mode = window.__CONFIG__?.historyTimeDisplay || 'hybrid';
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (mode === 'absolute') {
            return formatIsoDate(timestamp);
        }

        if (mode === 'hybrid' && days >= 7) {
            return formatIsoDate(timestamp);
        }

        if (minutes < 1) return strings?.justNow || 'just now';
        if (minutes < 60) return (strings?.minutesAgo || '{0}m ago').replace('{0}', String(minutes));
        if (hours < 24) return (strings?.hoursAgo || '{0}h ago').replace('{0}', String(hours));
        return (strings?.daysAgo || '{0}d ago').replace('{0}', String(days));
    }

    /**
    * Get Codicon icon name for a file based on its extension
    */
    function getFileIcon(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() || '';

        const iconMap: Record<string,
            string> = {
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
        };
        return iconMap[ext] || 'file';
    }

    // ================================
    // Autocomplete Functions
    // ================================

    /**
     * Show the autocomplete dropdown with results
     */
    function showAutocomplete(results: FileSearchResult[]): void {
        if (!autocompleteDropdown || !autocompleteList || !autocompleteEmpty) return;

        autocompleteResults = results;
        selectedAutocompleteIndex = results.length > 0 ? 0 : -1;

        if (results.length === 0) {
            autocompleteList.classList.add('hidden');
            autocompleteEmpty.classList.remove('hidden');
        }

        else {
            autocompleteList.classList.remove('hidden');
            autocompleteEmpty.classList.add('hidden');
            renderAutocompleteList();
        }

        autocompleteDropdown.classList.remove('hidden');
        autocompleteVisible = true;
    }

    /**
     * Hide the autocomplete dropdown
     */
    function hideAutocomplete(): void {
        if (!autocompleteDropdown) return;

        autocompleteDropdown.classList.add('hidden');
        autocompleteVisible = false;
        autocompleteResults = [];
        selectedAutocompleteIndex = -1;
        autocompleteQuery = '';
        autocompleteStartPos = -1;

        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }
    }

    /**
     * Render the autocomplete list items
     */
    function renderAutocompleteList(): void {
        if (!autocompleteList) return;

        autocompleteList.replaceChildren(...autocompleteResults.map((file, index) => (
            el(
                'div', { className: `autocomplete-item${index === selectedAutocompleteIndex ? ' selected' : ''}`, attrs: { 'data-index': String(index), tabindex: '-1' } },
                el('span', { className: 'autocomplete-item-icon' },
                    el('span', { className: `codicon codicon-${file.icon}` })
                ),
                el('div', { className: 'autocomplete-item-content' },
                    el('span', { className: 'autocomplete-item-name', text: file.name }),
                    el('span', { className: 'autocomplete-item-path', text: file.path })
                )
            )
        )));

        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt((item as HTMLElement).getAttribute('data-index') || '0', 10);
                selectAutocompleteItem(index);
            });
            item.addEventListener('mouseenter', () => {
                const index = parseInt((item as HTMLElement).getAttribute('data-index') || '0', 10);
                selectedAutocompleteIndex = index;
                updateAutocompleteSelection();
            });
        });

        scrollToSelectedItem();
    }

    /**
     * Update visual selection in autocomplete list
     */
    function updateAutocompleteSelection(): void {
        if (!autocompleteList) return;

        autocompleteList.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            if (index === selectedAutocompleteIndex) {
                item.classList.add('selected');
            }

            else {
                item.classList.remove('selected');
            }
        });

        scrollToSelectedItem();
    }

    /**
     * Scroll to keep selected item visible
     */
    function scrollToSelectedItem(): void {
        if (!autocompleteList) return;

        const selectedItem = autocompleteList.querySelector('.autocomplete-item.selected') as HTMLElement;

        if (selectedItem) {
            selectedItem.scrollIntoView({
                block: 'nearest', behavior: 'smooth'
            });
        }
    }

    /**
     * Select an autocomplete item and insert it
     */
    function selectAutocompleteItem(index: number): void {
        if (index < 0 || index >= autocompleteResults.length) return;

        const file = autocompleteResults[index];
        if (!responseInput || autocompleteStartPos < 0) return;

        // Get current value and cursor position
        const value = responseInput.value;
        const cursorPos = responseInput.selectionStart;

        // Build the reference text in format #filename
        const referenceText = `#${file.name}`;

        // Replace from # position to current cursor with the reference
        const beforeHash = value.substring(0, autocompleteStartPos);
        const afterCursor = value.substring(cursorPos);
        const newValue = beforeHash + referenceText + afterCursor;

        responseInput.value = newValue;

        // Move cursor to after the inserted reference
        const newCursorPos = autocompleteStartPos + referenceText.length;
        responseInput.setSelectionRange(newCursorPos, newCursorPos);

        // Add file to attachments (mark as text reference for sync)
        addFileAttachment(file, true);

        // Hide autocomplete
        hideAutocomplete();

        // Focus back on textarea
        responseInput.focus();
    }

    /**
     * Add a file or folder as attachment
     * @param file The file or folder to add
     * @param isTextReference True if added via #name syntax (should sync with text)
     */
    function addFileAttachment(file: FileSearchResult, isTextReference: boolean = false): void {
        const isFolder = file.isFolder === true;

        const isImage = !isFolder && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);

        const thumbnail = isImage ? file.uri : undefined;

        const attachment: AttachmentInfo = {
            id: `${isFolder ? 'folder' : 'file'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,

            // Note: substring(2, 8) extracts 6 chars starting at index 2, equivalent to deprecated substr(2, 6)
            name: file.name,
            uri: file.uri,
            isImage,
            isTextReference: isTextReference,
            isFolder: isFolder,
            folderPath: isFolder ? file.path : undefined,
            depth: isFolder ? -1 : undefined, // Default to recursive for autocomplete-added folders
            thumbnail,
        };

        currentAttachments.push(attachment);
        updateChipsDisplay();

        // Notify extension
        if (currentRequestId) {
            vscode.postMessage({
                type: 'addFileReference',
                requestId: currentRequestId,
                file: file
            });
        }
    }

    /**
     * Auto-resize textarea to fit content up to max height
     */
    function autoResizeTextarea(): void {
        if (!responseInput) return;

        // Skip resize during IME composition to prevent scroll issues on Windows
        if (isComposing) return;

        // Reset height to auto to get accurate scrollHeight
        responseInput.style.height = 'auto';
        responseInput.style.overflow = 'hidden';

        // Min and max heights
        const minHeight = 24; // Single line
        const maxHeight = 200; // Max before scrolling

        // Calculate new height based on scroll height
        const scrollHeight = responseInput.scrollHeight;
        const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

        responseInput.style.height = `${newHeight}px`;

        // Enable scrolling if content exceeds max
        if (scrollHeight > maxHeight) {
            responseInput.style.overflow = 'auto';
        }
    }

    /**
     * Handle textarea input for # trigger detection
     */
    function handleTextareaInput(): void {
        if (!responseInput) return;

        const value = responseInput.value;
        const cursorPos = responseInput.selectionStart;

        // Auto-resize textarea
        autoResizeTextarea();

        if (currentRequestId) {
            draftResponses.set(currentRequestId, value);
        }

        // Sync attachments with text - remove any attachments whose #filename is no longer in text
        syncAttachmentsWithText(value);

        // Look backward from cursor to find # trigger
        let hashPos = -1;

        for (let i = cursorPos - 1; i >= 0; i--) {
            const char = value[i];

            if (char === '#') {
                hashPos = i;
                break;
            }

            // Stop if we hit a space before finding #
            if (char === ' ' || char === '\n') {
                break;
            }
        }

        if (hashPos >= 0) {
            // Found # - extract query after it
            const query = value.substring(hashPos + 1, cursorPos);
            autocompleteStartPos = hashPos;
            autocompleteQuery = query;

            // Debounce file search
            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
            }

            searchDebounceTimer = setTimeout(() => {
                vscode.postMessage({
                    type: 'searchFiles',
                    query: query
                });
            }, 150);
        }

        else {

            // No # trigger - hide autocomplete
            if (autocompleteVisible) {
                hideAutocomplete();
            }
        }
    }

    /**
     * Sync attachments array with the text content
     * Remove file attachments whose #filename reference is no longer present
     * Only sync attachments that were added via text reference (isTextReference: true)
     * Keep image attachments and button-added files (they don't have text references)
     */
    function syncAttachmentsWithText(text: string): void {
        const toRemove: string[] = [];

        currentAttachments.forEach(att => {

            // Keep pasted/dropped images - they don't have text references
            if (att.isImage && att.id.startsWith('img_')) {
                return;
            }

            // Only sync attachments that were added via text reference
            // Button-added files should persist regardless of text content
            if (!att.isTextReference) {
                return;
            }

            // For text-referenced files, check if #filename still exists in text
            const reference = `#${att.name}`;

            if (!text.includes(reference)) {
                toRemove.push(att.id);
            }
        });

        // Remove attachments that no longer have text references
        if (toRemove.length > 0) {
            toRemove.forEach(id => {
                removeAttachment(id);
            });
        }
    }

    // ================================
    // Image Paste/Drop Functions
    // ================================

    /**
     * Handle paste event for images
     */
    function handlePaste(event: ClipboardEvent): void {
        if (!event.clipboardData) return;

        const items = event.clipboardData.items;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();

                if (file) {
                    processImageFile(file);
                }

                return;
            }
        }
    }

    /**
     * Handle drag enter event
     */
    function handleDragEnter(event: DragEvent): void {
        event.preventDefault();

        if (hasImageInDrag(event)) {
            dropZone?.classList.remove('hidden');
        }
    }

    /**
     * Handle drag over event
     */
    function handleDragOver(event: DragEvent): void {
        event.preventDefault();

        if (hasImageInDrag(event)) {
            event.dataTransfer!.dropEffect = 'copy';
        }
    }

    /**
     * Handle drag leave event
     */
    function handleDragLeave(event: DragEvent): void {
        // Only hide if leaving the drop zone entirely
        const related = event.relatedTarget as Node | null;

        if (!dropZone?.contains(related)) {
            dropZone?.classList.add('hidden');
        }
    }

    /**
     * Handle drop event
     */
    function handleDrop(event: DragEvent): void {
        event.preventDefault();
        dropZone?.classList.add('hidden');

        if (!event.dataTransfer) return;

        const files = event.dataTransfer.files;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (file.type.startsWith('image/')) {
                processImageFile(file);
            }
        }
    }

    /**
     * Check if drag event contains images
     */
    function hasImageInDrag(event: DragEvent): boolean {
        if (!event.dataTransfer) return false;

        const types = event.dataTransfer.types;

        if (types.includes('Files')) {
            // Check items for image type
            const items = event.dataTransfer.items;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Process an image file - convert to data URL and send to extension
     */
    function processImageFile(file: File): void {
        const reader = new FileReader();

        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;

            if (dataUrl && currentRequestId) {
                vscode.postMessage({
                    type: 'saveImage',
                    requestId: currentRequestId,
                    data: dataUrl,
                    mimeType: file.type,
                });
            }
        };
        reader.readAsDataURL(file);
    }

    // ================================
    // Event Listeners
    // ================================

    submitBtn?.addEventListener('click', handleSubmit);
    cancelBtn?.addEventListener('click', handleCancel);
    backBtn?.addEventListener('click', handleBack);

    // Attach button click handler - opens file picker
    attachBtn?.addEventListener('click', () => {
        if (currentRequestId) {
            vscode.postMessage({
                type: 'addAttachment', requestId: currentRequestId
            });
        }
    });

    // Textarea input handler for # autocomplete trigger
    responseInput?.addEventListener('input', handleTextareaInput);

    // IME composition handlers - prevent scroll issues on Windows during IME input
    responseInput?.addEventListener('compositionstart', () => {
        console.log(`composing start`)
        isComposing = true;
    });

    responseInput?.addEventListener('compositionend', () => {
        console.log(`composing end`)
        isComposing = false;
    });

    // Image paste handler
    responseInput?.addEventListener('paste', handlePaste);

    // Drag and drop handlers
    responseInput?.addEventListener('dragenter', handleDragEnter);
    responseInput?.addEventListener('dragover', handleDragOver);
    responseInput?.addEventListener('dragleave', handleDragLeave);
    responseInput?.addEventListener('drop', handleDrop);

    // Also bind to the textarea wrapper for better drop area
    const textareaWrapper = responseInput?.parentElement;
    textareaWrapper?.addEventListener('dragenter', handleDragEnter);
    textareaWrapper?.addEventListener('dragover', handleDragOver);
    textareaWrapper?.addEventListener('dragleave', handleDragLeave);
    textareaWrapper?.addEventListener('drop', handleDrop);

    // Handle keyboard navigation in textarea (for autocomplete and submit)
    responseInput?.addEventListener('keydown', (event: KeyboardEvent) => {
        // If a modifier key is pressed, decide whether to allow the default behavior in the input
        // (e.g., clipboard shortcuts and cursor movement) or to block character insertion and let
        // VS Code handle the shortcut.
        const modifierPressed = (event.altKey || event.metaKey || event.ctrlKey);
        if (modifierPressed) {
            const key = event.key;
            const isClipboardCmd = (event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'a'].includes(key.toLowerCase());
            const isArrowKey = key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';

            // Allow clipboard shortcuts (Ctrl/Cmd+C/X/V/A) and Ctrl/Cmd + Arrow navigation to work normally.
            if (isClipboardCmd || isArrowKey) {
                return;
            }

            // For other modifier shortcuts, prevent character insertion but let the event bubble
            // so VS Code can respond to the shortcut.
            event.preventDefault();
            return;
        }

        // Autocomplete navigation
        if (autocompleteVisible) {
            switch (event.key) {
                case 'ArrowDown': event.preventDefault();
                    if (selectedAutocompleteIndex < autocompleteResults.length - 1) {
                        selectedAutocompleteIndex++;
                        updateAutocompleteSelection();
                    }
                    return;
                case 'ArrowUp': event.preventDefault();
                    if (selectedAutocompleteIndex > 0) {
                        selectedAutocompleteIndex--;
                        updateAutocompleteSelection();
                    }
                    return;
                case 'Enter': case 'Tab':
                    if (selectedAutocompleteIndex >= 0) {
                        event.preventDefault();
                        selectAutocompleteItem(selectedAutocompleteIndex);
                    }
                    return;
                case 'Escape':
                    event.preventDefault();
                    hideAutocomplete();
                    return;
            }
        }

        // Regular Enter handling for submit
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
            case 'showQuestion': showQuestion(message.question, message.title, message.requestId, message.options);
                break;
            case 'showList': showList(message.requests);
                break;
            case 'showHome': recentInteractions = message.recentInteractions || [];
                showHome();

                // Update pending requests if provided
                if (message.pendingRequests) {
                    showList(message.pendingRequests);
                }

                // Update pending plan reviews if provided
                if (message.pendingPlanReviews) {
                    renderPendingReviews(message.pendingPlanReviews);
                }

                // Update history interactions if provided
                renderUnifiedHistory(message.historyInteractions || []);
                // Auto-switch to pending tab if there are pending requests/reviews
                const totalPending = (message.pendingRequests?.length || 0) + (message.pendingPlanReviews?.length || 0);

                if (totalPending > 0) {
                    switchTab('pending');
                }

                break;
            case 'showInteractionDetail': showInteractionDetail(message.interaction);
                break;

            case 'updateAttachments': if (message.requestId === currentRequestId) {

                // Preserve flags from existing attachments when updating
                const existingFlags = new Map(currentAttachments.map(a => [a.id, {
                    isImage: a.isImage, isTextReference: a.isTextReference
                }]));

                currentAttachments = (message.attachments || []).map((att: AttachmentInfo) => {
                    const existing = existingFlags.get(att.id);
                    return {
                        ...att,
                        isImage: att.isImage || existing?.isImage || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name),
                        isTextReference: att.isTextReference ?? existing?.isTextReference ?? false,
                    };
                });
                updateAttachmentsDisplay();
            }

                break;

            case 'fileSearchResults': if (autocompleteQuery !== undefined) {
                showAutocomplete(message.files || []);
            }
                break;

            case 'imageSaved': if (message.requestId === currentRequestId && message.attachment) {
                // Add to local attachments if not already there
                const exists = currentAttachments.some(a => a.id === message.attachment.id);

                if (!exists) {
                    currentAttachments.push({
                        ...message.attachment,
                        isImage: true,
                    });
                    updateChipsDisplay();
                }
            }

                break;

            case 'switchTab': if (message.tab) {
                switchTab(message.tab);
            }

                break;
            case 'clear': showHome();
                hideAutocomplete();
                break;
        }
    });

    // Initialize history filters
    initHistoryFilters();

    // Initialize history actions
    initHistoryActions();

    // Initialize batch selection handlers
    initBatchSelection();

    // Initialize in-webview toolbar (top buttons)
    initHomeToolbar();

    // Initialize delegated handlers for pending items
    initPendingItemsDelegation();

    // Initialize delegated handler for history list clicks/keys
    initHistoryListDelegation();

})();

// Type declaration for VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
