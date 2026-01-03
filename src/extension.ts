import * as vscode from 'vscode';
import { ExtensionCore } from './core';
import type { ISeamlessAgentAPI } from './api';

// Store reference to core for API access
let core: ExtensionCore | undefined;

/**
 * Activate the Seamless Agent extension.
 * Returns the public API for addon extensions to integrate.
 * 
 * @example
 * ```typescript
 * // In an addon extension:
 * const seamlessExt = vscode.extensions.getExtension('jraylan.seamless-agent');
 * if (seamlessExt) {
 *     const api = await seamlessExt.activate();
 *     const registration = api.registerAddon({ ... });
 * }
 * ```
 */
export function activate(context: vscode.ExtensionContext): ISeamlessAgentAPI {
    console.log('Seamless Agent extension active');
    core = new ExtensionCore(context);
    context.subscriptions.push(core);
    
    // Return the public API for addon extensions
    return core.getAPI();
}

export function deactivate() {
    console.log('Seamless Agent extension deactivated');
    core = undefined;
}

// Re-export public API types for addon developers
export * from './api';
export type { IAddon, IAddonRegistration } from './api/types';