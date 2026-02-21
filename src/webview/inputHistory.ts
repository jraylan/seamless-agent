/**
 * Input History Manager
 *
 * Manages input history for textarea navigation with up/down arrow keys.
 * Supports draft saving, edit tracking, and localStorage persistence.
 */

/**
 * Configuration options for InputHistoryManager
 */
export interface InputHistoryConfig {
    /** LocalStorage key for persisting history */
    storageKey: string;
    /** Maximum number of history entries to keep */
    maxSize: number;
}

/**
 * Dependencies required by InputHistoryManager
 */
export interface InputHistoryDependencies {
    /** Function that returns the current textarea element */
    getTextarea: () => HTMLTextAreaElement | null;
    /** Callback to resize textarea after value changes */
    onTextChange: () => void;
}

/**
 * Manages input history with navigation and persistence
 */
export class InputHistoryManager {
    private history: string[] = [];
    private currentIndex: number = -1;
    private currentDraft: string = '';
    private editedEntries = new Map<number, string>();

    constructor(
        private deps: InputHistoryDependencies,
        private config: InputHistoryConfig
    ) {
        this.loadFromStorage();
    }

    /**
     * Load history from localStorage
     */
    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.config.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Validate array type and filter non-string elements
                if (Array.isArray(parsed)) {
                    this.history = parsed
                        .filter((v): v is string => typeof v === 'string')
                        .slice(-this.config.maxSize);
                } else {
                    this.history = [];
                }
            }
        } catch (error) {
            console.error('Failed to load input history:', error);
            this.history = [];
        }
    }

    /**
     * Save history to localStorage
     */
    private saveToStorage(): void {
        try {
            localStorage.setItem(this.config.storageKey, JSON.stringify(this.history));
        } catch (error) {
            console.error('Failed to save input history:', error);
        }
    }

    /**
     * Save current textarea value as edited history if it differs
     * If value is reverted to original, delete the edit cache
     */
    private saveCurrentEdit(): void {
        const textarea = this.deps.getTextarea();
        if (!textarea || this.currentIndex < 0 || this.currentIndex >= this.history.length) {
            return;
        }

        const original = this.history[this.currentIndex];
        const current = textarea.value;

        if (current === original) {
            // Delete edit cache when value is reverted to original
            this.editedEntries.delete(this.currentIndex);
        } else {
            // Save edit for modified values
            this.editedEntries.set(this.currentIndex, current);
        }
    }

    /**
     * Load history value (edited or original) into textarea
     */
    private loadValue(index: number): void {
        const textarea = this.deps.getTextarea();
        if (!textarea || index < 0 || index >= this.history.length) {
            return;
        }

        const editedValue = this.editedEntries.get(index);
        textarea.value = editedValue !== undefined ? editedValue : this.history[index];
    }

    /**
     * Navigate to previous (older) history entry
     */
    navigateUp(): void {
        const textarea = this.deps.getTextarea();
        if (!textarea || this.history.length === 0) {
            return;
        }

        // First time navigating: save current draft
        if (this.currentIndex === -1) {
            this.currentDraft = textarea.value;
            this.currentIndex = this.history.length;
        } else {
            // Save any edits before navigating away
            this.saveCurrentEdit();
        }

        // Move to previous entry
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.loadValue(this.currentIndex);
            this.deps.onTextChange();
            // Place cursor at start
            textarea.setSelectionRange(0, 0);
        }
    }

    /**
     * Navigate to next (newer) history entry
     */
    navigateDown(): void {
        const textarea = this.deps.getTextarea();
        if (!textarea || this.history.length === 0 || this.currentIndex === -1) {
            return;
        }

        // Save any edits before navigating away
        this.saveCurrentEdit();

        // Move to next entry
        this.currentIndex++;

        if (this.currentIndex >= this.history.length) {
            // Reached the end: restore draft
            this.currentIndex = -1;
            textarea.value = this.currentDraft;
        } else {
            // Load edited or original value
            this.loadValue(this.currentIndex);
        }

        this.deps.onTextChange();
        // Place cursor at end
        const textLength = textarea.value.length;
        textarea.setSelectionRange(textLength, textLength);
    }

    /**
     * Add new entry to history
     * @param text - Text to add (will be trimmed)
     */
    addToHistory(text: string): void {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }

        // Clear navigation state before mutating history to prevent index-mismatch bugs
        if (this.currentIndex !== -1 || this.editedEntries.size > 0) {
            this.resetState();
        }

        // Remove duplicate if exists
        const existingIndex = this.history.indexOf(trimmed);
        if (existingIndex !== -1) {
            this.history.splice(existingIndex, 1);
        }

        // Add to end
        this.history.push(trimmed);

        // Limit size
        if (this.history.length > this.config.maxSize) {
            this.history.shift();
        }

        // Persist
        this.saveToStorage();
    }

    /**
     * Reset navigation state (call when switching requests)
     */
    resetState(): void {
        this.currentIndex = -1;
        this.currentDraft = '';
        this.editedEntries.clear();
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.history = [];
        this.resetState();
        try {
            localStorage.removeItem(this.config.storageKey);
        } catch (error) {
            console.error('Failed to clear input history:', error);
        }
    }

    /**
     * Get current history (for debugging/testing)
     */
    getHistory(): readonly string[] {
        return [...this.history];
    }

    /**
     * Get current navigation state (for debugging/testing)
     */
    getState(): { index: number; draft: string; hasEdits: boolean } {
        return {
            index: this.currentIndex,
            draft: this.currentDraft,
            hasEdits: this.editedEntries.size > 0
        };
    }
}
