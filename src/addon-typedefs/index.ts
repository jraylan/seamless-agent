/**
 * Seamless Agent — Addon API (types only)
 *
 * This entrypoint allows addon extensions to type their integration
 * with Seamless Agent without depending on runtime implementations.
 *
 * IMPORTANT:
 * - This module should only be used in type contexts.
 * - Always prefer `import type { ... }`.
 */

export type {
    // Core API
    ISeamlessAgentAPI,

    // Addon definition
    IAddon,
    IAddonRegistration,
    IAddonLifecycle,

    // UI
    IUIIntegration,
    IAddonUICapabilities,
    ICustomTab,
    IUIContent,
    IHistoryType,
    IHistoryItemProvider,
    IHistoryItem,

    // Settings
    ISettingsSection,
    IAddonSettingSection,
    IAddonSettingDefinition,
    ISettingItem,

    // Tools
    IToolsIntegration,
    IAddonAICapabilities,
    IAddonTool,
    IToolExecutionContext,
    IAskUserParams,
    IUserResponse,
    IPlanReviewParams,
    IPlanReviewResult,

    // Events
    IEventEmitter,

    // Storage
    IStorageIntegration,

    // Convenience aliases
    AskUserInput,
    AskUserToolResult,
    PlanReviewInput,
    PlanReviewToolResult,
} from '../api/types';

/**
 * Default event names emitted by Seamless Agent.
 *
 * Note: this is a UNION of strings (type), not a `const`.
 * This prevents addons from trying to use this package at runtime.
 */
export type SeamlessAgentEventName =
    | 'addon:registered'
    | 'addon:unregistered'
    | 'settings:changed'
    | 'ui:refresh'
    | 'tool:executed'
    | 'tab:changed';
