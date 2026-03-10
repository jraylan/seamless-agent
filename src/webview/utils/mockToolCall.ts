import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../logging';
import type { PlanReviewResult } from '../types';
import type { AgentInteractionProvider } from '../webviewProvider';


export class MockToolCallService {

    private static loadWhiteboardDebugPayload(webviewProvider: AgentInteractionProvider, fileName: string): any {
        const filePath = path.join(webviewProvider.getContext().extensionUri.fsPath, 'resources', 'debug', 'whiteboard', fileName);
        Logger.log('[Debug Mock] loading whiteboard payload:', filePath);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    private static async openDebugWhiteboard(
        webviewProvider: AgentInteractionProvider,
        tokenSource: vscode.CancellationTokenSource,
        payload: any,
        label: string,
    ): Promise<void> {
        const { openWhiteboard } = await import('../../tools/openWhiteboard');
        Logger.log('[Debug Mock] opening whiteboard payload:', {
            label,
            title: payload?.title,
            canvasCount: Array.isArray(payload?.initialCanvases) ? payload.initialCanvases.length : 0,
            elementCounts: Array.isArray(payload?.initialCanvases)
                ? payload.initialCanvases.map((canvas: any) => Array.isArray(canvas?.seedElements) ? canvas.seedElements.length : 0)
                : [],
        });

        return openWhiteboard(
            payload,
            webviewProvider.getContext(),
            webviewProvider,
            tokenSource.token,
            { isDebug: true }
        ).then(result => {
            Logger.log(`[Debug Mock] ${label} result:`, result);
        }).catch((err: any) => {
            Logger.error(`[Debug Mock] ${label} error:`, err);
        }).finally(() => {
            tokenSource.dispose();
        });
    }

    public static async mockToolCall(mockType: string, webviewProvider: AgentInteractionProvider): Promise<void> {
        const storage = webviewProvider.getChatHistoryStorage();

        switch (mockType) {
            case 'askUser':
                webviewProvider.waitForUserResponse(
                    'This is a **mock plain question** for debugging.\n\nDo you approve the deployment to production?',
                    'Debug: Plain Question',
                    'Debug Agent',
                    undefined,
                    undefined,
                    false,
                    true
                ).then(result => {
                    Logger.log('[Debug Mock] askUser result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] askUser error:', err);
                });
                break;

            case 'askUserOptions':
                webviewProvider.waitForUserResponse(
                    'Which framework do you prefer for this project?',
                    'Debug: Options Question',
                    'Debug Agent',
                    undefined,
                    [
                        { label: 'React', description: 'Popular UI library by Meta' },
                        { label: 'Vue', description: 'Progressive framework by Evan You' },
                        { label: 'Angular', description: 'Full-featured framework by Google' },
                        { label: 'Svelte', description: 'Compile-time framework' },
                    ],
                    true,
                    true
                ).then(result => {
                    Logger.log('[Debug Mock] askUserOptions result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] askUserOptions error:', err);
                });
                break;

            case 'askUserMultiStep':
                webviewProvider.waitForUserResponse(
                    'Configure your project settings step by step.',
                    'Debug: Multi-Step Question',
                    'Debug Agent',
                    undefined,
                    [
                        {
                            title: 'Language',
                            options: ['TypeScript', 'JavaScript', 'Python', 'Go'],
                            multiSelect: false,
                        },
                        {
                            title: 'Features',
                            options: [
                                { label: 'Linting', description: 'ESLint / Pylint' },
                                { label: 'Testing', description: 'Jest / Pytest / Go test' },
                                { label: 'CI/CD', description: 'GitHub Actions' },
                                { label: 'Docker', description: 'Container support' },
                            ],
                            multiSelect: true,
                        },
                        {
                            title: 'Deploy Target',
                            options: ['AWS', 'Azure', 'GCP', 'Vercel', 'Self-hosted'],
                            multiSelect: false,
                        },
                    ],
                    false,
                    true
                ).then(result => {
                    Logger.log('[Debug Mock] askUserMultiStep result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] askUserMultiStep error:', err);
                });
                break;

            case 'askUserMultiStepLongText':
                webviewProvider.waitForUserResponse(
                    'Run a realistic multi-step approval flow for a production release. This mock puts long content in `description` fields (primary option text), while `label` stays brief and contextual.',
                    'Debug: Multi-Step Long Text Options',
                    'Debug Agent',
                    undefined,
                    [
                        {
                            title: 'Release Window Selection',
                            options: [
                                {
                                    label: 'Immediate deployment',
                                    description: 'Deploy during current business hours with active on-call support, real-time incident monitoring, mandatory stakeholder bridge channel participation, and explicit acknowledgment that the team will own rapid mitigation for any authentication, billing, or API latency regression reported within the first two hours after release.'
                                },
                                {
                                    label: 'Scheduled deployment',
                                    description: 'Deploy in an off-peak traffic window with gradual rollout percentages, automated rollback guardrails tied to service level objectives, and pre-approved checkpoint criteria that must be met before each progressive exposure phase can continue to the next audience segment.'
                                },
                                {
                                    label: 'Deferred deployment',
                                    description: 'Delay release pending final legal, compliance, and stakeholder communication sign-off, including policy wording review, customer-facing change summary approval, and confirmation that regional notice obligations are fully satisfied before any production toggles are enabled.'
                                }
                            ],
                            multiSelect: false,
                        },
                        {
                            title: 'Mandatory Verification Checks',
                            options: [
                                {
                                    label: 'Smoke test coverage',
                                    description: 'Confirm end-to-end smoke tests across authentication, billing, and critical user workflow completion paths, including negative-path retries, permission-boundary checks, and cross-environment parity validation for each route that historically generated incident tickets during prior releases.'
                                },
                                {
                                    label: 'Observability baselines',
                                    description: 'Validate observability baselines including latency percentiles, error rate thresholds, service dependency health, dashboard annotation readiness, and alert-routing integrity so every on-call rotation receives correctly classified signals without missing context during escalation handoff.'
                                },
                                {
                                    label: 'Migration readiness',
                                    description: 'Review migration readiness for schema changes, backward compatibility constraints, rollback script execution timing, lock contention impact windows, and data integrity checkpoints that prove no irreversible state mutation occurs before all verification gates are complete.'
                                },
                                {
                                    label: 'Support handoff notes',
                                    description: 'Publish support handoff notes with incident contacts, escalation policy, customer communication templates, and troubleshooting runbooks that include symptom-to-action mapping for known edge cases likely to surface immediately after a phased production rollout.'
                                }
                            ],
                            multiSelect: true,
                        },
                        {
                            title: 'Post-Release Communication Strategy',
                            options: [
                                {
                                    label: 'In-product announcement',
                                    description: 'Send targeted in-product announcement with feature highlights, known limitations, follow-up timeline, support escalation guidance, and clearly scoped statements about what changed now versus what will be delivered in subsequent release waves to avoid expectation mismatch.'
                                },
                                {
                                    label: 'Enterprise bulletin',
                                    description: 'Distribute external release bulletin to enterprise contacts with service-level impact statement, integration change summary, governance note, and migration recommendations that help technical account managers brief customer operations teams before they encounter behavior changes in production.'
                                },
                                {
                                    label: 'Silent observation window',
                                    description: 'Keep the release silent and monitor telemetry for twenty-four hours before broad communication, while logging anomaly trends, validating customer support ticket volume, and confirming that no high-severity incident patterns emerge that would require coordinated rollback messaging.'
                                }
                            ],
                            multiSelect: false,
                        },
                    ],
                    false,
                    true
                ).then(result => {
                    Logger.log('[Debug Mock] askUserMultiStepLongText result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] askUserMultiStepLongText error:', err);
                });
                break;

            case 'planReview': {
                const mockPlan = `# Deployment Plan\n\n## Phase 1: Preparation\n- Review code changes\n- Run full test suite\n- Update documentation\n\n## Phase 2: Staging\n- Deploy to staging environment\n- Run integration tests\n- Performance benchmarking\n\n## Phase 3: Production\n- Blue-green deployment\n- Health check monitoring\n- Rollback plan ready\n\n## Timeline\n| Phase | Duration |\n|-------|----------|\n| Prep | 2 hours |\n| Staging | 4 hours |\n| Production | 1 hour |`;

                const planId = storage.savePlanReviewInteraction({
                    plan: mockPlan,
                    title: 'Debug: Plan Review',
                    mode: 'review',
                    status: 'pending',
                    requiredRevisions: [],
                    isDebug: true,
                });
                webviewProvider.switchTab('pending');

                const { PlanReviewPanel } = await import('../planReviewPanel');
                PlanReviewPanel.showWithOptions(webviewProvider.getContext().extensionUri, {
                    plan: mockPlan,
                    title: 'Debug: Plan Review',
                    mode: 'review',
                    readOnly: false,
                    existingComments: [],
                    interactionId: planId,
                }).then((result: PlanReviewResult) => {
                    const state = ['approved', 'recreateWithChanges', 'acknowledged'].includes(result.action)
                        ? result.action : 'closed';
                    storage.updateInteraction(planId, {
                        status: state,
                        requiredRevisions: result.requiredRevisions,
                    });
                    webviewProvider.switchTab('pending');
                    Logger.log('[Debug Mock] planReview result:', result);
                }).catch((err: any) => {
                    storage.updateInteraction(planId, { status: 'closed' });
                    webviewProvider.switchTab('pending');
                    Logger.error('[Debug Mock] planReview error:', err);
                });
                break;
            }

            case 'whiteboard': {
                const tokenSource = new vscode.CancellationTokenSource();
                void this.openDebugWhiteboard(
                    webviewProvider,
                    tokenSource,
                    {
                        title: 'Debug: Whiteboard',
                        context: 'Sketch something on the canvas — for example, a system diagram with boxes for API, Database, and Client connected by arrows. When done, click Submit to return the drawing as an image.',
                    },
                    'whiteboard',
                );
                break;
            }

            case 'whiteboardTest1': {
                const tokenSource = new vscode.CancellationTokenSource();
                const payload = this.loadWhiteboardDebugPayload(webviewProvider, 'test-1.json');
                void this.openDebugWhiteboard(webviewProvider, tokenSource, payload, 'whiteboardTest1');
                break;
            }

            case 'whiteboardTest2': {
                const tokenSource = new vscode.CancellationTokenSource();
                const payload = this.loadWhiteboardDebugPayload(webviewProvider, 'test-2.json');
                void this.openDebugWhiteboard(webviewProvider, tokenSource, payload, 'whiteboardTest2');
                break;
            }

            case 'renderUI': {
                const { renderUI } = await import('../../tools/renderUI');
                const tokenSource = new vscode.CancellationTokenSource();
                Logger.log('[Debug Mock] opening renderUI info panel');
                void renderUI(
                    {
                        surfaceId: 'debug-render-ui-info',
                        title: 'Debug: Render UI - Release Dashboard',
                        enableA2UI: true,
                        a2uiLevel: 'strict',
                        dataModel: {
                            releaseName: 'Spring Cutover',
                            owner: 'Platform Team',
                            progress: 72,
                            status: 'Ready for review',
                        },
                        components: [
                            { id: 'col1', component: { type: 'Column' } },
                            { id: 'h1', parentId: 'col1', component: { type: 'Heading', props: { text: '$data.releaseName', level: 2 } } },
                            { id: 'desc', parentId: 'col1', component: { type: 'Markdown', props: { content: 'This panel demonstrates **data binding**, badges, progress, markdown, and diagram source blocks inside `render_ui`.' } } },
                            { id: 'row1', parentId: 'col1', component: { type: 'Row' } },
                            { id: 'badge1', parentId: 'row1', component: { type: 'Badge', props: { label: 'Owner: $data.owner' } } },
                            { id: 'badge2', parentId: 'row1', component: { type: 'Badge', props: { label: '$data.status' } } },
                            { id: 'prog', parentId: 'col1', component: { type: 'ProgressBar', props: { label: 'Rollout Progress', value: '$data.progress', max: 100 } } },
                            { id: 'dangerRow', parentId: 'col1', component: { type: 'Row' } },
                            { id: 'deleteRelease', parentId: 'dangerRow', component: { type: 'Button', props: { label: 'Delete', action: 'delete_release', variant: 'danger' } } },
                            { id: 'div2', parentId: 'col1', component: { type: 'Divider' } },
                            { id: 'md', parentId: 'col1', component: { type: 'Markdown', props: { content: '## Checklist\n- Review migration notes\n- Confirm rollback owner\n- Publish support bulletin' } } },
                            { id: 'diagram', parentId: 'col1', component: { type: 'MermaidDiagram', props: { label: 'Rollout Flow', content: 'flowchart LR\n  Plan --> Review\n  Review --> Deploy\n  Deploy --> Monitor' } } },
                        ],
                        waitForAction: false,
                    },
                    webviewProvider.getContext(),
                    webviewProvider,
                    tokenSource.token,
                ).then(result => {
                    Logger.log('[Debug Mock] renderUI info result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] renderUI info error:', err);
                }).finally(() => {
                    tokenSource.dispose();
                });
                break;
            }

            case 'renderUIForm': {
                const { renderUI: renderUIFormFn } = await import('../../tools/renderUI');
                const tokenSource = new vscode.CancellationTokenSource();
                Logger.log('[Debug Mock] opening renderUI form panel');
                void renderUIFormFn(
                    {
                        surfaceId: 'debug-render-ui-form',
                        title: 'Debug: Render UI - Approval Form',
                        enableA2UI: true,
                        components: [
                            { id: 'col1', component: { type: 'Column' } },
                            { id: 'h1', parentId: 'col1', component: { type: 'Heading', props: { text: 'Demo Approval Form', level: 2 } } },
                            { id: 'desc', parentId: 'col1', component: { type: 'Markdown', props: { content: 'This panel demonstrates labeled form controls, object-valued select options, and returned `userAction.data`.' } } },
                            { id: 'card1', parentId: 'col1', component: { type: 'Card' } },
                            { id: 'name', parentId: 'card1', component: { type: 'TextField', props: { label: 'Approver Name', placeholder: 'Enter your name', required: true } } },
                            { id: 'env', parentId: 'card1', component: { type: 'Select', props: { label: 'Deployment Target', placeholder: 'Choose an environment', required: true, options: [{ label: 'Staging', value: 'staging' }, { label: 'Production', value: 'production' }, { label: 'Rollback Drill', value: 'rollback' }] } } },
                            { id: 'agree', parentId: 'card1', component: { type: 'Checkbox', props: { label: 'I verified the rollback checklist' } } },
                            { id: 'submit', parentId: 'card1', component: { type: 'Button', props: { label: 'Submit Review', action: 'submit_form' } } },
                        ],
                        waitForAction: true,
                    },
                    webviewProvider.getContext(),
                    webviewProvider,
                    tokenSource.token,
                ).then(result => {
                    Logger.log('[Debug Mock] renderUI form result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] renderUI form error:', err);
                }).finally(() => {
                    tokenSource.dispose();
                });
                break;
            }

            case 'renderUIMarkdown': {
                const { renderUI: renderUIMarkdownFn } = await import('../../tools/renderUI');
                const tokenSource = new vscode.CancellationTokenSource();
                Logger.log('[Debug Mock] opening renderUI markdown panel');
                void renderUIMarkdownFn(
                    {
                        surfaceId: 'debug-render-ui-markdown',
                        title: 'Debug: Render UI - Content Showcase',
                        enableA2UI: true,
                        components: [
                            { id: 'col1', component: { type: 'Column' } },
                            { id: 'h1', parentId: 'col1', component: { type: 'Heading', props: { text: 'Markdown Showcase', level: 1 } } },
                            { id: 'md1', parentId: 'col1', component: { type: 'Markdown', props: { content: '## Overview\n\nThis panel renders **Markdown** as formatted HTML and keeps `CodeBlock` and `MermaidDiagram` available for technical content.' } } },
                            { id: 'code1', parentId: 'col1', component: { type: 'CodeBlock', props: { content: 'const result = await renderUI({\n  components,\n  waitForAction: true,\n});', language: 'typescript' } } },
                            { id: 'div1', parentId: 'col1', component: { type: 'Divider' } },
                            { id: 'diagram', parentId: 'col1', component: { type: 'MermaidDiagram', props: { label: 'Incident Escalation Flow', content: 'flowchart TD\n  UserReport --> Triage\n  Triage --> Fix\n  Fix --> Verify' } } },
                            { id: 'md2', parentId: 'col1', component: { type: 'Markdown', props: { content: '> **Tip:** Use `Markdown` for rich formatted text, `CodeBlock` for code, and `MermaidDiagram` for source-controlled diagrams.' } } },
                            { id: 'dismiss', parentId: 'col1', component: { type: 'Button', props: { label: 'Dismiss', action: 'dismiss' } } },
                        ],
                        waitForAction: true,
                    },
                    webviewProvider.getContext(),
                    webviewProvider,
                    tokenSource.token,
                ).then(result => {
                    Logger.log('[Debug Mock] renderUI markdown result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] renderUI markdown error:', err);
                }).finally(() => {
                    tokenSource.dispose();
                });
                break;
            }

            case 'walkthroughReview': {
                const mockWalkthrough = `# Getting Started Guide\n\n## Step 1: Install Dependencies\n\`\`\`bash\nnpm install\n\`\`\`\n\n## Step 2: Configure Environment\nCreate a \`.env\` file:\n\`\`\`\nDATABASE_URL=postgresql://localhost:5432/mydb\nAPI_KEY=your-api-key\n\`\`\`\n\n## Step 3: Run Migrations\n\`\`\`bash\nnpm run db:migrate\n\`\`\`\n\n## Step 4: Start Development Server\n\`\`\`bash\nnpm run dev\n\`\`\`\n\nVisit http://localhost:3000 to see the app running.`;

                const walkthroughId = storage.savePlanReviewInteraction({
                    plan: mockWalkthrough,
                    title: 'Debug: Walkthrough',
                    mode: 'walkthrough',
                    status: 'pending',
                    requiredRevisions: [],
                    isDebug: true,
                });
                webviewProvider.switchTab('pending');

                const { PlanReviewPanel: WalkthroughPanel } = await import('../planReviewPanel');
                WalkthroughPanel.showWithOptions(webviewProvider.getContext().extensionUri, {
                    plan: mockWalkthrough,
                    title: 'Debug: Walkthrough',
                    mode: 'walkthrough',
                    readOnly: false,
                    existingComments: [],
                    interactionId: walkthroughId,
                }).then((result: PlanReviewResult) => {
                    const state = ['approved', 'recreateWithChanges', 'acknowledged'].includes(result.action)
                        ? result.action : 'closed';
                    storage.updateInteraction(walkthroughId, {
                        status: state,
                        requiredRevisions: result.requiredRevisions,
                    });
                    webviewProvider.switchTab('pending');
                    Logger.log('[Debug Mock] walkthroughReview result:', result);
                }).catch((err: any) => {
                    storage.updateInteraction(walkthroughId, { status: 'closed' });
                    webviewProvider.switchTab('pending');
                    Logger.error('[Debug Mock] walkthroughReview error:', err);
                });
                break;
            }
        }
    }
}
