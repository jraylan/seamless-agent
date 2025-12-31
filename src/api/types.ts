/**
 * Public API Types for Seamless Agent Addons
 * 
 * This module defines the public interfaces that addon extensions
 * use to integrate with the Seamless Agent extension.
 */

import type * as vscode from 'vscode';
import type { codiconsLibrary } from '@vscode/codicons/dist/codiconsLibrary';

// ============================================================================
// Core API Interfaces
// ============================================================================

/**
 * Main public API interface for the Seamless Agent extension.
 * This is the entry point for addon extensions to integrate with Seamless Agent.
 */
export interface ISeamlessAgentAPI {
    /** Current API version for compatibility checking */
    readonly version: string;

    /** Extension context for accessing VS Code services */
    readonly context: vscode.ExtensionContext;

    /**
     * Register an addon with the Seamless Agent
     * @param addon - The addon configuration
     * @returns Registration handle for cleanup
     */
    registerAddon(addon: IAddon): IAddonRegistration;

    /**
     * Unregister an addon by ID
     * @param addonId - The unique addon identifier
     */
    unregisterAddon(addonId: string): void;

    /**
     * UI integration capabilities
     */
    readonly ui: IUIIntegration;

    /**
     * AI Tools integration capabilities
     */
    readonly tools: IToolsIntegration;

    /**
     * Event system for addon communication
     */
    readonly events: IEventEmitter;

    /**
     * Storage integration for addon data
     */
    readonly storage: IStorageIntegration;
}

// ============================================================================
// Addon Definition Interfaces
// ============================================================================

/**
 * Addon definition interface.
 * Addons implement this interface to describe their capabilities.
 */
export interface IAddon {
    /** Unique identifier for the addon (e.g., 'my-extension.my-addon') */
    readonly id: string;

    /** Human-readable name */
    readonly name: string;

    /** Semantic version string */
    readonly version: string;

    /** Optional description */
    readonly description?: string;

    /** Optional author name or handle */
    readonly author?: string;

    /** Optional repository URL */
    readonly repositoryUrl?: string;

    /** UI capabilities */
    readonly ui?: IAddonUICapabilities;

    /** AI/LLM tool capabilities */
    readonly ai?: IAddonAICapabilities;

    /** Settings sections */
    readonly settings?: IAddonSettingSection[];

    /** Lifecycle hooks */
    readonly lifecycle?: IAddonLifecycle;
}

/**
 * Registration handle returned when an addon is registered.
 * Implements Disposable for cleanup.
 */
export interface IAddonRegistration extends vscode.Disposable {
    /** The registered addon */
    readonly addon: IAddon;

    /** Registration ID */
    readonly id: string;

    /** Whether the addon is currently active */
    readonly isActive: boolean;

    /** Deactivate the addon without unregistering */
    deactivate(): void;

    /** Reactivate a deactivated addon */
    activate(): void;
}

/**
 * Addon lifecycle hooks
 */
export interface IAddonLifecycle {
    /** Called when the addon is activated */
    onActivate?(): Promise<void> | void;

    /** Called when the addon is deactivated */
    onDeactivate?(): Promise<void> | void;

    /** Called when settings change */
    onSettingsChange?(settings: Record<string, unknown>): Promise<void> | void;
}

// ============================================================================
// UI Integration Interfaces
// ============================================================================

/**
 * UI integration capabilities for addons
 */
export interface IUIIntegration {
    /**
     * Register a custom tab in the webview
     * @param tab - Tab configuration
     * @returns Disposable for cleanup
     */
    registerTab(tab: ICustomTab): vscode.Disposable;

    /**
     * Register a history item provider
     * @param provider - History provider configuration
     * @returns Disposable for cleanup
     */
    registerHistoryProvider(provider: IHistoryItemProvider): vscode.Disposable;

    /**
     * Register a settings section in the Settings tab
     * @param section - Settings section configuration
     * @returns Disposable for cleanup
     */
    registerSettingsSection(section: ISettingsSection): vscode.Disposable;

    /**
     * Refresh the webview UI
     */
    refresh(): void;

    /**
     * Get all registered tabs
     */
    getTabs(): ICustomTab[];

    /**
     * Get all registered settings sections
     */
    getSettingsSections(): ISettingsSection[];

    /**
     * Select/open a specific tab in the webview
     * @param tabId - The tab identifier ('pending', 'history', 'settings', or a custom tab ID)
     */
    selectTab(tabId: string): void;
}

/**
 * Addon UI capabilities definition
 */
export interface IAddonUICapabilities {
    /**
     * Get content for a specific tab
     * @param tabId - The tab identifier
     */
    getTabContent?(tabId: string): Promise<IUIContent>;

    /**
     * Get history content for specific types
     * @param types - History types to retrieve
     */
    getHistoryContent?(...types: string[]): Promise<IUIContent>;

