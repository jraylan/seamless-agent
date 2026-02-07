import * as vscode from 'vscode';

// Load localized strings
const bundle = JSON.parse(
    JSON.stringify(require('../package.nls.json'))
);

try {
    const locale = vscode.env.language?.toLowerCase();

    // Attempt to load exact locale first (e.g. pt-br), then fall back to base language (e.g. pt)
    if (locale && locale !== 'en') {
        const tryLoad = (loc: string): boolean => {
            try {
                const localizedBundle = require(`../package.nls.${loc}.json`);
                Object.assign(bundle, localizedBundle);
                return true;
            } catch {
                try {
                    loc = loc.split(/[-_]/g)[0];
                    const localizedBundle = require(`../package.nls.${loc}.json`);
                    Object.assign(bundle, localizedBundle);
                    return true;
                } catch {
                    console.log('[Seamless Agent] Lang not found: ' + loc);
                }
            }

            return false;
        };

        const loadedExact = tryLoad(locale);
        if (!loadedExact) {
            const base = locale.split('-')[0];
            if (base && base !== locale) {
                tryLoad(base);
            }
        }
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
    get close() { return localize('button.close'); },
    get addAttachment() { return localize('button.addAttachment'); },
    get remove() { return localize('button.remove'); },
    get inputPlaceholder() { return localize('input.placeholder'); },
    get consoleTitle() { return localize('console.title'); },
    get noPendingRequests() { return localize('console.noPendingRequests'); },
    get noPendingItems() { return localize('console.noPendingItems'); },
    get pendingItems() { return localize('console.pendingItems'); },
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
    // Session History
    get recentSessions() { return localize('session.recentSessions'); },
    get sessionInteractions() { return localize('session.interactions'); },
    get sessionInput() { return localize('session.input'); },
    get sessionOutput() { return localize('session.output'); },
    get noRecentSessions() { return localize('session.noRecent'); },
    get clearHistory() { return localize('session.clearHistory'); },
    get addFolder() { return localize('button.addFolder'); },
    // Plan Review (extended modes)
    get planReviewTitle() { return localize('approvePlan.panelTitle'); },
    get planReviewAcknowledge() { return localize('planReview.button.acknowledge'); },
    get planReviewContinue() { return localize('planReview.button.continue'); },
    get planReviewDone() { return localize('planReview.button.done'); },
    get planReviewClose() { return localize('planReview.button.close'); },
    get planReviewExport() { return localize('planReview.button.export'); },
    get planReviewReadOnly() { return localize('planReview.readOnly'); },
    get planReviewReadOnlyMessage() { return localize('planReview.readOnlyMessage'); },
    get planReviewRejectRequiresComments() { return localize('planReview.rejectRequiresComments'); },
    // Chat History
    get pendingReviews() { return localize('console.pendingReviews'); },
    get noPendingReviews() { return localize('console.noPendingReviews'); },
    get chatHistory() { return localize('console.chatHistory'); },
    get planReviews() { return localize('console.planReviews'); },
    get userInteractions() { return localize('console.userInteractions'); },
    get noChats() { return localize('history.noChats'); },
    get openInPanel() { return localize('button.openInPanel'); },
    get deleteChat() { return localize('button.deleteChat'); },
    get approved() { return localize('status.approved'); },
    get rejected() { return localize('status.rejected'); },
    get pending() { return localize('status.pending'); },
    get acknowledged() { return localize('status.acknowledged'); },
    get cancelled() { return localize('status.cancelled'); },
    // Confirmation dialogs
    get confirmClearHistory() { return localize('confirm.clearHistory'); },
    get confirmDeleteItem() { return localize('confirm.deleteItem'); },
    get confirmCancelPending() { return localize('confirm.cancelPending'); },
    get confirm() { return localize('button.confirm'); },
    get delete() { return localize('button.delete'); },
    // Interaction detail
    get question() { return localize('detail.question'); },
    get response() { return localize('detail.response'); },
    get noResponse() { return localize('detail.noResponse'); },
    get options() { return localize('detail.options'); },

    // History filters
    get historyFilterAll() { return localize('history.filter.all'); },
    get historyFilterAskUser() { return localize('history.filter.askUser'); },
    get historyFilterPlanReview() { return localize('history.filter.planReview'); },

    // Attachments / images
    get attachmentNoFilesFound() { return localize('attachment.noFilesFound'); },
    get attachmentInvalidDataUrl() { return localize('attachment.invalidDataUrl'); },
    get attachmentSelectFolder() { return localize('attachment.selectFolder'); },
    get attachmentSelectFolderDepth() { return localize('attachment.selectFolderDepth'); },
    get attachmentFolderDepthCurrent() { return localize('attachment.folderDepth.current'); },
    get attachmentFolderDepth1() { return localize('attachment.folderDepth.depth1'); },
    get attachmentFolderDepth2() { return localize('attachment.folderDepth.depth2'); },
    get attachmentFolderDepthRecursive() { return localize('attachment.folderDepth.recursive'); },
    get pastedImage() { return localize('attachment.pastedImage'); },

    // Batch selection
    get batchSelectMode() { return localize('batch.selectMode'); },
    get batchExitSelectMode() { return localize('batch.exitSelectMode'); },
    get batchSelectAll() { return localize('batch.selectAll'); },
    get batchDeselectAll() { return localize('batch.deselectAll'); },
    get batchDeleteSelected() { return localize('batch.deleteSelected'); },
    get batchSelectedCount() { return localize('batch.selectedCount'); },
    get confirmDeleteSelected() { return localize('confirm.deleteSelected'); },

    // Options
    get orTypeYourOwn() { return localize('console.orTypeYourOwn'); },

    // Errors
    get noSuchInteraction() { return localize('error.noSuchInteraction'); },
};
