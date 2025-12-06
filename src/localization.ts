import * as vscode from 'vscode';

// Load localized strings
const bundle = JSON.parse(
    JSON.stringify(require('../package.nls.json'))
);

try {
    const locale = vscode.env.language;
    if (locale && locale !== 'en') {
        const localizedBundle = require(`../package.nls.${locale}.json`);
        Object.assign(bundle, localizedBundle);
    }
} catch { }

export function localize(key: string, ...args: (string | number)[]): string {
    let message = bundle[key] || key;
    args.forEach((arg, index) => {
        message = message.replace(`{${index}}`, String(arg));
    });
    return message;
}

export const strings = {
    get confirmationRequired() { return localize('notification.confirmationRequired'); },
    get agentRequiresInput() { return localize('notification.agentRequiresInput'); },
    get openConsole() { return localize('notification.openConsole'); },
    get respond() { return localize('button.respond'); },
    get submit() { return localize('button.submit'); },
    get cancel() { return localize('button.cancel'); },
    get inputPlaceholder() { return localize('input.placeholder'); },
    get consoleTitle() { return localize('console.title'); },
    get noPendingRequests() { return localize('console.noPendingRequests'); },
    get yourResponse() { return localize('console.yourResponse'); },
    get inputRequired() { return localize('badge.inputRequired'); },
};