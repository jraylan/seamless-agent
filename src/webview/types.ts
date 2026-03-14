// Comment structure for feedback
export interface RequiredPlanRevisions {
    revisedPart: string;
    revisorInstructions: string;
}

export interface WhiteboardShapeSummary {
    id: string;
    objectType: string;
    label?: string;
}

export interface WhiteboardImageReference {
    id: string;
    sourceUri?: string;
    mimeType?: string;
    width?: number;
    height?: number;
}

export interface WhiteboardCanvas {
    id: string;
    name: string;
    fabricState: string;
    thumbnail?: string;
    createdAt: number;
    updatedAt: number;
    shapes?: WhiteboardShapeSummary[];
    images?: WhiteboardImageReference[];
}

/**
 * Canonical submit payload after the extension normalizes the message boundary.
 * `name` remains optional here because legacy/current submit messages may omit it.
 */
export interface NormalizedWhiteboardCanvasSubmission {
    id: string;
    imageUri: string;
    name?: string;
    fabricState?: string;
    thumbnail?: string;
    shapes?: WhiteboardShapeSummary[];
    images?: WhiteboardImageReference[];
}

/**
 * Stored/result whiteboard record. Names are required once a submission is
 * persisted or returned from the tool contract.
 */
export interface WhiteboardSubmittedCanvas {
    id: string;
    imageUri: string;
    name: string;
}

export interface LegacyWhiteboardSubmittedCanvas {
    /** @deprecated Use `id` for submit payloads. */
    canvasId: string;
    imageUri: string;
    name?: string;
    fabricState?: string;
    thumbnail?: string;
    shapes?: WhiteboardShapeSummary[];
    images?: WhiteboardImageReference[];
}

export type WhiteboardCanvasSubmission = NormalizedWhiteboardCanvasSubmission | LegacyWhiteboardSubmittedCanvas;

export type WhiteboardReviewAction = 'approved' | 'recreateWithChanges' | 'cancelled';

export type WhiteboardSessionStatus = 'pending' | WhiteboardReviewAction;

export function isLegacyWhiteboardSubmittedCanvas(
    canvas: WhiteboardCanvasSubmission
): canvas is LegacyWhiteboardSubmittedCanvas {
    return 'canvasId' in canvas && !('id' in canvas);
}

/**
 * Normalizes whiteboard submit payloads at the webview message boundary so the
 * stored session/result contracts can stay canonical on `id`.
 */
export function normalizeWhiteboardSubmittedCanvas(
    canvas: WhiteboardCanvasSubmission
): NormalizedWhiteboardCanvasSubmission {
    if ('id' in canvas && 'canvasId' in canvas) {
        throw new Error('Whiteboard canvas submission cannot include both id and canvasId');
    }

    if (isLegacyWhiteboardSubmittedCanvas(canvas)) {
        return {
            id: canvas.canvasId,
            imageUri: canvas.imageUri,
            ...(typeof canvas.name === 'string' ? { name: canvas.name } : {}),
            ...(typeof canvas.fabricState === 'string' ? { fabricState: canvas.fabricState } : {}),
            ...(typeof canvas.thumbnail === 'string' ? { thumbnail: canvas.thumbnail } : {}),
            ...(Array.isArray(canvas.shapes) ? { shapes: canvas.shapes } : {}),
            ...(Array.isArray(canvas.images) ? { images: canvas.images } : {}),
        };
    }

    return canvas;
}

export function normalizeWhiteboardSubmittedCanvases(
    canvases: WhiteboardCanvasSubmission[]
): NormalizedWhiteboardCanvasSubmission[] {
    return canvases.map(normalizeWhiteboardSubmittedCanvas);
}

type WhiteboardCanvasNameLookup = Pick<WhiteboardCanvas, 'id' | 'name'>;

export function resolveWhiteboardSubmittedCanvas(
    canvas: WhiteboardCanvasSubmission,
    canvases: WhiteboardCanvasNameLookup[]
): WhiteboardSubmittedCanvas {
    const normalizedCanvas = normalizeWhiteboardSubmittedCanvas(canvas);
    const storedCanvas = canvases.find((candidate) => candidate.id === normalizedCanvas.id);
    const name = normalizedCanvas.name ?? storedCanvas?.name;

    if (!name) {
        throw new Error(`Whiteboard canvas submission '${normalizedCanvas.id}' is missing a name`);
    }

    // Return only the canonical fields: extra heavy fields (fabricState, thumbnail, shapes, images)
    // must NOT be forwarded to the stored/result contract to avoid bloating tool results.
    return {
        id: normalizedCanvas.id,
        imageUri: normalizedCanvas.imageUri,
        name,
    };
}

export function resolveWhiteboardSubmittedCanvases(
    submittedCanvases: WhiteboardCanvasSubmission[],
    canvases: WhiteboardCanvasNameLookup[]
): WhiteboardSubmittedCanvas[] {
    return submittedCanvases.map((canvas) => resolveWhiteboardSubmittedCanvas(canvas, canvases));
}