    /**
     * Handle clearing history for specific types
     * @param types - History types to clear
     */
    handleClearHistory?(...types: string[]): Promise<void>;

    /**
     * Get available history types
     */
    getHistoryTypes?(): Promise<IHistoryType[]>;

    /**
     * Custom tabs provided by this addon
     */
    tabs?: ICustomTab[];
}

/**
 * Custom tab definition for webview
 */
export interface ICustomTab {
    /** Unique tab identifier */
    id: string;

    /** Display label */
    label: string;

    /** Codicon name for the tab icon */
    icon: keyof typeof codiconsLibrary;

    /** Sort priority (lower = first) */
    priority?: number;

    /**
     * Render the tab content
     * @returns HTML string to display
     */
    render(): Promise<string> | string;

    /**
     * Handle messages from the webview
     * @param message - Message from webview
     * @returns Response to send back
     */
    onMessage?(message: unknown): Promise<unknown>;

    /**
     * Called when the tab becomes active
     */
    onActivate?(): void;

    /**
     * Called when the tab becomes inactive
     */
    onDeactivate?(): void;
}

/**
 * UI content descriptor for dynamic rendering
 */
export interface IUIContent {
    /** Content type */
    type: 'web-component' | 'html';

    /** For web-component type: custom element tag name */
    tagname?: string;

    /** Sorting key for ordering */
    sortingKey: string;

    /** Script URI for web components */
    scriptUri?: string;

    /** Raw HTML content (for html type) */
    html?: string;
}

/**
 * History type definition for filtering
 */
export interface IHistoryType {
    /** Codicon name */
    icon: keyof typeof codiconsLibrary;

    /** Type identifier */
    type: string;

    /** Display label */
    label: string;
}

/**
 * History item provider interface
 */
export interface IHistoryItemProvider {
    /** Provider identifier */
    id: string;

    /** History types this provider handles */
    types: string[];

    /**
     * Get history items
     * @param type - Optional type filter
     * @returns History items
     */
    getItems(type?: string): Promise<IHistoryItem[]>;

    /**
     * Clear history items
     * @param type - Optional type filter
     */
    clearItems(type?: string): Promise<void>;
}

/**
 * History item definition
 */
export interface IHistoryItem {
    /** Unique item ID */
    id: string;

    /** Item type */
    type: string;

    /** Timestamp */
    timestamp: number;

    /** Display title */
    title: string;

    /** Optional description */
    description?: string;

    /** Item status */
    status?: 'completed' | 'cancelled' | 'pending';

    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Settings Interfaces
// ============================================================================

/**
 * Settings section definition
 */
export interface ISettingsSection {
    /** Unique section identifier */
    id: string;

    /** Section title */
    title: string;

    /** Optional description */
    description?: string;

    /** Settings items in this section */
    settings: ISettingItem[];

    /** Sort priority (lower = first) */
    priority?: number;
}

/**
 * Addon setting section (from addon definition)
 */
export interface IAddonSettingSection {
    /** Setting key (will be prefixed with addon ID) */
    key: string;

    /** Display label */
    label: string;

    /** Optional description */
    description?: string;

    /** Settings in this section */
    settings: IAddonSettingDefinition[];
}

/**
 * Individual setting definition from addon
 */
export interface IAddonSettingDefinition {
    /** Setting key */
    key: string;

    /** Display label */
    label: string;

    /** Optional description */
    description?: string;

    /** Setting type */
    type: 'boolean' | 'string' | 'number' | 'select' | 'multiselect' | 'text';

    /** Default value */
    defaultValue?: unknown;

    /** Options for select/multiselect types */
    options?: Array<{ value: string; label: string }>;

    /** Validation constraints */
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
        required?: boolean;
    };
}

/**
 * Setting item for UI rendering
 */
export interface ISettingItem {
    /** Full setting key */
    key: string;

    /** Display label */
    label: string;

    /** Description */
    description?: string;

    /** Setting type */
    type: 'boolean' | 'string' | 'number' | 'select' | 'multiselect' | 'text';

    /** Current value */
    value: unknown;

    /** Default value */
    defaultValue?: unknown;

    /** Options for select types */
    options?: Array<{ value: string; label: string }>;

    /** Whether setting is from VS Code configuration */
    isVSCodeSetting?: boolean;
}

// ============================================================================
// Tools Integration Interfaces
// ============================================================================

/**
 * AI Tools integration interface
 */
export interface IToolsIntegration {
    /**
     * Register an AI tool
     * @param tool - Tool configuration
     * @returns Disposable for cleanup
     */
    registerTool(tool: IAddonTool): vscode.Disposable;

    /**
     * Get all registered tools
     */
    getTools(): IAddonTool[];

    /**
     * Native askUser tool access
     */
    askUser(params: IAskUserParams): Promise<IUserResponse>;

