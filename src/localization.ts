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
    get back() { return localize('button.back'); },
    get addAttachment() { return localize('button.addAttachment'); },
    get remove() { return localize('button.remove'); },
    get inputPlaceholder() { return localize('input.placeholder'); },
    get consoleTitle() { return localize('console.title'); },
    get noPendingRequests() { return localize('console.noPendingRequests'); },
    get yourResponse() { return localize('console.yourResponse'); },
    get attachments() { return localize('console.attachments'); },
    get noAttachments() { return localize('console.noAttachments'); },
    get pendingRequests() { return localize('console.pendingRequests'); },
    get inputRequired() { return localize('badge.inputRequired'); },
    // Time formatting
    get justNow() { return localize('time.justNow'); },
    get minutesAgo() { return localize('time.minutesAgo'); },
    get hoursAgo() { return localize('time.hoursAgo'); },
    get daysAgo() { return localize('time.daysAgo'); },
    // Autocomplete and file reference
    get selectFile() { return localize('autocomplete.selectFile'); },
    get noFilesFound() { return localize('autocomplete.noFilesFound'); },
    get dropImageHere() { return localize('dropzone.dropImageHere'); },
    // Approve Plan
    get approvePlanAddCommentAction() { return localize('approvePlan.button.addComment'); },
    get approvePlanApprove() { return localize('approvePlan.button.approve'); },
    get approvePlanCancel() { return localize('approvePlan.button.cancel'); },
    get approvePlanCommentPlaceholder() { return localize('approvePlan.input.commentPlaceholder'); },
    get approvePlanComments() { return localize('approvePlan.comments'); },
    get approvePlanEditComment() { return localize('approvePlan.button.editComment'); },
    get approvePlanNoComments() { return localize('approvePlan.noComments'); },
    get approvePlanPanelTitle() { return localize('approvePlan.panelTitle'); },
    get approvePlanReject() { return localize('approvePlan.button.reject'); },
    get approvePlanRemoveComment() { return localize('approvePlan.button.removeComment'); },
    get approvePlanSave() { return localize('approvePlan.button.save'); },
};