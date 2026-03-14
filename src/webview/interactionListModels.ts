import type { StoredInteraction } from './types';

export interface PendingStoredInteractionEntry {
    id: string;
    type: 'plan_review' | 'whiteboard';
    timestamp: number;
    title: string;
    preview: string;
    status: string;
    isDebug?: boolean;
}

export interface UnifiedHistoryEntry {
    id: string;
    type: 'ask_user' | 'plan_review' | 'whiteboard' | 'renderUI';
    timestamp: number;
    title: string;
    preview: string;
    status?: string;
    isDebug?: boolean;
}

export interface WhiteboardInteractionLabels {
    defaultTitle?: string;
    pendingPreview?: string;
    historyPreview?: string;
    submittedPreview?: string;
}

const defaultWhiteboardLabels: Required<WhiteboardInteractionLabels> = {
    defaultTitle: 'Whiteboard',
    pendingPreview: 'Pending whiteboard',
    historyPreview: 'Whiteboard',
    submittedPreview: 'Submitted whiteboard',
};

export function buildPendingStoredInteractionEntries(
    interactions: StoredInteraction[],
    labels: WhiteboardInteractionLabels = {},
): PendingStoredInteractionEntry[] {
    const whiteboardLabels = { ...defaultWhiteboardLabels, ...labels };

    return interactions
        .filter((interaction): interaction is StoredInteraction & { type: 'plan_review' | 'whiteboard' } => {
            if (interaction.type === 'plan_review') {
                return interaction.status === 'pending';
            }

            return interaction.type === 'whiteboard' && interaction.whiteboardSession?.status === 'pending';
        })
        .map((interaction) => ({
            id: interaction.id,
            type: interaction.type,
            timestamp: interaction.timestamp,
            title: getInteractionTitle(interaction, whiteboardLabels),
            preview: getPendingInteractionPreview(interaction, whiteboardLabels),
            status: getInteractionStatus(interaction) || 'pending',
            isDebug: interaction.isDebug,
        }))
        .sort((left, right) => right.timestamp - left.timestamp);
}

export function buildUnifiedHistoryEntries(
    interactions: StoredInteraction[],
    labels: WhiteboardInteractionLabels = {},
): UnifiedHistoryEntry[] {
    const whiteboardLabels = { ...defaultWhiteboardLabels, ...labels };

    return interactions
        .filter((interaction) => interaction.type !== 'whiteboard' || isCompletedWhiteboard(interaction))
        .map((interaction) => ({
            id: interaction.id,
            type: interaction.type,
            timestamp: interaction.timestamp,
            title: getInteractionTitle(interaction, whiteboardLabels),
            preview: getHistoryPreview(interaction, whiteboardLabels),
            status: getInteractionStatus(interaction),
            isDebug: interaction.isDebug,
        }))
        .sort((left, right) => right.timestamp - left.timestamp) as UnifiedHistoryEntry[];
}

function getInteractionTitle(
    interaction: StoredInteraction,
    labels: Required<WhiteboardInteractionLabels>,
): string {
    if (interaction.type === 'plan_review') {
        return interaction.title || 'Plan Review';
    }

    if (interaction.type === 'whiteboard') {
        return interaction.title || interaction.whiteboardSession?.title || labels.defaultTitle;
    }

    if (interaction.type === 'renderUI') {
        return interaction.title || interaction.renderUISession?.title || 'UI Surface';
    }

    return interaction.agentName ?? interaction.question ?? 'Ask User';
}

function getPendingInteractionPreview(
    interaction: StoredInteraction,
    labels: Required<WhiteboardInteractionLabels>,
): string {
    if (interaction.type === 'plan_review') {
        return interaction.plan || '';
    }

    const session = interaction.whiteboardSession;
    if (!session) {
        return labels.pendingPreview;
    }

    return buildWhiteboardPreview(
        session.context,
        session.canvases.map((canvas) => canvas.name),
        labels.pendingPreview,
    );
}

function getHistoryPreview(
    interaction: StoredInteraction,
    labels: Required<WhiteboardInteractionLabels>,
): string {
    if (interaction.type === 'plan_review') {
        return interaction.plan || '';
    }

    if (interaction.type === 'whiteboard') {
        const session = interaction.whiteboardSession;
        if (!session) {
            return labels.historyPreview;
        }

        const submittedCanvasNames = session.submittedCanvases?.map((canvas) => canvas.name) || [];
        if (submittedCanvasNames.length > 0) {
            return buildWhiteboardPreview(session.context, submittedCanvasNames, labels.submittedPreview);
        }

        return buildWhiteboardPreview(
            session.context,
            session.canvases.map((canvas) => canvas.name),
            labels.historyPreview,
        );
    }

    if (interaction.type === 'renderUI') {
        const session = interaction.renderUISession;
        if (!session) {
            return 'UI Surface';
        }
        const componentCount = session.components?.length ?? 0;
        const actionText = session.dismissed ? 'Dismissed' : session.userAction ? `Action: ${session.userAction.name}` : 'Viewed';
        return `${actionText}${componentCount > 0 ? ` • ${componentCount} component${componentCount === 1 ? '' : 's'}` : ''}`;
    }

    return interaction.question || '';
}

function getInteractionStatus(interaction: StoredInteraction): string | undefined {
    if (interaction.type === 'whiteboard') {
        return interaction.whiteboardSession?.status || 'pending';
    }

    // renderUI doesn't have a status - it's always completed
    if (interaction.type === 'renderUI') {
        return undefined;
    }

    return interaction.status;
}

function isCompletedWhiteboard(interaction: StoredInteraction): boolean {
    const status = interaction.whiteboardSession?.status;
    return interaction.type === 'whiteboard' && (
        status === 'approved'
        || status === 'recreateWithChanges'
        || status === 'cancelled'
    );
}

function buildWhiteboardPreview(context: string | undefined, canvasNames: string[], fallback: string): string {
    const parts: string[] = [];
    if (context) {
        parts.push(context);
    }

    if (canvasNames.length > 0) {
        parts.push(canvasNames.join(', '));
    }

    return parts.join(' • ') || fallback;
}
