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
    TaskListFlowErrorResult,
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
        status: t.status
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
 */
export async function getNextTask(
    params: GetNextTaskInput,
    _context: vscode.ExtensionContext,
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
