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
                    true
                ).then(result => {
                    Logger.log('[Debug Mock] askUserMultiStep result:', result);
                }).catch((err: any) => {
                    Logger.error('[Debug Mock] askUserMultiStep error:', err);
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