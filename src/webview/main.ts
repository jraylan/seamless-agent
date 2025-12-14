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
            selectFile: string;
            noFilesFound: string;
            dropImageHere: string;
        };
    }
}

window.renderMarkdown = renderMarkdown;

// Types
interface AttachmentInfo {
    id: string;
    name: string;
    uri: string;
    isImage?: boolean;
    isTextReference?: boolean;  // True if added via #name syntax (should be synced with text)
    thumbnail?: string;  // Base64 data URL for image preview
}

interface RequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    attachments: AttachmentInfo[];
}

interface FileSearchResult {
    name: string;
    path: string;
    uri: string;
    icon: string;
}

// Webview initialization
(function () {
    // Acquire VS Code API
    const vscode = acquireVsCodeApi();

    // State
    let currentRequestId: string | null = null;
    let currentAttachments: AttachmentInfo[] = [];
    let hasMultipleRequests = false;

    // Autocomplete state
    let autocompleteVisible = false;
    let autocompleteResults: FileSearchResult[] = [];
    let selectedAutocompleteIndex = -1;
    let autocompleteQuery = '';
    let autocompleteStartPos = -1;
    let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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
    const chipsContainer = document.getElementById('chips-container');
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    const autocompleteList = document.getElementById('autocomplete-list');
    const autocompleteEmpty = document.getElementById('autocomplete-empty');
    const dropZone = document.getElementById('drop-zone');
    const attachBtn = document.getElementById('attach-btn');

    /**
 * Show the list of pending requests
 */
    function showList(requests: RequestItem[]): void {
        hasMultipleRequests = requests.length > 1;

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

        // Set header title
        if (headerTitle) {
            headerTitle.textContent = title || 'Confirmation Required';
        }

        if (questionContent) {
            questionContent.innerHTML = renderMarkdown(question);
        }

        if (responseInput) {
            responseInput.value = '';
            // Initialize textarea height
            autoResizeTextarea();
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

        emptyState?.classList.remove('hidden');
        requestForm?.classList.add('hidden');
        requestList?.classList.add('hidden');
        requestHeader?.classList.add('hidden');

        if (responseInput) {
            responseInput.value = '';
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
        } else {
            chipsContainer.classList.remove('hidden');
            chipsContainer.innerHTML = currentAttachments.map(att => {
                const isImage = att.isImage || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name);

                // For images, show a friendly "Pasted Image" label with image icon
                // For files, show icon + filename
                const displayName = isImage && att.id.startsWith('img_') ? 'Pasted Image' : att.name;
                const iconClass = isImage ? 'file-media' : getFileIcon(att.name);
                const chipClass = isImage ? 'chip chip-image' : 'chip';

                return `
                <div class="${chipClass}" data-id="${att.id}" title="${escapeHtml(att.name)}">
                    <span class="chip-icon"><span class="codicon codicon-${iconClass}"></span></span>
                    <span class="chip-text">${escapeHtml(displayName)}</span>
                    <button class="chip-remove" data-remove="${att.id}" title="${window.__STRINGS__?.remove || 'Remove'}" aria-label="Remove ${escapeHtml(att.name)}">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
            `;
            }).join('');

            // Bind remove buttons
            chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const attId = (btn as HTMLElement).getAttribute('data-remove');
                    if (attId) {
                        removeAttachment(attId);
                    }
                });
            });
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
        } else {
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

        autocompleteList.innerHTML = autocompleteResults.map((file, index) => `
            <div class="autocomplete-item${index === selectedAutocompleteIndex ? ' selected' : ''}" 
                 data-index="${index}" tabindex="-1">
                <span class="autocomplete-item-icon">
                    <span class="codicon codicon-${file.icon}"></span>
                </span>
                <div class="autocomplete-item-content">
                    <span class="autocomplete-item-name">${escapeHtml(file.name)}</span>
                    <span class="autocomplete-item-path">${escapeHtml(file.path)}</span>
                </div>
            </div>
        `).join('');

        // Bind click events
        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', (e) => {
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
            } else {
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
            selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
        const referenceText = `#${file.name} `;

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
     * Add a file as attachment
     * @param file The file to add
     * @param isTextReference True if added via #name syntax (should sync with text)
     */
    function addFileAttachment(file: FileSearchResult, isTextReference: boolean = false): void {
        const attachment: AttachmentInfo = {
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: file.name,
            uri: file.uri,
            isImage: /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name),
            isTextReference: isTextReference
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

        // Reset height to auto to get accurate scrollHeight
        responseInput.style.height = 'auto';
        responseInput.style.overflow = 'hidden';

        // Min and max heights
        const minHeight = 24;  // Single line
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
        } else {
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
                    mimeType: file.type
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
            vscode.postMessage({ type: 'addAttachment', requestId: currentRequestId });
        }
    });

    // Textarea input handler for # autocomplete trigger
    responseInput?.addEventListener('input', handleTextareaInput);

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
        // Autocomplete navigation
        if (autocompleteVisible) {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    if (selectedAutocompleteIndex < autocompleteResults.length - 1) {
                        selectedAutocompleteIndex++;
                        updateAutocompleteSelection();
                    }
                    return;
                case 'ArrowUp':
                    event.preventDefault();
                    if (selectedAutocompleteIndex > 0) {
                        selectedAutocompleteIndex--;
                        updateAutocompleteSelection();
                    }
                    return;
                case 'Enter':
                case 'Tab':
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
            case 'showQuestion':
                showQuestion(message.question, message.title, message.requestId);
                break;
            case 'showList':
                showList(message.requests);
                break;
            case 'updateAttachments':
                if (message.requestId === currentRequestId) {
                    // Preserve flags from existing attachments when updating
                    const existingFlags = new Map(
                        currentAttachments.map(a => [a.id, { isImage: a.isImage, isTextReference: a.isTextReference }])
                    );
                    currentAttachments = (message.attachments || []).map((att: AttachmentInfo) => {
                        const existing = existingFlags.get(att.id);
                        return {
                            ...att,
                            isImage: att.isImage || existing?.isImage || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name),
                            isTextReference: att.isTextReference ?? existing?.isTextReference ?? false
                        };
                    });
                    updateAttachmentsDisplay();
                }
                break;
            case 'fileSearchResults':
                if (autocompleteQuery !== undefined) {
                    showAutocomplete(message.files || []);
                }
                break;
            case 'imageSaved':
                if (message.requestId === currentRequestId && message.attachment) {
                    // Add to local attachments if not already there
                    const exists = currentAttachments.some(a => a.id === message.attachment.id);
                    if (!exists) {
                        currentAttachments.push({
                            ...message.attachment,
                            isImage: true
                        });
                        updateChipsDisplay();
                    }
                }
                break;
            case 'clear':
                showEmpty();
                hideAutocomplete();
                break;
        }
    });
}

)();

// Type declaration for VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

    ;