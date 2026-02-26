/**
 * Shared HTML utilities for Chat Output Renderer cards.
 * 
 * All functions run in the extension host (not in the webview).
 * They produce HTML strings that are set as `chatOutputWebview.webview.html`.
 */

import { localize } from '../localization';

/**
 * Generates a random nonce string for CSP script whitelisting.
 */
export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Escapes a string for safe insertion into HTML content.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Builds a CSP meta tag for renderer webviews.
 * No scripts needed — cards are static HTML with inline styles.
 */
export function buildCspMetaTag(): string {
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />`;
}

/**
 * Returns shared CSS for all renderer cards using VS Code theme variables.
 */
export function getCardCss(): string {
    return `
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground, #cccccc);
            background: transparent;
            padding: 8px 0;
            margin: 0;
            line-height: 1.4;
        }
        .card {
            border: 1px solid var(--vscode-panel-border, #2d2d2d);
            border-radius: 6px;
            overflow: hidden;
            background: var(--vscode-editor-background, #1e1e1e);
        }
        .card-header {
            padding: 10px 14px;
            border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 0.95em;
        }
        .card-body {
            padding: 12px 14px;
        }
        .card-footer {
            padding: 6px 14px 10px;
            text-align: right;
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground, #888888);
        }
        .section {
            margin-bottom: 10px;
        }
        .section:last-child {
            margin-bottom: 0;
        }
        .section-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground, #888888);
            margin-bottom: 4px;
            font-weight: 600;
        }
        .section-content {
            padding-left: 2px;
        }
        .status-approved {
            color: var(--vscode-testing-iconPassed, #28a745);
        }
        .status-changes {
            color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
        }
        .status-cancelled {
            color: var(--vscode-testing-iconFailed, #f85149);
        }
        .status-acknowledged {
            color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
        }
        .status-dismissed {
            color: var(--vscode-testing-iconFailed, #f85149);
        }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.85em;
            font-weight: 600;
        }
        .badge-approved {
            background: rgba(40, 167, 69, 0.15);
            color: var(--vscode-testing-iconPassed, #28a745);
        }
        .badge-changes {
            background: rgba(204, 167, 0, 0.15);
            color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
        }
        .badge-cancelled {
            background: rgba(248, 81, 73, 0.15);
            color: var(--vscode-testing-iconFailed, #f85149);
        }
        .badge-acknowledged {
            background: rgba(55, 148, 255, 0.15);
            color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
        }
        .attachment-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .attachment-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 0;
            font-size: 0.9em;
        }
        .attachment-icon {
            opacity: 0.7;
        }
        blockquote {
            border-left: 3px solid var(--vscode-panel-border, #2d2d2d);
            padding-left: 12px;
            margin: 6px 0;
            color: var(--vscode-descriptionForeground, #888888);
            font-style: italic;
        }
        details {
            margin-top: 6px;
        }
        details summary {
            cursor: pointer;
            color: var(--vscode-textLink-foreground, #3794ff);
            font-size: 0.9em;
            padding: 4px 0;
            user-select: none;
        }
        details summary:hover {
            color: var(--vscode-textLink-activeForeground, #3794ff);
        }
        .plan-content {
            margin-top: 8px;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border, #2d2d2d);
            border-radius: 4px;
            background: var(--vscode-textBlockQuote-background, #1a1a1a);
            overflow-x: auto;
            font-size: 0.9em;
            line-height: 1.5;
        }
        .plan-content h1, .plan-content h2, .plan-content h3,
        .plan-content h4, .plan-content h5, .plan-content h6 {
            margin-top: 12px;
            margin-bottom: 6px;
            font-weight: 600;
        }
        .plan-content h1 { font-size: 1.3em; }
        .plan-content h2 { font-size: 1.15em; }
        .plan-content h3 { font-size: 1.05em; }
        .plan-content p { margin: 6px 0; }
        .plan-content ul, .plan-content ol {
            padding-left: 20px;
            margin: 6px 0;
        }
        .plan-content li { margin: 3px 0; }
        .plan-content code {
            background: var(--vscode-textCodeBlock-background, #2a2a2a);
            padding: 1px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 0.9em;
        }
        .plan-content pre {
            background: var(--vscode-textCodeBlock-background, #2a2a2a);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        .plan-content pre code {
            background: transparent;
            padding: 0;
        }
        .revision-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .revision-item {
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border, #2d2d2d);
        }
        .revision-item:last-child {
            border-bottom: none;
        }
        .revision-part {
            font-weight: 600;
            font-size: 0.9em;
            margin-bottom: 3px;
        }
        .revision-instruction {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground, #888888);
            padding-left: 8px;
        }
        .truncated-notice {
            font-size: 0.85em;
            color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
            font-style: italic;
            margin-top: 6px;
        }
        .truncated-preview {
            margin-top: 6px;
            color: var(--vscode-foreground, #cccccc);
            cursor: default;
        }
        details[open] .truncated-preview {
            display: none;
        }
    `;
}

/**
 * Formats a timestamp as a relative time string.
 */
export function formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 0) { return localize('time.justNow'); }

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) { return localize('time.justNow'); }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) { return localize('time.minutesAgo', minutes); }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return localize('time.hoursAgo', hours); }

    const days = Math.floor(hours / 24);
    if (days < 30) { return localize('time.daysAgo', days); }

    // Fall back to absolute date
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Wraps card HTML in a full document with CSP and theme CSS.
 */
export function wrapInDocument(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${buildCspMetaTag()}
    <title>${escapeHtml(title)}</title>
    <style>${getCardCss()}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
