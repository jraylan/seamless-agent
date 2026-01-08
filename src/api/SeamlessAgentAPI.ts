/**
 * Seamless Agent Public API
 * 
 * Facade implementation providing a unified API for addon extensions.
 * Implements the Facade Pattern to simplify addon integration.
 */

import * as vscode from 'vscode';
import type {
    ISeamlessAgentAPI,
    IAddon,
    IAddonRegistration,
    IUIIntegration,
    IToolsIntegration,
    IEventEmitter,
    IStorageIntegration,
    ICustomTab,
    ISettingsSection,
    IHistoryItemProvider,
    IAddonTool,
    IToolExecutionContext,
    IAskUserParams,
    IUserResponse,
    IPlanReviewParams,
    IPlanReviewResult,
} from './types';
import { SeamlessAgentEvents } from './types';
import { SeamlessEventEmitter } from './events';
import { AddonRegistry } from '../addons/registry';

/**
 * Current API version
 */
export const API_VERSION = '1.0.0';

/**
 * UI Integration implementation
 */
class UIIntegrationImpl implements IUIIntegration {
    private readonly customTabs: Map<string, ICustomTab> = new Map();
    private readonly historyProviders: Map<string, IHistoryItemProvider> = new Map();
    private readonly settingsSections: Map<string, ISettingsSection> = new Map();
    private switchTabFn?: (tabId: string) => void;
    // Map tabId -> addonId for explicit ownership tracking
    private readonly tabOwners: Map<string, string> = new Map();

    constructor(
        private readonly registry: AddonRegistry,
        private readonly eventEmitter: IEventEmitter
    ) { }

    /**
     * Register a custom tab
     * @param tab - Tab configuration
     * @param addonId - Addon ID for ownership tracking
     */
    registerTab(tab: ICustomTab, addonId: string): vscode.Disposable {
        if (this.customTabs.has(tab.id)) {
            throw new Error(`Tab with ID '${tab.id}' is already registered`);
        }

        this.customTabs.set(tab.id, tab);
        this.tabOwners.set(tab.id, addonId);
        this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'tab_added', tabId: tab.id });

        return {
            dispose: () => {
                this.customTabs.delete(tab.id);
                this.tabOwners.delete(tab.id);
                this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'tab_removed', tabId: tab.id });
            }
        };
    }

    /**
     * Register a history item provider
     */
    registerHistoryProvider(provider: IHistoryItemProvider): vscode.Disposable {
        if (this.historyProviders.has(provider.id)) {
            throw new Error(`History provider with ID '${provider.id}' is already registered`);
        }

        this.historyProviders.set(provider.id, provider);
        this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'history_provider_added' });

        return {
            dispose: () => {
                this.historyProviders.delete(provider.id);
                this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'history_provider_removed' });
            }
        };
    }

    /**
     * Register a settings section
     */
    registerSettingsSection(section: ISettingsSection): vscode.Disposable {
        if (this.settingsSections.has(section.id)) {
            throw new Error(`Settings section with ID '${section.id}' is already registered`);
        }

        this.settingsSections.set(section.id, section);
        this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'settings_section_added' });

        return {
            dispose: () => {
                this.settingsSections.delete(section.id);
                this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'settings_section_removed' });
            }
        };
    }

    /**
     * Refresh the webview UI
     */
    refresh(): void {
        this.eventEmitter.emit(SeamlessAgentEvents.UI_REFRESH, { type: 'manual_refresh' });
    }

    /**
     * Get all registered tabs (including from addons via registry)
     */
    getTabs(): ICustomTab[] {
        // Combine tabs from registry and directly registered tabs
        const registryTabs = this.registry.getAllTabs();
        const directTabs = Array.from(this.customTabs.values());

        const allTabs = [...registryTabs, ...directTabs];

        // Sort by priority
        return allTabs.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }

    /**
     * Get all registered settings sections
     */
    getSettingsSections(): ISettingsSection[] {
        // Combine sections from registry and directly registered sections
        const registrySections = this.registry.getAllSettingsSections();
        const directSections = Array.from(this.settingsSections.values());

        const allSections = [...registrySections, ...directSections];

        // Sort by priority
        return allSections.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }

    /**
     * Get all registered history providers
     */
    getHistoryProviders(): IHistoryItemProvider[] {
        return Array.from(this.historyProviders.values());
    }

    /**
     * Count tabs registered by a specific addon
     * @param addonId - The addon ID to count tabs for
     * @returns Number of tabs registered by the addon
     */
    getTabCountByAddon(addonId: string): number {
        let count = 0;
        for (const ownerId of this.tabOwners.values()) {
            if (ownerId === addonId) {
                count++;
            }
        }
        return count;
    }

    /**
     * Select/open a specific tab in the webview
     */
    selectTab(tabId: string): void {
        if (this.switchTabFn) {
            this.switchTabFn(tabId);
        } else {
            console.warn('[UIIntegration] selectTab called but no webview provider is connected');
        }
    }

    /**
     * @internal Set the function to switch tabs (called during extension initialization)
     */
    setSwitchTabFunction(fn: (tabId: string) => void): void {
        this.switchTabFn = fn;
    }
}

