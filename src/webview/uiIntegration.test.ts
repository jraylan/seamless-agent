import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = process.cwd();
const webviewHtml = fs.readFileSync(path.join(repoRoot, 'media', 'webview.html'), 'utf8');
const mainTs = fs.readFileSync(path.join(repoRoot, 'src', 'webview', 'main.ts'), 'utf8');
const localizationTs = fs.readFileSync(path.join(repoRoot, 'src', 'localization.ts'), 'utf8');

const localeFiles = [
    'package.nls.json',
    'package.nls.pt-br.json',
    'package.nls.pt.json',
] as const;

const requiredLocaleKeys = [
    'history.filter.whiteboard',
    'debug.sectionWhiteboard',
    'debug.mockWhiteboard',
    'detail.whiteboard',
    'detail.whiteboardContext',
    'detail.whiteboardCanvases',
    'detail.whiteboardSubmittedCanvases',
    'detail.whiteboardNoCanvases',
    'detail.whiteboardSession',
    'detail.whiteboardStatus',
    'status.submitted',
] as const;

describe('whiteboard UI integration', () => {
    it('adds a dedicated whiteboard history filter to the webview template', () => {
        assert.match(webviewHtml, /data-filter="whiteboard"/);
        assert.match(webviewHtml, /\{\{historyFilterWhiteboard\}\}/);
    });

    it('wires whiteboard filter and debug labels through localized webview strings', () => {
        assert.match(mainTs, /filter === 'whiteboard'/);
        assert.match(mainTs, /historyFilterWhiteboard/);
        assert.match(mainTs, /debugSectionWhiteboard/);
        assert.match(mainTs, /debugMockWhiteboard/);
    });

    it('localizes whiteboard detail labels instead of hardcoding them in the webview', () => {
        assert.match(mainTs, /detailWhiteboard/);
        assert.doesNotMatch(mainTs, /const contextLabel = 'Context';/);
        assert.doesNotMatch(mainTs, /const canvasesLabel = 'Canvases';/);
        assert.doesNotMatch(mainTs, /const submittedLabel = 'Submitted canvases';/);
        assert.doesNotMatch(mainTs, /const statusLabel = 'Status';/);
        assert.doesNotMatch(mainTs, /'No canvases stored'/);
        assert.doesNotMatch(mainTs, /'Open Whiteboard'/);
    });

    it('adds an inline whiteboard button to ask_user attachments and wires its message handler', () => {
        assert.match(webviewHtml, /class="input-tools-stack"/);
        assert.match(webviewHtml, /id="attach-btn"[\s\S]*id="whiteboard-btn"/);
        assert.match(webviewHtml, /id="whiteboard-btn"/);
        assert.match(webviewHtml, /\{\{openWhiteboard\}\}/);
        assert.match(mainTs, /const whiteboardBtn = document.getElementById\('whiteboard-btn'\)/);
        assert.match(mainTs, /type: 'openInlineWhiteboard'/);
    });

    it('reopens whiteboard history items in the whiteboard panel instead of the detail view', () => {
        assert.match(mainTs, /else if \(type === 'whiteboard'\)/);
        assert.match(mainTs, /type: 'openWhiteboardPanel', interactionId: id/);
    });

    it('defines whiteboard integration localization accessors', () => {
        assert.match(localizationTs, /get historyFilterWhiteboard\(\)/);
        assert.match(localizationTs, /get debugSectionWhiteboard\(\)/);
        assert.match(localizationTs, /get debugMockWhiteboard\(\)/);
        assert.match(localizationTs, /get detailWhiteboard\(\)/);
        assert.match(localizationTs, /get detailWhiteboardContext\(\)/);
        assert.match(localizationTs, /get detailWhiteboardCanvases\(\)/);
        assert.match(localizationTs, /get detailWhiteboardSubmittedCanvases\(\)/);
        assert.match(localizationTs, /get detailWhiteboardNoCanvases\(\)/);
        assert.match(localizationTs, /get detailWhiteboardSession\(\)/);
        assert.match(localizationTs, /get detailWhiteboardStatus\(\)/);
        assert.match(localizationTs, /get submitted\(\)/);
    });

    it('ships the required whiteboard integration localization keys in every locale bundle', () => {
        for (const file of localeFiles) {
            const bundle = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')) as Record<string, string>;

            for (const key of requiredLocaleKeys) {
                assert.ok(bundle[key], `Expected ${file} to define ${key}`);
            }
        }
    });
});
