/**
 * Type declarations for the proposed `chatOutputRenderer` API.
 * 
 * These types extend the stable vscode API with proposed features that are
 * gated behind `enabledApiProposals: ["chatOutputRenderer"]` in package.json.
 * 
 * Reference: https://github.com/microsoft/vscode-extension-samples/tree/main/chat-output-renderer-sample
 * 
 * TODO: Remove this file once the API is stabilized and types are included in @types/vscode.
 */

import * as vscode from 'vscode';

declare module 'vscode' {

    /**
     * Extended tool result that supports attaching binary data for chat output renderers.
     * The `toolResultDetails2` property provides MIME-typed binary data that VS Code
     * matches against registered `chatOutputRenderers` to render inline webview cards.
     */
    interface ExtendedLanguageModelToolResult2 extends LanguageModelToolResult {
        toolResultDetails2?: {
            /** MIME type used to match a registered chatOutputRenderer */
            mime: string;
            /** Binary data (typically UTF-8 encoded JSON) passed to the renderer */
            value: Uint8Array;
        };
    }

    /**
     * A webview container provided to chat output renderers for rendering inline content.
     */
    interface ChatOutputWebview {
        readonly webview: Webview;
    }

    /**
     * Renderer that creates inline webview widgets in the chat stream.
     */
    interface ChatOutputRenderer {
        renderChatOutput(
            data: { value: Uint8Array },
            chatOutputWebview: ChatOutputWebview,
            ctx: unknown,
            token: CancellationToken
        ): Promise<void> | void;
    }

    namespace chat {
        /**
         * Register a chat output renderer for a specific view type.
         * The view type must match a `chatOutputRenderers` contribution in package.json.
         */
        function registerChatOutputRenderer(
            viewType: string,
            renderer: ChatOutputRenderer
        ): Disposable;
    }
}
