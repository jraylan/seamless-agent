/**
 * Addon Registry
 * 
 * Centralized registry for managing addon registrations.
 * Implements the Registry Pattern for addon lifecycle management.
 */

import type * as vscode from 'vscode';
import type {
    IAddon,
    IAddonRegistration,
    IEventEmitter,
    ICustomTab,
    ISettingsSection,
    IAddonTool,
} from '../api/types';
import { SeamlessAgentEvents } from '../api/types';

/**
 * Internal registration data structure
 */
interface RegistrationData {
    addon: IAddon;
    isActive: boolean;
    disposables: vscode.Disposable[];
    registeredTabs: ICustomTab[];
    registeredTools: IAddonTool[];
    registeredSettingsSections: ISettingsSection[];
}

/**
 * Addon Registration implementation
 */
class AddonRegistrationImpl implements IAddonRegistration {
    constructor(
        private readonly registry: AddonRegistry,
        private readonly data: RegistrationData
    ) { }

    get addon(): IAddon {
        return this.data.addon;
    }

    get id(): string {
        return this.data.addon.id;
    }

    get isActive(): boolean {
        return this.data.isActive;
    }

    /**
     * Deactivate the addon without unregistering
     */
    deactivate(): void {
        if (!this.data.isActive) return;

        this.data.isActive = false;

        // Call lifecycle hook
        if (this.data.addon.lifecycle?.onDeactivate) {
            try {
                const result = this.data.addon.lifecycle.onDeactivate();
                if (result instanceof Promise) {
                    result.catch(err => {
                        console.error(`[AddonRegistry] Error in onDeactivate for ${this.id}:`, err);
                    });
                }
            } catch (err) {
                console.error(`[AddonRegistry] Error in onDeactivate for ${this.id}:`, err);
            }
        }
    }

    /**
     * Reactivate a deactivated addon
     */
    activate(): void {
        if (this.data.isActive) return;

        this.data.isActive = true;

        // Call lifecycle hook
        if (this.data.addon.lifecycle?.onActivate) {
            try {
                const result = this.data.addon.lifecycle.onActivate();
                if (result instanceof Promise) {
                    result.catch(err => {
                        console.error(`[AddonRegistry] Error in onActivate for ${this.id}:`, err);
                    });
                }
            } catch (err) {
                console.error(`[AddonRegistry] Error in onActivate for ${this.id}:`, err);
            }
        }
    }

    /**
     * Dispose and unregister the addon
     */
    dispose(): void {
        this.registry.unregister(this.id);
    }
}

/**
 * Centralized registry for addon management.
 * Implements the Registry Pattern for tracking and querying addons.
 */
export class AddonRegistry implements vscode.Disposable {
    private readonly registrations: Map<string, RegistrationData> = new Map();
    private readonly eventEmitter: IEventEmitter;

    constructor(eventEmitter: IEventEmitter) {
        this.eventEmitter = eventEmitter;
    }

    /**
     * Register an addon
     * @param addon - The addon to register
     * @returns Registration handle
     */
    register(addon: IAddon): IAddonRegistration {
        // Check for duplicate registration
        if (this.registrations.has(addon.id)) {
            throw new Error(`Addon with ID '${addon.id}' is already registered`);
        }

        // Validate addon
        this.validateAddon(addon);

        // Create registration data
        const data: RegistrationData = {
            addon,
            isActive: true,
            disposables: [],
            registeredTabs: [],
            registeredTools: [],
            registeredSettingsSections: [],
        };

        // Extract and store capabilities
        if (addon.ui?.tabs) {
            data.registeredTabs = [...addon.ui.tabs];
        }

        if (addon.ai?.tools) {
            data.registeredTools = [...addon.ai.tools];
        }

        if (addon.settings) {
            data.registeredSettingsSections = addon.settings.map(section => ({
                id: `${addon.id}.${section.key}`,
                title: section.label,
                description: section.description,
                settings: section.settings.map(setting => ({
                    key: `${addon.id}.${section.key}.${setting.key}`,
                    label: setting.label,
                    description: setting.description,
                    type: setting.type,
                    value: setting.defaultValue,
                    defaultValue: setting.defaultValue,
                    options: setting.options,
                })),
            }));
        }

        // Store registration
        this.registrations.set(addon.id, data);

        // Create registration handle
        const registration = new AddonRegistrationImpl(this, data);

        // Call lifecycle hook
        if (addon.lifecycle?.onActivate) {
            try {
                const result = addon.lifecycle.onActivate();
                if (result instanceof Promise) {
                    result.catch(err => {
                        console.error(`[AddonRegistry] Error in onActivate for ${addon.id}:`, err);
                    });
                }
            } catch (err) {
                console.error(`[AddonRegistry] Error in onActivate for ${addon.id}:`, err);
            }
        }

        // Emit registration event
        this.eventEmitter.emit(SeamlessAgentEvents.ADDON_REGISTERED, {
            addonId: addon.id,
            addon,
        });

        console.log(`[AddonRegistry] Registered addon: ${addon.id} (${addon.name} v${addon.version})`);

        return registration;
    }

