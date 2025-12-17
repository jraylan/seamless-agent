import * as vscode from 'vscode';

export type StorageContextType = 'global' | 'workspace';

let context: StorageContextType | undefined = undefined;


vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('seamless-agent.storageContext')) {
        context = undefined; // Reset cached context
    }
});


/**
 * Retrieves the storage context based on user configuration.
 * 
 * @returns 'global' or 'workspace' depending on user setting
 */
export function getStorageContext(): StorageContextType {
    if (context === undefined) {
        const config = vscode.workspace.getConfiguration('seamless-agent');
        context = config.get<StorageContextType>('storageContext', 'workspace');
    }

    return context;
}