import type * as vscode from 'vscode';
import type { SeamlessAgentAPI } from '../api/SeamlessAgentAPI';
import type { AddonRegistry } from '../addons/registry';
import type { AgentInteractionProvider } from '../webview/webviewProvider';

/**
 * Core extension interface
 */
export interface IExtensionCore {
    /**
     * Get the VS Code extension context
     */
    getContext(): vscode.ExtensionContext;

    /**
     * Extension subscriptions for cleanup
     */
    readonly subscriptions: vscode.Disposable[];

    /**
     * Get the public API instance
     */
    getAPI(): SeamlessAgentAPI;

    /**
     * Get the addon registry
     */
    getAddonRegistry(): AddonRegistry;

    /**
     * Get the webview provider
     */
    getProvider(): AgentInteractionProvider;
}

/**
 * Extension core initialization options
 */
export type ExtensionCoreOptions = {
    /**
     * Whether to create the MCP server
     */
    createMcpServer?: boolean;
}