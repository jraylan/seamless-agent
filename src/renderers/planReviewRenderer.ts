/**
 * Chat Output Renderer for plan review / walkthrough review tool results.
 * 
 * Renders a rich inline card in the chat stream showing:
 * - Title and status badge (Approved / Changes Requested / Cancelled / Acknowledged)
 * - Mode indicator (Review vs. Walkthrough)
 * - Collapsible plan content (markdown rendered to HTML)
 * - Revision comments (if any)
 * - Relative timestamp
 * 
 * Markdown is rendered server-side via `markdown-it` in the extension host,
 * not in the webview. This avoids the need for `enableScripts`.
 */

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { PlanReviewRendererData, decodeRendererData } from './types';
import { escapeHtml, formatTimestamp, wrapInDocument } from './htmlUtils';
import { strings } from '../localization';

/** View type matching the chatOutputRenderers contribution in package.json */
export const PLAN_REVIEW_VIEW_TYPE = 'seamless-agent.planReviewResult';

/** Shared markdown-it instance */
const md = new MarkdownIt({
    html: false,        // Disable HTML passthrough for security
    linkify: true,
    typographer: false,
});

/**
 * Registers the plan review chat output renderer.
 */
export function registerPlanReviewRenderer(): vscode.Disposable {
    return vscode.chat.registerChatOutputRenderer(PLAN_REVIEW_VIEW_TYPE, {
        async renderChatOutput({ value }, chatOutputWebview, _ctx, _token) {
            let html: string;
            try {
                const data = decodeRendererData<PlanReviewRendererData>(value);
                html = buildPlanReviewCardHtml(data);
            } catch {
                html = buildFallbackHtml(strings.rendererRenderErrorPlanReview);
            }

            chatOutputWebview.webview.options = { enableScripts: false };
            chatOutputWebview.webview.html = html;
        },
    });
}

/**
 * Builds the HTML for a plan review result card.
 */
function buildPlanReviewCardHtml(data: PlanReviewRendererData): string {
    const title = escapeHtml(data.title || strings.rendererPlanReview);
    const timestamp = formatTimestamp(data.timestamp);
    const statusHtml = buildStatusBadge(data.status);
    const modeLabel = data.mode === 'walkthrough' ? strings.rendererWalkthrough : strings.rendererReview;
    const headerIcon = data.mode === 'walkthrough' ? '📖' : '📋';

    const planHtml = buildPlanSection(data.plan);
    const revisionsHtml = buildRevisionsSection(data.requiredRevisions);

    const bodyHtml = `
<div class="card">
    <div class="card-header">
        <span>${headerIcon}</span>
        <span>${escapeHtml(modeLabel)}: ${title}</span>
    </div>
    <div class="card-body">
        <div class="section">
            <div class="section-label">${escapeHtml(strings.rendererStatus)}</div>
            <div class="section-content">${statusHtml}</div>
        </div>
        ${planHtml}
        ${revisionsHtml}
    </div>
    <div class="card-footer">${timestamp}</div>
</div>`;

    return wrapInDocument(`${escapeHtml(strings.rendererPlanReview)}: ${title}`, bodyHtml);
}

/**
 * Builds a status badge with color-coded styling.
 */
function buildStatusBadge(status: PlanReviewRendererData['status']): string {
    switch (status) {
        case 'approved':
            return `<span class="badge badge-approved">✅ ${escapeHtml(strings.approved)}</span>`;
        case 'recreateWithChanges':
            return `<span class="badge badge-changes">🔄 ${escapeHtml(strings.rendererChangesRequested)}</span>`;
        case 'cancelled':
            return `<span class="badge badge-cancelled">❌ ${escapeHtml(strings.cancelled)}</span>`;
        case 'acknowledged':
            return `<span class="badge badge-acknowledged">📖 ${escapeHtml(strings.acknowledged)}</span>`;
        default:
            return `<span class="badge">${escapeHtml(String(status))}</span>`;
    }
}

/**
 * Builds the plan content section, rendered from markdown to HTML.
 * Content is collapsed by default using <details>.
 */
function buildPlanSection(plan: string): string {
    if (!plan || plan.trim().length === 0) {
        return '';
    }

    // Render markdown to HTML server-side
    const renderedHtml = md.render(plan);

    return `
        <div class="section">
            <details>
                <summary>${escapeHtml(strings.rendererViewPlan)}</summary>
                <div class="plan-content">${renderedHtml}</div>
            </details>
        </div>`;
}

/**
 * Builds the revision comments section.
 */
function buildRevisionsSection(revisions: PlanReviewRendererData['requiredRevisions']): string {
    if (!revisions || revisions.length === 0) {
        return '';
    }

    const items = revisions.map((rev, i) => {
        const part = escapeHtml(rev.revisedPart);
        const instruction = escapeHtml(rev.revisorInstructions);
        return `
            <li class="revision-item">
                <div class="revision-part">${i + 1}. "${part}"</div>
                <div class="revision-instruction">→ ${instruction}</div>
            </li>`;
    }).join('\n');

    return `
        <div class="section">
            <div class="section-label">💬 ${escapeHtml(strings.rendererRevisionsRequired)}</div>
            <ul class="revision-list">
                ${items}
            </ul>
        </div>`;
}

/**
 * Builds a fallback HTML page when rendering fails.
 */
function buildFallbackHtml(message: string): string {
    return wrapInDocument(strings.rendererError, `
<div class="card">
    <div class="card-body">
        <span class="status-cancelled">${escapeHtml(message)}</span>
    </div>
</div>`);
}