export function mergeSubmittedWhiteboardCanvases(
    submittedCanvases: WhiteboardCanvasSubmission[],
    canvases: WhiteboardCanvas[]
): WhiteboardCanvas[] {
    const normalizedSubmissions = new Map(
        normalizeWhiteboardSubmittedCanvases(submittedCanvases).map((canvas) => [canvas.id, canvas])
    );

    return canvases.map((canvas) => {
        const submittedCanvas = normalizedSubmissions.get(canvas.id);
        if (!submittedCanvas) {
            return canvas;
        }

        return {
            ...canvas,
            ...(typeof submittedCanvas.name === 'string' ? { name: submittedCanvas.name } : {}),
            ...(typeof submittedCanvas.fabricState === 'string' ? { fabricState: submittedCanvas.fabricState } : {}),
            ...(typeof submittedCanvas.thumbnail === 'string' ? { thumbnail: submittedCanvas.thumbnail } : {}),
            ...(Array.isArray(submittedCanvas.shapes) ? { shapes: submittedCanvas.shapes } : {}),
            ...(Array.isArray(submittedCanvas.images) ? { images: submittedCanvas.images } : {}),
        };
    });
}

export interface WhiteboardSession {
    id: string;
    interactionId: string;
    context?: string;
    title?: string;
    canvases: WhiteboardCanvas[];
    activeCanvasId?: string;
    status: WhiteboardSessionStatus;
    submittedAt?: number;
    submittedCanvases?: WhiteboardSubmittedCanvas[];
}

export interface RenderUISession {
    id: string;
    interactionId: string;
    title?: string;
    surfaceId: string;
    components?: unknown[]; // A2UIComponent[] from a2ui/types
    dataModel?: Record<string, unknown>; // A2UIDataModel from a2ui/types
    userAction?: { name: string; data: Record<string, unknown> };
    dismissed?: boolean;
    renderErrors?: Array<{ source: string; message: string }>;
}

// Represents a stored interaction (ask_user, plan_review, whiteboard, or renderUI)
export interface StoredInteraction {
    id: string;
    type: 'ask_user' | 'plan_review' | 'whiteboard' | 'renderUI';
    timestamp: number;
    isDebug?: boolean;

    // For ask_user
    question?: string;
    response?: string;
    attachments?: AttachmentInfo[];
    agentName?: string;
    options?: AskUserOptions;
    selectedOptionLabels?: Record<string, string[]>;

    // For plan_review
    plan?: string;
    title?: string;
    mode?: 'review' | 'walkthrough';
    requiredRevisions?: RequiredPlanRevisions[];
    status?: 'pending' | 'approved' | 'recreateWithChanges' | 'acknowledged' | 'closed' | 'cancelled';

    // For whiteboard
    whiteboardSession?: WhiteboardSession;

    // For renderUI
    renderUISession?: RenderUISession;
}

export function isPendingStoredInteraction(interaction: StoredInteraction): boolean {
    if (interaction.type === 'plan_review') {
        return interaction.status === 'pending';
    }

    if (interaction.type === 'whiteboard') {
        const whiteboardStatus = interaction.whiteboardSession?.status;
        // Treat 'submitted' as completed (legacy status from old data)
        // Valid pending statuses: 'pending'
        // Completed statuses: 'approved', 'recreateWithChanges', 'cancelled', 'submitted'
        return (whiteboardStatus as string) === 'pending';
    }

    // renderUI and ask_user are always completed (no pending state)
    return false;
}