/**
 * Tools Integration implementation
 */
class ToolsIntegrationImpl implements IToolsIntegration {
    private readonly tools: Map<string, IAddonTool> = new Map();
    private readonly toolDisposables: Map<string, vscode.Disposable> = new Map();
    private askUserFn?: (params: IAskUserParams) => Promise<IUserResponse>;
    private planReviewFn?: (params: IPlanReviewParams) => Promise<IPlanReviewResult>;

    constructor(
        private readonly registry: AddonRegistry,
        private readonly eventEmitter: IEventEmitter,
        private readonly getAPI: () => ISeamlessAgentAPI
    ) { }

    /**
     * Set the askUser function for direct API calls
     */
    setAskUserFunction(fn: (params: IAskUserParams) => Promise<IUserResponse>): void {
        this.askUserFn = fn;
    }

    /**
     * Set the planReview function for direct API calls
     */
    setPlanReviewFunction(fn: (params: IPlanReviewParams) => Promise<IPlanReviewResult>): void {
        this.planReviewFn = fn;
    }

    /**
     * Register an AI tool
     */
    registerTool(tool: IAddonTool): vscode.Disposable {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool with name '${tool.name}' is already registered`);
        }

        this.tools.set(tool.name, tool);

        // Register with VS Code Language Model API
        const lmTool = vscode.lm.registerTool(tool.name, {
            invoke: async (options, token) => {
                const context: IToolExecutionContext = {
                    api: this.getAPI(),
                    requestId: `${tool.name}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                };

                try {
                    const result = await tool.execute(options.input, context, token);

                    this.eventEmitter.emit(SeamlessAgentEvents.TOOL_EXECUTED, {
                        toolName: tool.name,
                        success: true,
                        requestId: context.requestId,
                    });

                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(JSON.stringify(result))
                    ]);
                } catch (error) {
                    this.eventEmitter.emit(SeamlessAgentEvents.TOOL_EXECUTED, {
                        toolName: tool.name,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        requestId: context.requestId,
                    });

                    throw error;
                }
            }
        });

        this.toolDisposables.set(tool.name, lmTool);

        return {
            dispose: () => {
                this.tools.delete(tool.name);
                const disposable = this.toolDisposables.get(tool.name);
                if (disposable) {
                    disposable.dispose();
                    this.toolDisposables.delete(tool.name);
                }
            }
        };
    }

    /**
     * Get all registered tools
     */
    getTools(): IAddonTool[] {
        // Combine tools from registry and directly registered tools
        const registryTools = this.registry.getAllTools();
        const directTools = Array.from(this.tools.values());

        return [...registryTools, ...directTools];
    }

    /**
     * Call the native askUser tool
     */
    async askUser(params: IAskUserParams): Promise<IUserResponse> {
        if (!this.askUserFn) {
            throw new Error('askUser function not initialized');
        }
        return this.askUserFn(params);
    }

    /**
     * Call the native planReview tool
     */
    async planReview(params: IPlanReviewParams): Promise<IPlanReviewResult> {
        if (!this.planReviewFn) {
            throw new Error('planReview function not initialized');
        }
        return this.planReviewFn(params);
    }
}

/**
 * Storage Integration implementation for addon data persistence
 */
class StorageIntegrationImpl implements IStorageIntegration {
    private readonly namespace: string;
    private readonly globalState: vscode.Memento;

    constructor(context: vscode.ExtensionContext, addonId: string) {
        this.namespace = `addon::${addonId}`;
        this.globalState = context.globalState;
    }

    /**
     * Get a stored value
     */
    get<T>(key: string, defaultValue?: T): T | undefined {
        const fullKey = `${this.namespace}::${key}`;
        return this.globalState.get<T>(fullKey, defaultValue as T);
    }

    /**
     * Set a stored value
     */
    async set<T>(key: string, value: T): Promise<void> {
        const fullKey = `${this.namespace}::${key}`;
        await this.globalState.update(fullKey, value);
    }

    /**
     * Delete a stored value
     */
    async delete(key: string): Promise<void> {
        const fullKey = `${this.namespace}::${key}`;
        await this.globalState.update(fullKey, undefined);
    }

    /**
     * Get all keys for this addon
     */
    keys(): string[] {
        const allKeys = this.globalState.keys();
        const prefix = `${this.namespace}::`;
        return allKeys
            .filter(key => key.startsWith(prefix))
            .map(key => key.substring(prefix.length));
    }

