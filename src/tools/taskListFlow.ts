import * as vscode from 'vscode';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { TaskListPanel } from '../webview/taskListPanel';
import { getTaskListStorage } from './taskList';
import {
    CloseTaskListInput,
    CloseTaskListResult,
    CreateTaskListInput,
    CreateTaskListResult,
    GetNextTaskInput,
    GetNextTaskResult,
    ResumeTaskListInput,
    ResumeTaskListResult,
    TaskListFlowErrorResult,
    TaskListSummary,
    UpdateTaskStatusInput,
    UpdateTaskStatusResult
} from './taskListFlowSchemas';

function toTaskResult(storage: ReturnType<typeof getTaskListStorage>, task: any) {
    return storage.tasksToResult([task])[0];
}

/**
 * createTaskList
 * New flow: create -> getNextTask -> updateTaskStatus -> ... -> closeTaskList
 */
export async function createTaskList(
    params: CreateTaskListInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<CreateTaskListResult | TaskListFlowErrorResult> {
    const storage = getTaskListStorage();

    if (!params.title) {
        return { error: 'Title is required' };
    }

    const initialTasks = params.tasks?.map(t => ({
        title: t.title,
        description: t.description,
        status: t.status,
        breakpoint: t.breakpoint
    }));

    const session = storage.createSession(params.title, initialTasks);

    // Refresh the webview to show the new task list
    provider.refreshHome();

    // Open panel (async)
    TaskListPanel.open(context.extensionUri, session.id, storage);

    return {
        created: true,
        listId: session.id,
        title: session.title,
        totalTasks: session.tasks.length
    };
}

/**
 * getNextTask
 * Returns the next pending task along with ANY pending user comments for that task.
 * Comments are marked as sent once returned.
 * 
 * If the task has a breakpoint flag:
 * - Opens an input in the webview for user instructions
 * - Waits for user to submit instructions
 * - Returns the instructions in breakpointInstruction field
 */
export async function getNextTask(
    params: GetNextTaskInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<GetNextTaskResult | TaskListFlowErrorResult> {
    const storage = getTaskListStorage();

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}` };
    }

    if (session.closed) {
        return {
            listId: session.id,
            closed: true,
            done: true,
            task: null,
            comments: []
        };
    }

    const next = storage.getNextPendingTask(params.listId);
    if (!next) {
        return {
            listId: session.id,
            closed: false,
            done: true,
            task: null,
            comments: []
        };
    }

    const comments = storage.getPendingCommentsForTaskAndMarkSent(params.listId, next.id);

    // Comment status changes should reflect in UI
    provider.refreshHome();
    TaskListPanel.updateIfOpen(params.listId);

    // Check if task has breakpoint
    if (next.breakpoint) {
        // Request breakpoint input from user through the panel
        TaskListPanel.requestBreakpointInput(params.listId, next.id, next.title);

        try {
            // Wait for user to submit input
            const instruction = await storage.waitForBreakpointInput(params.listId, next.id);

            return {
                listId: session.id,
                closed: false,
                done: false,
                task: toTaskResult(storage, next),
                comments,
                breakpointInstruction: {
                    hasPriorityInstruction: true,
                    instruction,
                    agentMessage: `⚠️ PRIORITY INSTRUCTION: The user has provided the following instruction that MUST be executed BEFORE continuing with this task "${next.title}". Follow the user's instruction first, then proceed with the task.`
                }
            };
        } catch {
            // User cancelled or panel was closed
            return {
                listId: session.id,
                closed: false,
                done: false,
                task: toTaskResult(storage, next),
                comments
            };
        }
    }

    return {
        listId: session.id,
        closed: false,
        done: false,
        task: toTaskResult(storage, next),
        comments
    };
}

/**
 * updateTaskStatus
 * Updates the status and (optionally) returns the next task + its pending comments.
 */