export function isCompletedStoredInteraction(interaction: StoredInteraction): boolean {
    if (interaction.type === 'ask_user') {
        return true;
    }

    if (interaction.type === 'whiteboard') {
        const whiteboardStatus = interaction.whiteboardSession?.status;
        // 'submitted' is a legacy/invalid status that should be treated as completed
        const status = whiteboardStatus as string;
        return status === 'approved'
            || status === 'recreateWithChanges'
            || status === 'cancelled'
            || status === 'submitted';
    }

    // renderUI is always completed (no pending state)
    if (interaction.type === 'renderUI') {
        return true;
    }

    return interaction.status !== 'pending';
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

// Option item for ask_user buttons
export interface OptionItem {
    label: string;
    description?: string;
}

// Option group for multi-category selection
export interface OptionGroup {
    title: string;
    options: (string | OptionItem)[];
    multiSelect?: boolean;
}

// Union type for options: flat array or grouped array
export type AskUserOptions = (string | OptionItem)[] | OptionGroup[];

// Request item for the list
export interface RequestItem {
    id: string;
    question: string;
    title: string;
    createdAt: number;
    agentName: string | undefined;
    attachments: AttachmentInfo[];
    options?: AskUserOptions;
    multiSelect?: boolean; // Allow multiple selections for flat option arrays
    draftText?: string; // Draft response text (auto-saved)
    isDebug?: boolean; // Whether this is a debug mock request
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
    requestId: string;
    options?: AskUserOptions;
    multiSelect?: boolean; // Allow multiple selections for flat option arrays
    pendingCount?: number;
    requestOrder?: number; // The order number (1-based) of this request
    attachments?: AttachmentInfo[]; // Attachments for this specific request
}
    | {
        type: 'showList';
        requests: RequestItem[];
        selectedRequestId?: string;
    }
    | {
        type: 'updatePendingCount';
        count: number;
        requestOrder?: number;
    }
    | {
        type: 'showHome';
        pendingRequests: RequestItem[];
        pendingPlanReviews: StoredInteraction[];
        pendingWhiteboards: StoredInteraction[];
        historyInteractions: StoredInteraction[];
        recentInteractions: ToolCallInteraction[];
        selectedRequestId?: string;
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
        type: 'batchDeleteCompleted';
        success: boolean; // true if user confirmed and items were deleted, false if cancelled
    }
    | {
        type: 'updateConfig';
        key: string;
        value: boolean | string | number;
    }
    | {
        type: 'clear'
    };

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type FromWebviewMessage = | {
    type: 'submit';
    response: string;
    requestId: string;
    attachments: AttachmentInfo[];
    selectedOptions?: Record<string, string[]>;
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
        type: 'openInlineWhiteboard';
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
        type: 'openWhiteboardPanel';
        interactionId: string
    }
    | {
        type: 'deleteInteraction';
        interactionId: string
    }
    | {
        type: 'deleteMultipleInteractions';
        interactionIds: string[]
    }
    | {
        type: 'cancelPendingRequest';
        requestId: string
    }
    | {
        type: 'saveDraft';
        requestId: string;
        draftText: string
    }
    | {
        type: 'approve';
        comments: RequiredPlanRevisions[]
    }
    | {
        type: 'reject';
        comments: RequiredPlanRevisions[]
    }
    | {
        type: 'acknowledge';
        comments: RequiredPlanRevisions[]
    }
    | {
        type: 'close';
        comments: RequiredPlanRevisions[]
    }
    | {
        type: 'addComment';
        revisedPart: string;
        revisorInstructions: string
    }
    | {
        type: 'editComment';
        index: number;
        revisorInstructions: string
    }
    | {
        type: 'removeComment';
        index: number
    }
    | {
        type: 'exportPlan'
    }
    | {
        type: 'log';
        level: LogLevel;
        message: any[];
    }
    | { type: 'ready' }
    | {
        type: 'debugMockToolCall';
        mockType: 'showLogs' | 'askUser' | 'askUserOptions' | 'askUserMultiStep' | 'askUserMultiStepLongText' | 'planReview' | 'walkthroughReview' | 'whiteboard' | 'whiteboardTest1' | 'whiteboardTest2' | 'renderUI' | 'renderUIForm' | 'renderUIMarkdown';
    }
    | {
        type: 'openSettings'
    }
    | {
        type: 'showLogs'
    };


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
    | { type: 'ready' }
    | { type: 'approve'; comments: RequiredPlanRevisions[] }
    | { type: 'reject'; comments: RequiredPlanRevisions[] }
    | { type: 'acknowledge'; comments: RequiredPlanRevisions[] }
    | { type: 'close'; comments: RequiredPlanRevisions[] }
    | { type: 'addComment'; revisedPart: string; revisorInstructions: string }
    | { type: 'editComment'; index: number; revisorInstructions: string }
    | { type: 'removeComment'; index: number }
    | { type: 'exportPlan' };


export type WhiteboardToExtensionMessage =
    | { type: 'ready' }
    | { type: 'submit'; action: Exclude<WhiteboardReviewAction, 'cancelled'>; canvases: WhiteboardCanvasSubmission[]; userComment?: string }
    | { type: 'cancel' }
    | {
        type: 'saveCanvas';
        canvasId: string;
        name?: string;
        fabricState: string;
        thumbnail?: string;
        shapes?: WhiteboardShapeSummary[];
        images?: WhiteboardImageReference[];
    }
    | { type: 'deleteCanvas'; canvasId: string }
    | { type: 'createCanvas'; name: string; canvasId?: string; fabricState?: string }
    | { type: 'switchCanvas'; canvasId: string };

export type ExtensionToWhiteboardMessage =
    | { type: 'initialize'; session: WhiteboardSession; title: string }
    | { type: 'cancel' }
    | { type: 'error'; message: string };

export interface WhiteboardPanelOptions {
    interactionId: string;
    title: string;
    session: WhiteboardSession;
}

export interface WhiteboardPanelResult {
    submitted: boolean;
    action: WhiteboardReviewAction;
    canvases: WhiteboardCanvasSubmission[];
    userComment?: string;
}
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

export interface VSCodeAPI {
    postMessage(message: FromWebviewMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}
