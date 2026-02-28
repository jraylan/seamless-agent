// Mock for the 'vscode' module used in tests.
// Patches Node's require() to intercept imports of 'vscode'
// and return a mock object, allowing unit tests to run outside of VS Code.
'use strict';

const Module = require('module');
const originalRequire = Module.prototype.require;

// In-memory config store for tests
const configStore = new Map();

function createMockMemento() {
    const store = new Map();
    return {
        get(key, defaultValue) {
            if (store.has(key)) {
                // Return a deep copy to simulate real storage behavior
                return JSON.parse(JSON.stringify(store.get(key)));
            }
            return defaultValue;
        },
        update(key, value) {
            store.set(key, JSON.parse(JSON.stringify(value)));
            return Promise.resolve();
        },
        keys() {
            return Array.from(store.keys());
        },
        _clear() {
            store.clear();
        }
    };
}

function createMockConfiguration(section) {
    return {
        get(key, defaultValue) {
            const fullKey = section ? `${section}.${key}` : key;
            if (configStore.has(fullKey)) {
                return configStore.get(fullKey);
            }
            return defaultValue;
        },
        has(key) {
            const fullKey = section ? `${section}.${key}` : key;
            return configStore.has(fullKey);
        },
        update(key, value) {
            const fullKey = section ? `${section}.${key}` : key;
            configStore.set(fullKey, value);
            return Promise.resolve();
        },
        inspect() {
            return undefined;
        }
    };
}

const changeConfigListeners = [];

const vscodeMock = {
    // Enums
    LogLevel: {
        Debug: 1,
        Info: 2,
        Warning: 3,
        Error: 4,
    },

    // Uri
    Uri: {
        file(path) {
            return { scheme: 'file', fsPath: path, path, toString: () => `file://${path}` };
        },
        parse(str) {
            return { scheme: 'file', fsPath: str.replace('file://', ''), path: str, toString: () => str };
        },
        joinPath(base, ...segments) {
            const joined = [base.fsPath || base.path, ...segments].join('/');
            return { scheme: 'file', fsPath: joined, path: joined, toString: () => `file://${joined}` };
        }
    },

    // Workspace
    workspace: {
        getConfiguration(section) {
            return createMockConfiguration(section);
        },
        onDidChangeConfiguration(listener) {
            changeConfigListeners.push(listener);
            return { dispose() { } };
        },
        workspaceFolders: [
            { uri: { fsPath: '/mock-workspace', path: '/mock-workspace' }, name: 'mock', index: 0 }
        ],
        fs: {
            writeFile(uri, content) {
                return Promise.resolve();
            },
            readFile(uri) {
                return Promise.resolve(Buffer.from(''));
            }
        }
    },

    // Window
    window: {
        createOutputChannel() {
            return {
                append() { },
                appendLine() { },
                clear() { },
                show() { },
                dispose() { },
            };
        },
        createStatusBarItem() {
            return {
                text: '',
                tooltip: '',
                command: undefined,
                backgroundColor: undefined,
                show() { },
                hide() { },
                dispose() { },
            };
        },
        showInformationMessage() { return Promise.resolve(undefined); },
        showWarningMessage() { return Promise.resolve(undefined); },
        showErrorMessage() { return Promise.resolve(undefined); },
        showInputBox() { return Promise.resolve(undefined); },
        showQuickPick() { return Promise.resolve(undefined); },
    },

    // Environment
    env: {
        language: 'en',
    },

    // Language Model (unused in unit tests but prevents import errors)
    lm: {
        tools: [],
        registerTool() { return { dispose() { } }; },
    },

    // Chat
    chat: {
        createChatParticipant() {
            return { iconPath: null, dispose() { } };
        }
    },

    // ThemeIcon
    ThemeIcon: class ThemeIcon {
        constructor(id) { this.id = id; }
    },

    // ThemeColor
    ThemeColor: class ThemeColor {
        constructor(id) { this.id = id; }
    },

    // StatusBarAlignment
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },

    // EventEmitter
    EventEmitter: class EventEmitter {
        constructor() {
            this._listeners = [];
        }
        get event() {
            return (listener) => {
                this._listeners.push(listener);
                return { dispose: () => {
                    const idx = this._listeners.indexOf(listener);
                    if (idx >= 0) this._listeners.splice(idx, 1);
                }};
            };
        }
        fire(data) {
            for (const listener of this._listeners) {
                listener(data);
            }
        }
        dispose() { this._listeners = []; }
    },

    // CancellationTokenSource
    CancellationTokenSource: class CancellationTokenSource {
        constructor() {
            this._isCancelled = false;
            this._listeners = [];
            this.token = {
                isCancellationRequested: false,
                onCancellationRequested: (listener) => {
                    this._listeners.push(listener);
                    return { dispose: () => { } };
                }
            };
        }
        cancel() {
            this._isCancelled = true;
            this.token.isCancellationRequested = true;
            for (const listener of this._listeners) {
                listener();
            }
        }
        dispose() { }
    },

    // Commands
    commands: {
        registerCommand() { return { dispose() { } }; },
        executeCommand() { return Promise.resolve(); }
    },

    // LanguageModelTextPart
    LanguageModelTextPart: class LanguageModelTextPart {
        constructor(value) { this.value = value; }
    },

    // LanguageModelToolResult
    LanguageModelToolResult: class LanguageModelToolResult {
        constructor(parts) { this.content = parts; }
    },

    // LanguageModelChatMessage
    LanguageModelChatMessage: {
        User(text) { return { role: 'user', content: text }; },
        Assistant(text) { return { role: 'assistant', content: text }; }
    },

    // Test helpers (not part of real vscode API)
    __test__: {
        configStore,
        changeConfigListeners,
        setConfig(key, value) {
            configStore.set(key, value);
        },
        clearConfig() {
            configStore.clear();
        },
        createMockMemento,
        createMockExtensionContext() {
            const globalState = createMockMemento();
            const workspaceState = createMockMemento();
            return {
                globalState,
                workspaceState,
                subscriptions: [],
                extensionUri: { fsPath: '/mock-extension', path: '/mock-extension' },
                extensionPath: '/mock-extension',
                storagePath: '/mock-storage',
                globalStoragePath: '/mock-global-storage',
            };
        }
    }
};

// Patch require to intercept 'vscode' module
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, arguments);
};

// Export for direct use in tests
module.exports = vscodeMock;
