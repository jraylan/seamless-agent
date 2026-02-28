import { Logger } from '../../logging';
import type { PlanReviewResult } from '../types';
import type { AgentInteractionProvider } from '../webviewProvider';


export class MockToolCallService {

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
                    'Run a realistic multi-step approval flow for a production release. This mock puts long content in `label` fields (the main option text), while `description` stays brief and contextual.',
                    'Debug: Multi-Step Long Text Options',
                    'Debug Agent',
                    undefined,
                    [
                        {
                            title: 'Release Window Selection',
                            options: [
                                {
                                    label: 'Immediate deployment during current business hours with active on-call support, real-time incident monitoring, mandatory stakeholder bridge channel participation, and explicit acknowledgment that the team will own rapid mitigation for any authentication, billing, or API latency regression reported within the first two hours after release',
                                    description: 'Fastest path, high visibility.'
                                },
                                {
                                    label: 'Scheduled deployment in an off-peak traffic window with gradual rollout percentages, automated rollback guardrails tied to service level objectives, and pre-approved checkpoint criteria that must be met before each progressive exposure phase can continue to the next audience segment',
                                    description: 'Best for controlled risk reduction.'
                                },
                                {
                                    label: 'Deferred deployment pending final legal, compliance, and stakeholder communication sign-off, including policy wording review, customer-facing change summary approval, and confirmation that regional notice obligations are fully satisfied before any production toggles are enabled',
                                    description: 'Wait for non-technical approvals.'
                                }
                            ],
                            multiSelect: false,
                        },
                        {
                            title: 'Mandatory Verification Checks',
                            options: [
                                {
                                    label: 'Confirm end-to-end smoke tests across authentication, billing, and critical user workflow completion paths, including negative-path retries, permission-boundary checks, and cross-environment parity validation for each route that historically generated incident tickets during prior releases',
                                    description: 'User journey validation.'
                                },
                                {
                                    label: 'Validate observability baselines including latency percentiles, error rate thresholds, service dependency health, dashboard annotation readiness, and alert-routing integrity so every on-call rotation receives correctly classified signals without missing context during escalation handoff',
                                    description: 'Monitoring readiness check.'
                                },
                                {
                                    label: 'Review migration readiness for schema changes, backward compatibility constraints, rollback script execution timing, lock contention impact windows, and data integrity checkpoints that prove no irreversible state mutation occurs before all verification gates are complete',
                                    description: 'Data safety and rollback check.'
                                },
                                {
                                    label: 'Publish support handoff notes with incident contacts, escalation policy, customer communication templates, and troubleshooting runbooks that include symptom-to-action mapping for known edge cases likely to surface immediately after a phased production rollout',
                                    description: 'Operations handoff readiness.'
                                }
                            ],
                            multiSelect: true,
                        },
                        {
                            title: 'Post-Release Communication Strategy',
                            options: [
                                {
                                    label: 'Send targeted in-product announcement with feature highlights, known limitations, follow-up timeline, support escalation guidance, and clearly scoped statements about what changed now versus what will be delivered in subsequent release waves to avoid expectation mismatch',
                                    description: 'In-product message to active users.'
                                },
                                {
                                    label: 'Distribute external release bulletin to enterprise contacts with service-level impact statement, integration change summary, governance note, and migration recommendations that help technical account managers brief customer operations teams before they encounter behavior changes in production',
                                    description: 'Formal enterprise communication.'
                                },
                                {
                                    label: 'Keep the release silent and monitor telemetry for twenty-four hours before broad communication, while logging anomaly trends, validating customer support ticket volume, and confirming that no high-severity incident patterns emerge that would require coordinated rollback messaging',
                                    description: 'Observe first, announce later.'
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