export async function updateTaskStatus(
    params: UpdateTaskStatusInput,
    _context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<UpdateTaskStatusResult | TaskListFlowErrorResult> {
    const storage = getTaskListStorage();

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}` };
    }

    if (session.closed) {
        return { error: `List is closed: ${params.listId}` };
    }

    const result = storage.updateTask(params.listId, params.taskId, { status: params.status });

    if (!result.updated) {
        return { error: `Task not found: ${params.taskId}` };
    }

    // Refresh webview
    provider.refreshHome();

    // Update panel (or close if auto-completed)
    if (result.autoCompleted) {
        TaskListPanel.closeIfOpen(params.listId);
    } else {
        TaskListPanel.updateIfOpen(params.listId);
    }

    return {
        listId: params.listId,
        taskId: params.taskId,
        updated: true,
        status: params.status,
        autoClosed: result.autoCompleted
    };
}

/**
 * closeTaskList
 * Archives a list and returns a summary (and any remaining pending comments).
 */
export async function closeTaskList(
    params: CloseTaskListInput,
    _context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<CloseTaskListResult | TaskListFlowErrorResult> {
    const storage = getTaskListStorage();

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}` };
    }

    const remainingPendingComments = storage.getAllPendingCommentsAndMarkSent(params.listId);

    const closed = storage.closeSession(params.listId);

    provider.refreshHome();
    TaskListPanel.closeIfOpen(params.listId);

    const updatedSession = storage.getSession(params.listId);
    const tasks = updatedSession?.tasks || session.tasks;

    const summary = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        pending: tasks.filter(t => t.status === 'pending').length
    };

    return {
        listId: params.listId,
        closed,
        summary,
        remainingPendingComments
    };
}

/**
 * Helper function to calculate task list summary
 */
function calculateSummary(tasks: Array<{ status: string }>): TaskListSummary {
    return {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        pending: tasks.filter(t => t.status === 'pending').length
    };
}

/**
 * resumeTaskList
 * Resume an existing task list by ID.
 * If no ID is provided:
 * - If only one open list exists, it's automatically selected
 * - Otherwise, prompts the user to provide the ID through the webview
 */
export async function resumeTaskList(
    params: ResumeTaskListInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<ResumeTaskListResult | TaskListFlowErrorResult> {
    const storage = getTaskListStorage();

    let listId = params.listId;

    // If no listId provided, try to infer or ask user
    if (!listId) {
        const openSessions = storage.getOpenSessions();

        if (openSessions.length === 0) {
            return { error: 'No open task lists found. Create a new task list with create_task_list.' };
        }

        if (openSessions.length === 1) {
            // Auto-select the only open list
            listId = openSessions[0].id;
        } else {
            // Multiple lists open - need to ask user
            try {
                listId = await provider.requestResumeTaskListId(
                    openSessions.map(s => ({ id: s.id, title: s.title }))
                );
            } catch {
                return { error: 'User cancelled the operation or no list ID was provided.' };
            }
        }
    }

    const session = storage.getSession(listId);
    if (!session) {
        return { error: `Task list not found: ${listId}` };
    }

    const wasClosed = session.closed;

    // If the list was closed, reopen it
    if (session.closed) {
        session.closed = false;
        session.lastActivity = Date.now();
        // Note: we need to save the session - storage.updateSession would be ideal
        // For now, using the existing pattern
    }

    // Get next pending task
    const nextTask = storage.getNextPendingTask(listId);

    // Get pending comments for the next task
    const pendingComments = nextTask
        ? storage.getPendingCommentsForTaskAndMarkSent(listId, nextTask.id)
        : [];

    const summary = calculateSummary(session.tasks);

    // Refresh UI
    provider.refreshHome();

    // Open the task list panel
    TaskListPanel.open(context.extensionUri, listId, storage);

    // Build guidance message for the agent
    let agentGuidance = `Task list "${session.title}" resumed successfully. `;

    if (wasClosed) {
        agentGuidance += 'Note: This list was previously closed and has been reopened. ';
    }

    if (nextTask) {
        agentGuidance += `Next task: "${nextTask.title}" (${nextTask.status}). `;
        if (pendingComments.length > 0) {
            agentGuidance += `There are ${pendingComments.length} pending comment(s) for this task. `;
        }
    } else if (summary.pending === 0 && summary.inProgress === 0) {
        agentGuidance += 'All tasks are completed or blocked. Consider closing the list with close_task_list. ';
    }

    agentGuidance += `Progress: ${summary.completed}/${summary.total} tasks completed.`;

    return {
        listId: session.id,
        title: session.title,
        wasClosed,
        summary,
        nextTask: nextTask ? toTaskResult(storage, nextTask) : null,
        pendingComments,
        agentGuidance
    };
}