    /**
     * Clear all addon storage
     */
    async clear(): Promise<void> {
        const keys = this.keys();
        for (const key of keys) {
            await this.delete(key);
        }
    }
}

/**
 * Storage Integration Factory
 */
class StorageIntegrationFactory {
    private readonly storages: Map<string, IStorageIntegration> = new Map();

    constructor(private readonly context: vscode.ExtensionContext) { }

    /**
     * Get or create storage for an addon
     */
    getStorage(addonId: string): IStorageIntegration {
        if (!this.storages.has(addonId)) {
            this.storages.set(addonId, new StorageIntegrationImpl(this.context, addonId));
        }
        return this.storages.get(addonId)!;
    }
}

/**
 * Main Seamless Agent API implementation.
 * Facade providing unified access to all addon integration features.
 */
export class SeamlessAgentAPI implements ISeamlessAgentAPI, vscode.Disposable {
    public readonly version: string = API_VERSION;

    private readonly _eventEmitter: SeamlessEventEmitter;
    private readonly _registry: AddonRegistry;
    private readonly _ui: UIIntegrationImpl;
    private readonly _tools: ToolsIntegrationImpl;
    private readonly _storageFactory: StorageIntegrationFactory;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _context: vscode.ExtensionContext) {
        // Initialize event emitter
        this._eventEmitter = new SeamlessEventEmitter();
        this._disposables.push({ dispose: () => this._eventEmitter.dispose() });

        // Initialize registry
        this._registry = new AddonRegistry(this._eventEmitter);
        this._disposables.push(this._registry);

        // Initialize UI integration
        this._ui = new UIIntegrationImpl(this._registry, this._eventEmitter);

        // Initialize Tools integration
        this._tools = new ToolsIntegrationImpl(
            this._registry,
            this._eventEmitter,
            () => this
        );

        // Initialize storage factory
        this._storageFactory = new StorageIntegrationFactory(_context);

        console.log(`[SeamlessAgentAPI] Initialized API v${this.version}`);
    }

    /**
     * Get the extension context
     */
    get context(): vscode.ExtensionContext {
        return this._context;
    }

    /**
     * Get the UI integration
     */
    get ui(): IUIIntegration {
        return this._ui;
    }

    /**
     * Get the Tools integration
     */
    get tools(): IToolsIntegration {
        return this._tools;
    }

    /**
     * Get the event emitter
     */
    get events(): IEventEmitter {
        return this._eventEmitter;
    }

    /**
     * Get storage for a specific addon (internal use)
     */
    get storage(): IStorageIntegration {
        // Return a no-op storage for the main extension
        // Addons get their own namespaced storage via registerAddon
        return this._storageFactory.getStorage('seamless-agent');
    }

    /**
     * Get the addon registry (internal use)
     */
    get registry(): AddonRegistry {
        return this._registry;
    }

    // =========================================================================
    // Internal Methods (for extension initialization only, not for addons)
    // =========================================================================

    /**
     * @internal
     * Set the native askUser function implementation.
     * This is called during extension initialization, not by addons.
     * Addons should use api.tools.askUser() to call this function.
     */
    _setAskUserFunction(fn: (params: IAskUserParams) => Promise<IUserResponse>): void {
        this._tools.setAskUserFunction(fn);
    }

    /**
     * @internal
     * Set the native planReview function implementation.
     * This is called during extension initialization, not by addons.
     * Addons should use api.tools.planReview() to call this function.
     */
    _setPlanReviewFunction(fn: (params: IPlanReviewParams) => Promise<IPlanReviewResult>): void {
        this._tools.setPlanReviewFunction(fn);
    }

    /**
     * @internal
     * Set the function to switch tabs in the webview.
     * This is called during extension initialization, not by addons.
     * Addons should use api.ui.selectTab() to switch tabs.
     */
    _setSwitchTabFunction(fn: (tabId: string) => void): void {
        this._ui.setSwitchTabFunction(fn);
    }

    /**
     * Register an addon
     */
    registerAddon(addon: IAddon): IAddonRegistration {
        return this._registry.register(addon);
    }

    /**
     * Unregister an addon by ID
     */
    unregisterAddon(addonId: string): void {
        this._registry.unregister(addonId);
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        for (const disposable of this._disposables) {
            try {
                disposable.dispose();
            } catch (err) {
                console.error('[SeamlessAgentAPI] Error disposing:', err);
            }
        }
        this._disposables.length = 0;
    }
}

/**
 * Create a new Seamless Agent API instance
 */
export function createSeamlessAgentAPI(context: vscode.ExtensionContext): SeamlessAgentAPI {
    return new SeamlessAgentAPI(context);
}
