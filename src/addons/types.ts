/**
 * Addon Types
 * 
 * This module re-exports the addon-related types from the public API
 * for internal use and backward compatibility.
 * 
 * For new code, prefer importing directly from '../api/types'.
 */

// Re-export all addon-related types from the API
export type {
    IAddon,
    IAddonRegistration,
    IAddonLifecycle,
    IAddonUICapabilities,
    IAddonAICapabilities,
    IAddonSettingSection,
    IAddonSettingDefinition,
    IAddonTool,
    IToolExecutionContext,
    ICustomTab,
    IUIContent,
    IHistoryType,
    ISettingsSection,
    ISettingItem,
} from '../api/types';

// Legacy type aliases for backward compatibility
export type { IAddonSettingSection as AddonSettingSection } from '../api/types';
export type { IAddonSettingDefinition as AddonSetting } from '../api/types';
export type { IAddonTool as AITool } from '../api/types';

/**
 * Tab type identifiers
 */
export type TabType =
    | 'notification'
    | 'history'
    | 'settings'
    | string; // Allow custom tab types from addons
