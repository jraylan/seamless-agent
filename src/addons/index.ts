/**
 * Addons Module
 * 
 * This module provides addon management functionality for the Seamless Agent extension.
 * The main addon registry is now part of the public API, but this module provides
 * legacy compatibility and internal utilities.
 */

// Re-export registry
export { AddonRegistry } from './registry';

// Re-export types for backward compatibility
export * from './types';

// Re-export API types that addons need
export type {
    ISeamlessAgentAPI,
    IAddonRegistration,
    IEventEmitter,
    IStorageIntegration,
    IUIIntegration,
    IToolsIntegration,
} from '../api/types';

