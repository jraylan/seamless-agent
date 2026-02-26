/**
 * Chat Output Renderer for `ask_user` tool results.
 * 
 * Renders a rich inline card in the chat stream showing:
 * - Agent name and title
 * - The question asked
 * - The user's response (or dismissed state)
 * - Attachment list
 * - Relative timestamp
 */

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { AskUserRendererData, decodeRendererData } from './types';
import { escapeHtml, formatTimestamp, wrapInDocument } from './htmlUtils';
import { strings } from '../localization';

/** View type matching the chatOutputRenderers contribution in package.json */
export const ASK_USER_VIEW_TYPE = 'seamless-agent.askUserResult';

/** Shared markdown-it instance for rendering user response content */
const md = new MarkdownIt({
    html: false,        // Disable HTML passthrough for security
    linkify: true,
    typographer: false,
});

/**
 * Registers the ask_user chat output renderer.
 */
export function registerAskUserRenderer(): vscode.Disposable {
    return vscode.chat.registerChatOutputRenderer(ASK_USER_VIEW_TYPE, {
        async renderChatOutput({ value }, chatOutputWebview, _ctx, _token) {
            let html: string;
            try {
                const data = decodeRendererData<AskUserRendererData>(value);
                html = buildAskUserCardHtml(data);
            } catch {
                html = buildFallbackHtml(strings.rendererRenderErrorAskUser);
            }

            chatOutputWebview.webview.options = { enableScripts: false };
            chatOutputWebview.webview.html = html;
        },
    });
}

/**
 * Builds the HTML for an ask_user result card.
 */
function buildAskUserCardHtml(data: AskUserRendererData): string {
    const agentName = escapeHtml(data.agentName || strings.rendererDefaultAgentName);
    const title = data.title ? escapeHtml(data.title) : strings.rendererUserResponse;
    const timestamp = formatTimestamp(data.timestamp);

    let bodyHtml: string;

    if (!data.responded) {
        // Dismissed / cancelled state
        bodyHtml = `
<div class="card">
    <div class="card-header">
        <span>💬</span>
        <span>${agentName}: ${title}</span>
    </div>
    <div class="card-body">
        <div class="section">
            <span class="status-dismissed">❌ ${escapeHtml(strings.rendererUserDismissed)}</span>
        </div>
    </div>
    <div class="card-footer">${timestamp}</div>
</div>`;
    } else {
        // Responded state
        const questionHtml = buildQuestionSection(data.question);
        const responseHtml = buildResponseSection(data.response);
        const attachmentsHtml = buildAttachmentsSection(data.attachments);

        bodyHtml = `
<div class="card">
    <div class="card-header">
        <span>💬</span>
        <span>${agentName}: ${title}</span>
    </div>
    <div class="card-body">
        ${questionHtml}
        ${responseHtml}
        ${attachmentsHtml}
    </div>
    <div class="card-footer">${timestamp}</div>
</div>`;
    }

    return wrapInDocument(`${strings.rendererUserResponse}: ${title}`, bodyHtml);
}

/**
 * Builds the question section. Long questions are truncated with a <details> expand.
 */
function buildQuestionSection(question: string): string {
    const MAX_QUESTION_LENGTH = 300;
    const renderedHtml = md.render(question);

    if (question.length <= MAX_QUESTION_LENGTH) {
        return `
        <div class="section">
            <div class="section-label">${escapeHtml(strings.question)}:</div>
            <div class="section-content plan-content">${renderedHtml}</div>
        </div>`;
    }

    const truncatedRendered = md.render(question.substring(0, MAX_QUESTION_LENGTH) + '…');
    return `
        <div class="section">
            <div class="section-label">${escapeHtml(strings.question)}:</div>
            <details>
                <summary>
                    ${escapeHtml(strings.rendererClickToExpand)}
                    <div class="truncated-preview plan-content">${truncatedRendered}</div>
                </summary>
                <div class="section-content plan-content" style="margin-top: 6px;">${renderedHtml}</div>
            </details>
        </div>`;
}

/**
 * Builds the response section.
 */
function buildResponseSection(response: string): string {
    const renderedHtml = md.render(response);
    return `
        <div class="section">
            <div class="section-label"><span class="status-approved">✅</span> ${escapeHtml(strings.rendererUserResponded)}</div>
            <div class="section-content plan-content">${renderedHtml}</div>
        </div>`;
}

/**
 * Builds the attachments section if there are any attachments.
 */
function buildAttachmentsSection(attachments: AskUserRendererData['attachments']): string {
    if (!attachments || attachments.length === 0) {
        return '';
    }

    const items = attachments.map(att => {
        const name = escapeHtml(att.name);
        const icon = att.isImage ? '🖼️' : '📎';
        return `<li class="attachment-item"><span class="attachment-icon">${icon}</span> ${name}</li>`;
    }).join('\n');

    return `
        <div class="section">
            <div class="section-label">📎 ${escapeHtml(strings.rendererAttachments)}</div>
            <ul class="attachment-list">
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
