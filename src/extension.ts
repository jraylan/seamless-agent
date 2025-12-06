import * as vscode from 'vscode';
import { registerNativeTools } from './tools';
import { AgentInteractionProvider } from './webviewProvider';

const PARTICIPANT_ID = 'seamless-agent.agent';

export function activate(context: vscode.ExtensionContext) {
    console.log('Seamless Agent extension active');

    // Register the webview provider for the Agent Console panel
    const provider = new AgentInteractionProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AgentInteractionProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Register the ask_user tool with the webview provider
    registerNativeTools(context, provider);

    // Create a Chat Participant that uses our tool
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        // Get our ask_user tool
        const askUserTool = vscode.lm.tools.find(t => t.name === 'ask_user');

        // Get all available tools including ours
        const tools = askUserTool ? [askUserTool] : [];

        // Build the prompt with instruction to use the tool
        const systemPrompt = `You are a helpful assistant. 
IMPORTANT: You have access to an "ask_user" tool. You MUST use this tool before completing any task to confirm with the user that their request was fulfilled correctly.
Never finish a response without first calling the ask_user tool to verify with the user.`;

        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(request.prompt)
        ];

        // Get the model
        let model = request.model;

        const options: vscode.LanguageModelChatRequestOptions = {
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema
            })),
        };

        try {
            const response = await model.sendRequest(messages, options, token);

            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    stream.markdown(part.value);
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    // Handle tool calls
                    stream.progress(`Calling ${part.name}...`);
                    const toolResult = await vscode.lm.invokeTool(part.name, {
                        input: part.input,
                        toolInvocationToken: request.toolInvocationToken
                    }, token);

                    // Show tool result
                    for (const resultPart of toolResult.content) {
                        if (resultPart instanceof vscode.LanguageModelTextPart) {
                            stream.markdown(`\n\n**User Response:** ${resultPart.value}\n\n`);
                        }
                    }
                }
            }
        } catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                stream.markdown(`Error: ${err.message}`);
            } else {
                throw err;
            }
        }

        return;
    };

    // Register the chat participant
    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    participant.iconPath = new vscode.ThemeIcon('question');

    context.subscriptions.push(participant);
}

export function deactivate() {
}