    /**
     * Native planReview tool access
     */
    planReview(params: IPlanReviewParams): Promise<IPlanReviewResult>;
}

/**
 * Addon AI capabilities definition
 */
export interface IAddonAICapabilities {
    /** Tools provided by this addon */
    tools: IAddonTool[];
}

/**
 * Addon tool definition
 */
export interface IAddonTool {
    /** Tool name (should be unique) */
    name: string;

    /** Tool description for LLM */
    description: string;

    /** JSON schema for input validation */
    inputSchema?: Record<string, unknown>;

    /** Tags for categorization */
    tags?: string[];

    /**
     * Execute the tool
     * @param params - Input parameters
     * @param context - Execution context
     * @param token - Cancellation token
     * @returns Tool result
     */
    execute(
        params: unknown,
        context: IToolExecutionContext,
        token: vscode.CancellationToken
    ): Promise<unknown>;
}

/**
 * Tool execution context
 */
export interface IToolExecutionContext {
    /** The Seamless Agent API */
    api: ISeamlessAgentAPI;

    /** Request ID for tracking */
    requestId: string;
}

/**
 * Parameters for askUser tool
 */
export interface IAskUserParams {
    question: string;
    title?: string;
    agentName?: string;
}

/**
 * User response from askUser
 */
export interface IUserResponse {
    responded: boolean;
    response: string;
    attachments: string[];
}

/**
 * Parameters for planReview tool
 */
export interface IPlanReviewParams {
    plan: string;
    title?: string;
    chatId?: string;
    mode?: 'review' | 'walkthrough';
}

/**
 * Result from planReview
 */
export interface IPlanReviewResult {
    status: 'approved' | 'recreateWithChanges' | 'acknowledged' | 'cancelled';
    requiredRevisions?: Array<{
        revisedPart: string;
        revisorInstructions: string;
    }>;
    reviewId: string;
}

// ============================================================================
// Event System Interfaces
// ============================================================================

/**
 * Event emitter interface
 */
export interface IEventEmitter {
    /**
     * Subscribe to an event
     * @param event - Event name
     * @param listener - Event listener
     * @returns Disposable for cleanup
     */
    on<T = unknown>(event: string, listener: (data: T) => void): vscode.Disposable;

    /**
     * Subscribe to an event (one-time)
     * @param event - Event name
     * @param listener - Event listener
     * @returns Disposable for cleanup
     */
    once<T = unknown>(event: string, listener: (data: T) => void): vscode.Disposable;

    /**
     * Emit an event
     * @param event - Event name
     * @param data - Event data
     */
    emit<T = unknown>(event: string, data: T): void;

    /**
     * Remove all listeners for an event
     * @param event - Event name
     */
    removeAllListeners(event?: string): void;
}

/**
 * Standard event names
 */
export const SeamlessAgentEvents = {
    /** Addon registered */
    ADDON_REGISTERED: 'addon:registered',
    /** Addon unregistered */
    ADDON_UNREGISTERED: 'addon:unregistered',
    /** Settings changed */
    SETTINGS_CHANGED: 'settings:changed',
    /** UI refresh requested */
    UI_REFRESH: 'ui:refresh',
    /** Tool executed */
    TOOL_EXECUTED: 'tool:executed',
    /** Tab changed */
    TAB_CHANGED: 'tab:changed',
} as const;

// ============================================================================
// Storage Integration Interfaces
// ============================================================================

/**
 * Storage integration interface for addon data persistence
 */
export interface IStorageIntegration {
    /**
     * Get a stored value
     * @param key - Storage key (will be namespaced by addon ID)
     * @param defaultValue - Default value if not found
     */
    get<T>(key: string, defaultValue?: T): T | undefined;

    /**
     * Set a stored value
     * @param key - Storage key
     * @param value - Value to store
     */
    set<T>(key: string, value: T): Promise<void>;

    /**
     * Delete a stored value
     * @param key - Storage key
     */
    delete(key: string): Promise<void>;

    /**
     * Get all keys for the addon
     */
    keys(): string[];

    /**
     * Clear all addon storage
     */
    clear(): Promise<void>;
}

// ============================================================================
// Type Aliases for Tool Compatibility
// ============================================================================

/**
 * Input parameters for the askUser tool
 * (Alias for IAskUserParams for tool implementations)
 */
export type AskUserInput = IAskUserParams;

/**
 * Result from the askUser tool
 * (Alias for IUserResponse for tool implementations)
 */
export type AskUserToolResult = IUserResponse;

/**
 * Input parameters for the planReview tool
 * (Alias for IPlanReviewParams for tool implementations)
 */
export type PlanReviewInput = IPlanReviewParams;

/**
 * Result from the planReview tool
 * (Alias for IPlanReviewResult for tool implementations)
 */
export type PlanReviewToolResult = IPlanReviewResult;