    /**
     * Unregister an addon by ID
     * @param addonId - The addon ID to unregister
     */
    unregister(addonId: string): void {
        const data = this.registrations.get(addonId);
        if (!data) {
            console.warn(`[AddonRegistry] Addon '${addonId}' not found for unregistration`);
            return;
        }

        // Call lifecycle hook
        if (data.addon.lifecycle?.onDeactivate) {
            try {
                const result = data.addon.lifecycle.onDeactivate();
                if (result instanceof Promise) {
                    result.catch(err => {
                        console.error(`[AddonRegistry] Error in onDeactivate for ${addonId}:`, err);
                    });
                }
            } catch (err) {
                console.error(`[AddonRegistry] Error in onDeactivate for ${addonId}:`, err);
            }
        }

        // Dispose all registered disposables
        for (const disposable of data.disposables) {
            try {
                disposable.dispose();
            } catch (err) {
                console.error(`[AddonRegistry] Error disposing resource for ${addonId}:`, err);
            }
        }

        // Remove from registry
        this.registrations.delete(addonId);

        // Emit unregistration event
        this.eventEmitter.emit(SeamlessAgentEvents.ADDON_UNREGISTERED, {
            addonId,
        });

        console.log(`[AddonRegistry] Unregistered addon: ${addonId}`);
    }

    /**
     * Get a registration by addon ID
     * @param addonId - The addon ID
     * @returns Registration data or undefined
     */
    get(addonId: string): IAddonRegistration | undefined {
        const data = this.registrations.get(addonId);
        if (!data) return undefined;

        return new AddonRegistrationImpl(this, data);
    }

    /**
     * Get all registered addons
     * @returns Array of addon registrations
     */
    getAll(): IAddonRegistration[] {
        return Array.from(this.registrations.values()).map(
            data => new AddonRegistrationImpl(this, data)
        );
    }

    /**
     * Get all active addons
     * @returns Array of active addon registrations
     */
    getActive(): IAddonRegistration[] {
        return Array.from(this.registrations.values())
            .filter(data => data.isActive)
            .map(data => new AddonRegistrationImpl(this, data));
    }

    /**
     * Get all registered tabs from all active addons
     * @returns Array of custom tabs
     */
    getAllTabs(): ICustomTab[] {
        const tabs: ICustomTab[] = [];

        for (const data of this.registrations.values()) {
            if (data.isActive) {
                tabs.push(...data.registeredTabs);
            }
        }

        // Sort by priority
        return tabs.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }

    /**
     * Get all registered tools from all active addons
     * @returns Array of addon tools
     */
    getAllTools(): IAddonTool[] {
        const tools: IAddonTool[] = [];

        for (const data of this.registrations.values()) {
            if (data.isActive) {
                tools.push(...data.registeredTools);
            }
        }

        return tools;
    }

    /**
     * Get all registered settings sections from all active addons
     * @returns Array of settings sections
     */
    getAllSettingsSections(): ISettingsSection[] {
        const sections: ISettingsSection[] = [];

        for (const data of this.registrations.values()) {
            if (data.isActive) {
                sections.push(...data.registeredSettingsSections);
            }
        }

        // Sort by priority
        return sections.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    }

    /**
     * Add a disposable to an addon's registration
     * @param addonId - The addon ID
     * @param disposable - The disposable to add
     */
    addDisposable(addonId: string, disposable: vscode.Disposable): void {
        const data = this.registrations.get(addonId);
        if (data) {
            data.disposables.push(disposable);
        }
    }

    /**
     * Get the count of registered addons
     * @returns Number of registered addons
     */
    get count(): number {
        return this.registrations.size;
    }

    /**
     * Check if an addon is registered
     * @param addonId - The addon ID
     * @returns True if registered
     */
    has(addonId: string): boolean {
        return this.registrations.has(addonId);
    }

    /**
     * Validate an addon definition
     * @param addon - The addon to validate
     * @throws Error if validation fails
     */
    private validateAddon(addon: IAddon): void {
        if (!addon.id || typeof addon.id !== 'string') {
            throw new Error('Addon must have a valid ID string');
        }

        if (!addon.name || typeof addon.name !== 'string') {
            throw new Error('Addon must have a valid name string');
        }

        if (!addon.version || typeof addon.version !== 'string') {
            throw new Error('Addon must have a valid version string');
        }

        // Validate tool names are unique
        if (addon.ai?.tools) {
            const toolNames = new Set<string>();
            for (const tool of addon.ai.tools) {
                if (!tool.name) {
                    throw new Error(`Tool in addon '${addon.id}' must have a name`);
                }
                if (toolNames.has(tool.name)) {
                    throw new Error(`Duplicate tool name '${tool.name}' in addon '${addon.id}'`);
                }
                toolNames.add(tool.name);
            }
        }

        // Validate tab IDs are unique
        if (addon.ui?.tabs) {
            const tabIds = new Set<string>();
            for (const tab of addon.ui.tabs) {
                if (!tab.id) {
                    throw new Error(`Tab in addon '${addon.id}' must have an ID`);
                }
                if (tabIds.has(tab.id)) {
                    throw new Error(`Duplicate tab ID '${tab.id}' in addon '${addon.id}'`);
                }
                tabIds.add(tab.id);
            }
        }
    }

    /**
     * Dispose the registry and all addons
     */
    dispose(): void {
        // Unregister all addons
        const addonIds = [...this.registrations.keys()];
        for (const addonId of addonIds) {
            this.unregister(addonId);
        }
    }
}
