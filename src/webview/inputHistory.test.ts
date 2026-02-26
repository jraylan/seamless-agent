/**
 * Unit Tests for InputHistoryManager
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { InputHistoryManager, InputHistoryConfig, InputHistoryDependencies } from './inputHistory';

// Mock HTMLTextAreaElement for testing
class MockTextarea {
    value: string = '';
    selectionStart: number = 0;
    selectionEnd: number = 0;

    setSelectionRange(start: number, end: number): void {
        this.selectionStart = start;
        this.selectionEnd = end;
    }
}

// Mock localStorage
const mockLocalStorage = (() => {
    let store: Map<string, string> = new Map();

    return {
        getItem(key: string): string | null {
            return store.get(key) || null;
        },
        setItem(key: string, value: string): void {
            store.set(key, value);
        },
        removeItem(key: string): void {
            store.delete(key);
        },
        clear(): void {
            store.clear();
        }
    };
})();

// Setup global localStorage
(global as any).localStorage = mockLocalStorage;

// Helper to seed history with test data
function seedHistory(manager: InputHistoryManager, entries: string[]): void {
    for (const entry of entries) {
        manager.addToHistory(entry);
    }
}

describe('InputHistoryManager', () => {
    let textarea: MockTextarea;
    let textChangeCallCount: number;
    let manager: InputHistoryManager;

    const createManager = (storageKey = 'test-history', maxSize = 50) => {
        textChangeCallCount = 0;
        textarea = new MockTextarea();

        const deps: InputHistoryDependencies = {
            getTextarea: () => textarea as any,
            onTextChange: () => textChangeCallCount++
        };

        const config: InputHistoryConfig = {
            storageKey,
            maxSize
        };

        return new InputHistoryManager(deps, config, console);
    };

    beforeEach(() => {
        mockLocalStorage.clear();
        manager = createManager();
    });

    afterEach(() => {
        mockLocalStorage.clear();
    });

    describe('Initialization', () => {
        it('should start with empty history', () => {
            const history = manager.getHistory();
            assert.strictEqual(history.length, 0);
        });

        it('should start with reset state', () => {
            const state = manager.getState();
            assert.strictEqual(state.index, -1);
            assert.strictEqual(state.draft, '');
            assert.strictEqual(state.hasEdits, false);
        });

        it('should load history from localStorage', () => {
            mockLocalStorage.setItem('test-history', JSON.stringify(['item1', 'item2']));
            const newManager = createManager();
            const history = newManager.getHistory();
            assert.strictEqual(history.length, 2);
            assert.strictEqual(history[0], 'item1');
            assert.strictEqual(history[1], 'item2');
        });

        it('should handle invalid localStorage data', () => {
            // Suppress expected console.error during this test
            const originalError = console.error;
            console.error = () => { };

            try {
                mockLocalStorage.setItem('test-history', 'invalid json');
                const newManager = createManager();
                const history = newManager.getHistory();
                assert.strictEqual(history.length, 0);
            } finally {
                // Always restore console.error, even if test fails
                console.error = originalError;
            }
        });

        it('should limit loaded history to maxSize', () => {
            const largeHistory = Array.from({ length: 100 }, (_, i) => `item${i}`);
            mockLocalStorage.setItem('test-history', JSON.stringify(largeHistory));
            const newManager = createManager('test-history', 50);
            const history = newManager.getHistory();
            assert.strictEqual(history.length, 50);
            // Should keep the most recent entries
            assert.strictEqual(history[0], 'item50');
            assert.strictEqual(history[49], 'item99');
        });
    });

    describe('addToHistory', () => {
        it('should add new entry to history', () => {
            manager.addToHistory('test entry');
            const history = manager.getHistory();
            assert.strictEqual(history.length, 1);
            assert.strictEqual(history[0], 'test entry');
        });

        it('should trim whitespace before adding', () => {
            manager.addToHistory('  test entry  \n');
            const history = manager.getHistory();
            assert.strictEqual(history[0], 'test entry');
        });

        it('should ignore empty strings', () => {
            manager.addToHistory('');
            manager.addToHistory('   ');
            manager.addToHistory('\n\t');
            const history = manager.getHistory();
            assert.strictEqual(history.length, 0);
        });

        it('should remove duplicates and move to end', () => {
            manager.addToHistory('entry1');
            manager.addToHistory('entry2');
            manager.addToHistory('entry3');
            manager.addToHistory('entry1'); // Duplicate

            const history = manager.getHistory();
            assert.strictEqual(history.length, 3);
            assert.strictEqual(history[0], 'entry2');
            assert.strictEqual(history[1], 'entry3');
            assert.strictEqual(history[2], 'entry1');
        });

        it('should limit history size', () => {
            const smallManager = createManager('test-small', 3);

            smallManager.addToHistory('entry1');
            smallManager.addToHistory('entry2');
            smallManager.addToHistory('entry3');
            smallManager.addToHistory('entry4');

            const history = smallManager.getHistory();
            assert.strictEqual(history.length, 3);
            assert.strictEqual(history[0], 'entry2');
            assert.strictEqual(history[1], 'entry3');
            assert.strictEqual(history[2], 'entry4');
        });

        it('should persist to localStorage', () => {
            manager.addToHistory('saved entry');
            const stored = mockLocalStorage.getItem('test-history');
            assert.ok(stored);
            const parsed = JSON.parse(stored);
            assert.strictEqual(parsed.length, 1);
            assert.strictEqual(parsed[0], 'saved entry');
        });
    });

    describe('navigateUp', () => {
        beforeEach(() => {
            seedHistory(manager, ['entry1', 'entry2', 'entry3']);
            textarea.value = 'current input';
        });

        it('should save current draft on first navigation', () => {
            manager.navigateUp();
            const state = manager.getState();
            assert.strictEqual(state.draft, 'current input');
        });

        it('should load most recent entry on first up', () => {
            manager.navigateUp();
            assert.strictEqual(textarea.value, 'entry3');
        });

        it('should navigate through history', () => {
            manager.navigateUp();
            assert.strictEqual(textarea.value, 'entry3');

            manager.navigateUp();
            assert.strictEqual(textarea.value, 'entry2');

            manager.navigateUp();
            assert.strictEqual(textarea.value, 'entry1');
        });

        it('should call onTextChange callback', () => {
            manager.navigateUp();
            assert.ok(textChangeCallCount > 0);
        });

        it('should place cursor at start', () => {
            manager.navigateUp();
            assert.strictEqual(textarea.selectionStart, 0);
            assert.strictEqual(textarea.selectionEnd, 0);
        });

        it('should not navigate past oldest entry', () => {
            manager.navigateUp(); // entry3
            manager.navigateUp(); // entry2
            manager.navigateUp(); // entry1
            manager.navigateUp(); // Should stay at entry1

            assert.strictEqual(textarea.value, 'entry1');
            const state = manager.getState();
            assert.strictEqual(state.index, 0);
        });

        it('should save edits before navigating', () => {
            manager.navigateUp(); // Load entry3
            textarea.value = 'edited entry3';

            manager.navigateUp(); // Should save edit and load entry2
            assert.strictEqual(textarea.value, 'entry2');

            manager.navigateDown(); // Should load edited version
            assert.strictEqual(textarea.value, 'edited entry3');
        });
    });

    describe('navigateDown', () => {
        beforeEach(() => {
            seedHistory(manager, ['entry1', 'entry2', 'entry3']);
            textarea.value = 'current input';
            // Navigate up first
            manager.navigateUp(); // entry3
            manager.navigateUp(); // entry2
        });

        it('should navigate to newer entries', () => {
            manager.navigateDown();
            assert.strictEqual(textarea.value, 'entry3');
        });

        it('should restore draft when reaching end', () => {
            manager.navigateDown(); // entry3
            manager.navigateDown(); // Should restore draft

            assert.strictEqual(textarea.value, 'current input');
            const state = manager.getState();
            assert.strictEqual(state.index, -1);
        });

        it('should place cursor at end', () => {
            manager.navigateDown();
            const textLength = textarea.value.length;
            assert.strictEqual(textarea.selectionStart, textLength);
            assert.strictEqual(textarea.selectionEnd, textLength);
        });

        it('should do nothing if not navigating', () => {
            // Reset to non-navigating state
            manager.resetState();
            textarea.value = 'test';

            manager.navigateDown();
            assert.strictEqual(textarea.value, 'test');
        });

        it('should save edits before navigating', () => {
            textarea.value = 'edited entry2';

            manager.navigateDown(); // Should save edit and load entry3
            assert.strictEqual(textarea.value, 'entry3');

            manager.navigateUp(); // Should load edited version
            assert.strictEqual(textarea.value, 'edited entry2');
        });
    });

    describe('resetState', () => {
        it('should reset navigation state', () => {
            manager.addToHistory('entry1');
            textarea.value = 'draft';
            manager.navigateUp();

            manager.resetState();

            const state = manager.getState();
            assert.strictEqual(state.index, -1);
            assert.strictEqual(state.draft, '');
            assert.strictEqual(state.hasEdits, false);
        });

        it('should not affect history', () => {
            manager.addToHistory('entry1');
            manager.addToHistory('entry2');

            manager.resetState();

            const history = manager.getHistory();
            assert.strictEqual(history.length, 2);
        });
    });

    describe('clearHistory', () => {
        it('should clear all history', () => {
            manager.addToHistory('entry1');
            manager.addToHistory('entry2');

            manager.clearHistory();

            const history = manager.getHistory();
            assert.strictEqual(history.length, 0);
        });

        it('should reset state', () => {
            manager.addToHistory('entry1');
            textarea.value = 'draft';
            manager.navigateUp();

            manager.clearHistory();

            const state = manager.getState();
            assert.strictEqual(state.index, -1);
            assert.strictEqual(state.draft, '');
        });

        it('should remove from localStorage', () => {
            manager.addToHistory('entry1');
            assert.ok(mockLocalStorage.getItem('test-history'));

            manager.clearHistory();
            assert.strictEqual(mockLocalStorage.getItem('test-history'), null);
        });
    });

    describe('Edge Cases', () => {
        it('should handle navigation with empty history', () => {
            manager.navigateUp();
            manager.navigateDown();

            // Should not throw or crash
            assert.ok(true);
        });

        it('should handle null textarea', () => {
            const managerWithNullTextarea = new InputHistoryManager(
                {
                    getTextarea: () => null,
                    onTextChange: () => { }
                },
                {
                    storageKey: 'test',
                    maxSize: 50
                },
                console
            );

            managerWithNullTextarea.addToHistory('test');
            managerWithNullTextarea.navigateUp();
            managerWithNullTextarea.navigateDown();

            // Should not throw
            assert.ok(true);
        });

        it('should handle rapid navigation', () => {
            seedHistory(manager, ['entry1', 'entry2', 'entry3']);

            for (let i = 0; i < 10; i++) {
                manager.navigateUp();
            }

            const state = manager.getState();
            assert.strictEqual(state.index, 0);

            for (let i = 0; i < 10; i++) {
                manager.navigateDown();
            }

            const finalState = manager.getState();
            assert.strictEqual(finalState.index, -1);
        });

        it('should clear navigation state when addToHistory is called during navigation', () => {
            // Regression test for index-mismatch bug
            seedHistory(manager, ['cmd1', 'cmd2', 'cmd3']);

            // Navigate up and edit an entry
            manager.navigateUp();
            manager.navigateUp();
            textarea.value = 'cmd2_edited';

            // Verify edit state exists
            const stateBefore = manager.getState();
            assert.strictEqual(stateBefore.index, 1);

            // Add new history while navigating (should clear edit state)
            manager.addToHistory('new_cmd');

            // Verify navigation state was cleared
            const stateAfter = manager.getState();
            assert.strictEqual(stateAfter.index, -1, 'currentIndex should be reset to -1');
            assert.strictEqual(stateAfter.draft, '', 'draft should be cleared');

            // Verify new entry was added
            const history = manager.getHistory();
            assert.ok(history.includes('new_cmd'), 'new entry should be in history');
        });

        it('should preserve history across manager instances', () => {
            manager.addToHistory('entry1');
            manager.addToHistory('entry2');

            // Create new manager with same storage key
            const manager2 = createManager('test-history');
            const history = manager2.getHistory();

            assert.strictEqual(history.length, 2);
            assert.strictEqual(history[0], 'entry1');
            assert.strictEqual(history[1], 'entry2');
        });
    });

    describe('Integration Scenarios', () => {
        it('should support typical user workflow', () => {
            // User types and submits
            textarea.value = 'first message';
            manager.addToHistory(textarea.value);

            // User types second message
            textarea.value = 'second message';
            manager.addToHistory(textarea.value);

            // User starts typing but wants to recall first message
            textarea.value = 'partial thi';
            manager.navigateUp(); // Should see 'second message'
            assert.strictEqual(textarea.value, 'second message');

            manager.navigateUp(); // Should see 'first message'
            assert.strictEqual(textarea.value, 'first message');

            // User edits it
            textarea.value = 'first message (edited)';

            // User navigates back down
            manager.navigateDown(); // Should see edited second message or back to second?
            manager.navigateDown(); // Should restore 'partial thi'
            assert.strictEqual(textarea.value, 'partial thi');
        });

        it('should handle request switching', () => {
            textarea.value = 'draft for request A';
            manager.addToHistory('submitted for A');

            // Switch to request B
            manager.resetState();
            textarea.value = 'draft for request B';

            // Navigate history - should not see request A's draft
            manager.navigateUp();
            assert.strictEqual(textarea.value, 'submitted for A');
        });

        it('should clean edit cache when value reverted to original', () => {
            // Add history
            manager.addToHistory('original value');

            // Navigate to it and edit
            manager.navigateUp();
            assert.strictEqual(textarea.value, 'original value');

            // Edit it
            textarea.value = 'modified value';
            // Navigate away to trigger saveCurrentEdit
            manager.navigateDown();
            const state1 = manager.getState();
            assert.strictEqual(state1.hasEdits, true, 'Should have edits cached');

            // Navigate back and revert to original
            manager.navigateUp();
            textarea.value = 'original value';

            // Navigate away to trigger saveCurrentEdit (which should delete the edit)
            manager.navigateDown();
            manager.navigateUp(); // Navigate back to check

            // Edit cache should be cleaned
            const state2 = manager.getState();
            assert.strictEqual(state2.hasEdits, false, 'Edit cache should be empty when reverted to original');
            assert.strictEqual(textarea.value, 'original value', 'Should load original value');
        });

        it('should filter non-string elements from localStorage', () => {
            // Pollute localStorage with mixed types
            const pollutedData = [
                'valid string',
                123,
                { type: 'object' },
                null,
                undefined,
                'another valid string',
                true,
                ['nested', 'array']
            ];
            mockLocalStorage.setItem('test-polluted', JSON.stringify(pollutedData));

            // Create new manager (will load from storage)
            const newTextarea = new MockTextarea();
            const newManager = new InputHistoryManager(
                {
                    getTextarea: () => newTextarea as any,
                    onTextChange: () => { }
                },
                {
                    storageKey: 'test-polluted',
                    maxSize: 50
                },
                console
            );

            // Should only keep string elements
            const history = newManager.getHistory();
            assert.strictEqual(history.length, 2, 'Should filter non-string elements');
            assert.strictEqual(history[0], 'valid string');
            assert.strictEqual(history[1], 'another valid string');
        });
    });
});
