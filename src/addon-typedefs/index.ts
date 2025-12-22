/**
 * Seamless Agent — Addon API (somente tipos)
 *
 * Este entrypoint existe para que extensões "addon" consigam tipar a integração
 * com o Seamless Agent sem depender de implementações (runtime).
 *
 * IMPORTANTE:
 * - Este módulo deve ser usado apenas em contexto de tipos.
 * - Prefira sempre `import type { ... }`.
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
 * Nomes de eventos padrão emitidos pelo Seamless Agent.
 *
 * Observação: esta é uma UNIÃO de strings (tipo), não um `const`.
 * Isso evita que addons tentem usar este pacote em runtime.
 */
export type SeamlessAgentEventName =
    | 'addon:registered'
    | 'addon:unregistered'
    | 'settings:changed'
    | 'ui:refresh'
    | 'tool:executed'
    | 'tab:changed';
