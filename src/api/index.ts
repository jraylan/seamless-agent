/**
 * Seamless Agent Public API
 * 
 * This module exports the public API for addon extensions to integrate
 * with the Seamless Agent extension.
 * 
 * @example
 * ```typescript
 * import * as vscode from 'vscode';
 * 
 * export async function activate(context: vscode.ExtensionContext) {
 *     const seamlessExt = vscode.extensions.getExtension('jraylan.seamless-agent');
 *     if (!seamlessExt) return;
 *     
 *     const api = await seamlessExt.activate();
 *     
 *     const registration = api.registerAddon({
 *         id: 'my-addon',
 *         name: 'My Custom Addon',
 *         version: '1.0.0',
 *         ai: {
 *             tools: [{
 *                 name: 'my_tool',
 *                 description: 'My custom tool',
 *                 execute: async (params, context, token) => {
 *                     return { success: true };
 *                 }
 *             }]
 *         }
 *     });
 *     
 *     context.subscriptions.push(registration);
 * }
 * ```
 */

// Export main API class and factory
export { SeamlessAgentAPI, createSeamlessAgentAPI, API_VERSION } from './SeamlessAgentAPI';

// Export event system
export { SeamlessEventEmitter } from './events';

// Export all public types
export type {
    // Core API
    ISeamlessAgentAPI,

    // Addon definition
    IAddon,
    IAddonRegistration,
    IAddonLifecycle,

    // UI Integration
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

    // Tools Integration
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
} from './types';

// Export event constants
export { SeamlessAgentEvents } from './types';
