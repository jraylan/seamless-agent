/**
 * Event Emitter System for Seamless Agent
 * 
 * Provides a type-safe event system for communication between
 * the core extension and registered addons.
 */

import type * as vscode from 'vscode';
import { IEventEmitter, SeamlessAgentEvents } from './types';

/**
 * Type-safe event listener
 */
type EventListener<T = unknown> = (data: T) => void;

/**
 * Event emitter implementation using the Observer Pattern.
 * Provides a pub/sub mechanism for addon communication.
 */
export class SeamlessEventEmitter implements IEventEmitter {
    private readonly listeners: Map<string, Set<EventListener>> = new Map();
    private readonly onceListeners: Map<string, Set<EventListener>> = new Map();
    private readonly disposables: Map<EventListener, vscode.Disposable> = new Map();

    /**
     * Subscribe to an event
     * @param event - Event name
     * @param listener - Event listener callback
     * @returns Disposable for cleanup
     */
    public on<T = unknown>(event: string, listener: EventListener<T>): vscode.Disposable {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        const eventListeners = this.listeners.get(event)!;
        eventListeners.add(listener as EventListener);

        const disposable: vscode.Disposable = {
            dispose: () => {
                eventListeners.delete(listener as EventListener);
                this.disposables.delete(listener as EventListener);

                // Clean up empty sets
                if (eventListeners.size === 0) {
                    this.listeners.delete(event);
                }
            }
        };

        this.disposables.set(listener as EventListener, disposable);
        return disposable;
    }

    /**
     * Subscribe to an event for a single invocation
     * @param event - Event name
     * @param listener - Event listener callback
     * @returns Disposable for cleanup
     */
    public once<T = unknown>(event: string, listener: EventListener<T>): vscode.Disposable {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }

        const eventListeners = this.onceListeners.get(event)!;
        eventListeners.add(listener as EventListener);

        const disposable: vscode.Disposable = {
            dispose: () => {
                eventListeners.delete(listener as EventListener);
                this.disposables.delete(listener as EventListener);

                // Clean up empty sets
                if (eventListeners.size === 0) {
                    this.onceListeners.delete(event);
                }
            }
        };

        this.disposables.set(listener as EventListener, disposable);
        return disposable;
    }

    /**
     * Emit an event to all listeners
     * @param event - Event name
     * @param data - Event data
     */
    public emit<T = unknown>(event: string, data: T): void {
        // Call regular listeners
        const regularListeners = this.listeners.get(event);
        if (regularListeners) {
            for (const listener of regularListeners) {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`[SeamlessAgent] Error in event listener for '${event}':`, error);
                }
            }
        }

        // Call once listeners and remove them
        const onceListeners = this.onceListeners.get(event);
        if (onceListeners) {
            const listenersToCall = [...onceListeners];
            this.onceListeners.delete(event);

            for (const listener of listenersToCall) {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`[SeamlessAgent] Error in once listener for '${event}':`, error);
                }

                // Clean up disposable
                const disposable = this.disposables.get(listener);
                if (disposable) {
                    this.disposables.delete(listener);
                }
            }
        }
    }

    /**
     * Remove all listeners for a specific event or all events
     * @param event - Optional event name. If not provided, removes all listeners.
     */
    public removeAllListeners(event?: string): void {
        if (event) {
            // Remove listeners for specific event
            const regularListeners = this.listeners.get(event);
            if (regularListeners) {
                for (const listener of regularListeners) {
                    const disposable = this.disposables.get(listener);
                    if (disposable) {
                        this.disposables.delete(listener);
                    }
                }
                this.listeners.delete(event);
            }

            const onceListeners = this.onceListeners.get(event);
            if (onceListeners) {
                for (const listener of onceListeners) {
                    const disposable = this.disposables.get(listener);
                    if (disposable) {
                        this.disposables.delete(listener);
                    }
                }
                this.onceListeners.delete(event);
            }
        } else {
            // Remove all listeners
            this.listeners.clear();
            this.onceListeners.clear();
            this.disposables.clear();
        }
    }

    /**
     * Get the count of listeners for an event
     * @param event - Event name
     * @returns Number of listeners
     */
    public listenerCount(event: string): number {
        const regular = this.listeners.get(event)?.size ?? 0;
        const once = this.onceListeners.get(event)?.size ?? 0;
        return regular + once;
    }

    /**
     * Get all event names that have listeners
     * @returns Array of event names
     */
    public eventNames(): string[] {
        const names = new Set<string>();

        for (const event of this.listeners.keys()) {
            names.add(event);
        }

        for (const event of this.onceListeners.keys()) {
            names.add(event);
        }

        return [...names];
    }

    /**
     * Dispose all listeners and clean up
     */
    public dispose(): void {
        this.removeAllListeners();
    }
}

// Re-export event names for convenience
export { SeamlessAgentEvents };
