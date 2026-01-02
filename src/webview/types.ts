// Comment structure for feedback
export interface RequiredPlanRevisions {
    revisedPart: string;
    revisorInstructions: string;
}

// Represents a stored interaction (either ask_user or plan_review)
export interface StoredInteraction {
    id: string;
    type: 'ask_user' | 'plan_review';
    timestamp: number;

    // For ask_user
    question?: string;
    response?: string;
    attachments?: string[];
    agentName?: string;

    // For plan_review
    plan?: string;
    title?: string;
    mode?: 'review' | 'walkthrough';
    requiredRevisions?: RequiredPlanRevisions[];
    status?: 'pending' | 'approved' | 'recreateWithChanges' | 'acknowledged' | 'closed' | 'cancelled';
}

// Attachment info
export interface AttachmentInfo {
    id: string;
    name: string;
    uri: string;
    isTemporary?: boolean; // True if this is a pasted/dropped image that should be cleaned up
    isFolder?: boolean; // True if this is a folder attachment
    folderPath?: string; // Full folder path for folder attachments
    depth?: number; // Folder depth (0=current, 1=1 level, 2=2 levels, -1=recursive)
    // Webview-side helpers
    isImage?: boolean; // Webview detects common image file extensions
    isTextReference?: boolean; // True if added via #name syntax (should be synced with text)
    thumbnail?: string; // Base64 data URL for image preview
}

// Request item for the list
export interface RequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    agentName: string | undefined;
    attachments: AttachmentInfo[];
}

/**
 * Represents a single tool call interaction.
 * Each ask_user invocation creates one ToolCallInteraction.
 */
export interface ToolCallInteraction {
    /** Unique interaction ID (same as request ID) */
    id: string;

    /** Timestamp when this interaction was created */
    timestamp: number;

    /** Input data from the AI tool call */
    input: {
        /** The question asked by the AI */
        question: string;
        /** The title/label for this tool call */
        title: string;
    };

    /** Output data from the user's response */
    output: {
        /** User's response text */
        response: string;
        /** Files/folders attached with the response */
        attachments: AttachmentInfo[];
    };

    /** Status of this interaction */
    status: 'completed' | 'cancelled';
}


// Message types for communication between Extension Host and Webview
export type ToWebviewMessage = | {
    type: 'showQuestion';
    question: string;
    title: string;
    requestId: string
}

    | {
        type: 'showList';
        requests: RequestItem[]
    }

    | {
        type: 'showHome';
        pendingRequests: RequestItem[];
        pendingPlanReviews: StoredInteraction[];
        historyInteractions: StoredInteraction[];
        recentInteractions: ToolCallInteraction[]
    }

    | {
        type: 'updateAttachments';
        requestId: string;
        attachments: AttachmentInfo[]
    }

    | {
        type: 'fileSearchResults';
        files: FileSearchResult[]
    }

    | {
        type: 'imageSaved';
        requestId: string;
        attachment: AttachmentInfo
    }

    | {
        type: 'showInteractionDetail';
        interaction: StoredInteraction
    }

    | {
        type: 'switchTab';
        tab: 'pending' | 'history'
    }

    | {
        type: 'clear'
    }

    ;

export type FromWebviewMessage = | {
    type: 'submit';
    response: string;
    requestId: string;
    attachments: AttachmentInfo[]
}

    | {
        type: 'cancel';
        requestId: string
    }

    | {
        type: 'selectRequest';
        requestId: string
    }

    | {
        type: 'backToList'
    }

    | {
        type: 'backToHome'
    }

    | {
        type: 'clearHistory'
    }

    | {
        type: 'clearChatHistory'
    }

    | {
        type: 'addAttachment';
        requestId: string
    }

    | {
        type: 'removeAttachment';
        requestId: string;
        attachmentId: string
    }

    | {
        type: 'searchFiles';
        query: string
    }

    | {
        type: 'saveImage';
        requestId: string;
        data: string;
        mimeType: string
    }

    | {
        type: 'addFileReference';
        requestId: string;
        file: FileSearchResult
    }

    | {
        type: 'addFolderAttachment';
        requestId: string
    }

    | {
        type: 'selectPlanReview';
        interactionId: string
    }

    | {
        type: 'selectInteraction';
        interactionId: string
    }

    | {
        type: 'openPlanReviewPanel';
        interactionId: string
    }

    | {
        type: 'deleteInteraction';
        interactionId: string
    }

    | {
        type: 'cancelPendingRequest';
        requestId: string
    }
    ;


// Plan review types (shared between extension and webview)
export type PlanReviewMode = 'review' | 'walkthrough';

export interface PlanReviewOptions {
    plan: string;
    title?: string;
    mode?: PlanReviewMode;
    readOnly?: boolean;
    existingComments?: RequiredPlanRevisions[];
    interactionId?: string;
}

export interface PlanReviewResult {
    approved: boolean;
    requiredRevisions: RequiredPlanRevisions[];
    action: 'approved' | 'recreateWithChanges' | 'acknowledged' | 'closed';
}

// Messages for plan review panel
export type PlanReviewPanelToWebviewMessage =
    | { type: 'showPlan'; content: string; title: string; mode: PlanReviewMode; readOnly: boolean; comments: RequiredPlanRevisions[] }
    | { type: 'updateComments'; comments: RequiredPlanRevisions[] };

export type PlanReviewPanelFromWebviewMessage =
    | { type: 'approve'; comments: RequiredPlanRevisions[] }
    | { type: 'reject'; comments: RequiredPlanRevisions[] }
    | { type: 'acknowledge'; comments: RequiredPlanRevisions[] }
    | { type: 'close'; comments: RequiredPlanRevisions[] }
    | { type: 'addComment'; revisedPart: string; revisorInstructions: string }
    | { type: 'editComment'; index: number; revisorInstructions: string }
    | { type: 'removeComment'; index: number }
    | { type: 'exportPlan' };
// File search result for autocomplete
export interface FileSearchResult {
    name: string;
    path: string;
    uri: string;
    icon: string;
    isFolder?: boolean; // True if this is a folder result
}

// Result type for user responses
export interface UserResponseResult {
    responded: boolean;
    response: string;
    attachments: AttachmentInfo[];
}
