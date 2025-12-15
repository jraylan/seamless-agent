import * as vscode from 'vscode';
import { TaskListStorage } from '../storage/taskListStorage';
import { AgentInteractionProvider } from '../webview/webviewProvider';
import { TaskListPanel } from '../webview/taskListPanel';
import {
    TaskListInput,
    TaskListToolResult,
    TaskListErrorResult,
    TaskListCreateResult,
    TaskListAddResult,
    TaskListUpdateResult,
    TaskListReadResult,
    TaskListCloseResult,
    parseTaskListInput
} from './taskListSchemas';

// Singleton storage instance
let taskListStorage: TaskListStorage | null = null;
let extensionUri: vscode.Uri | null = null;

/**
 * Initialize the task list storage
 */
export function initializeTaskListStorage(context: vscode.ExtensionContext): void {
    taskListStorage = new TaskListStorage(context);
    extensionUri = context.extensionUri;
}

/**
 * Get the task list storage instance
 */
export function getTaskListStorage(): TaskListStorage {
    if (!taskListStorage) {
        throw new Error('TaskListStorage not initialized. Call initializeTaskListStorage first.');
    }
    return taskListStorage;
}

/**
 * Core logic for task list operations
 * This is non-blocking - returns immediately after processing each operation
 */
export async function taskList(
    params: TaskListInput,
    context: vscode.ExtensionContext,
    provider: AgentInteractionProvider
): Promise<TaskListToolResult | TaskListErrorResult> {
    const storage = getTaskListStorage();
    const operation = params.operation;

    try {
        switch (operation) {
            case 'create':
                return handleCreate(storage, params, provider);

            case 'add':
                return handleAdd(storage, params, provider);

            case 'update':
                return handleUpdate(storage, params, provider);

            case 'read':
                return handleRead(storage, params, provider);

            case 'close':
                return handleClose(storage, params, provider);

            default:
                return {
                    error: `Unknown operation: ${operation}`,
                    operation: operation as string
                };
        }
    } catch (error) {
        console.error('[Seamless Agent] taskList error:', error);
        return {
            error: error instanceof Error ? error.message : 'Unknown error',
            operation
        };
    }
}

/**
 * Handle 'create' operation - create a new task list
 */
function handleCreate(
    storage: TaskListStorage,
    params: TaskListInput,
    provider: AgentInteractionProvider
): TaskListCreateResult | TaskListErrorResult {
    if (!params.title) {
        return { error: 'Title is required for create operation', operation: 'create' };
    }

    // Convert tasks input to the format expected by storage
    const initialTasks = params.tasks?.map(t => ({
        title: t.title,
        description: t.description,
        status: t.status
    }));

    const session = storage.createSession(params.title, initialTasks);

    console.log('[Seamless Agent] taskList created:', session.id);

    // Refresh the webview to show the new task list
    provider.refreshHome();

    // Open the task list panel (async, don't wait)
    openTaskListPanel(session.id, provider);

    return {
        operation: 'create',
        listId: session.id,
        tasks: storage.tasksToResult(session.tasks),
        pendingComments: [] // No comments on new list
    };
}

/**
 * Handle 'add' operation - add a task to existing list
 */
function handleAdd(
    storage: TaskListStorage,
    params: TaskListInput,
    provider: AgentInteractionProvider
): TaskListAddResult | TaskListErrorResult {
    if (!params.listId) {
        return { error: 'listId is required for add operation', operation: 'add' };
    }

    if (!params.task) {
        return { error: 'task is required for add operation', operation: 'add' };
    }

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}`, operation: 'add' };
    }

    if (session.closed) {
        return { error: `List is closed: ${params.listId}`, operation: 'add' };
    }

    const newTask = storage.addTask(params.listId, {
        title: params.task.title,
        description: params.task.description,
        status: params.task.status
    });

    if (!newTask) {
        return { error: 'Failed to add task', operation: 'add' };
    }

    console.log('[Seamless Agent] taskList added task:', newTask.id);

    // Refresh webview
    provider.refreshHome();

    // Update panel if open
    updateTaskListPanel(params.listId, provider);

    // Get pending comments and mark as sent
    const pendingComments = storage.getPendingCommentsAndMarkSent(params.listId);

    return {
        operation: 'add',
        taskId: newTask.id,
        pendingComments
    };
}

/**
 * Handle 'update' operation - update a task
 */
function handleUpdate(
    storage: TaskListStorage,
    params: TaskListInput,
    provider: AgentInteractionProvider
): TaskListUpdateResult | TaskListErrorResult {
    if (!params.listId) {
        return { error: 'listId is required for update operation', operation: 'update' };
    }

    if (!params.taskId) {
        return { error: 'taskId is required for update operation', operation: 'update' };
    }

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}`, operation: 'update' };
    }

    if (session.closed) {
        return { error: `List is closed: ${params.listId}`, operation: 'update' };
    }

    const updates: { title?: string; description?: string; status?: 'pending' | 'in-progress' | 'completed' | 'blocked' } = {};

    if (params.title !== undefined) {
        updates.title = params.title;
    }
    if (params.description !== undefined) {
        updates.description = params.description;
    }
    if (params.status !== undefined) {
        updates.status = params.status;
    }

    const result = storage.updateTask(params.listId, params.taskId, updates);

    if (!result.updated) {
        return { error: `Task not found: ${params.taskId}`, operation: 'update' };
    }

    console.log('[Seamless Agent] taskList updated task:', params.taskId, 'autoCompleted:', result.autoCompleted);

    // Refresh webview
    provider.refreshHome();

    // Update panel if open (close if auto-completed)
    if (result.autoCompleted) {
        closeTaskListPanel(params.listId);
    } else {
        updateTaskListPanel(params.listId, provider);
    }

    // Get pending comments and mark as sent
    const pendingComments = storage.getPendingCommentsAndMarkSent(params.listId);

    return {
        operation: 'update',
        updated: true,
        autoCompleted: result.autoCompleted,
        pendingComments
    };
}

/**
 * Handle 'read' operation - read current state
 */
function handleRead(
    storage: TaskListStorage,
    params: TaskListInput,
    provider: AgentInteractionProvider
): TaskListReadResult | TaskListErrorResult {
    if (!params.listId) {
        return { error: 'listId is required for read operation', operation: 'read' };
    }

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}`, operation: 'read' };
    }

    console.log('[Seamless Agent] taskList read:', params.listId);

    // Get pending comments and mark as sent
    const pendingComments = storage.getPendingCommentsAndMarkSent(params.listId);

    return {
        operation: 'read',
        listId: session.id,
        title: session.title,
        tasks: storage.tasksToResult(session.tasks),
        pendingComments
    };
}

/**
 * Handle 'close' operation - close/archive a list
 */
function handleClose(
    storage: TaskListStorage,
    params: TaskListInput,
    provider: AgentInteractionProvider
): TaskListCloseResult | TaskListErrorResult {
    if (!params.listId) {
        return { error: 'listId is required for close operation', operation: 'close' };
    }

    const session = storage.getSession(params.listId);
    if (!session) {
        return { error: `List not found: ${params.listId}`, operation: 'close' };
    }

    // Get final comments before closing
    const finalComments = storage.getFinalComments(params.listId);

    // Close the session
    const closed = storage.closeSession(params.listId);

    console.log('[Seamless Agent] taskList closed:', params.listId);

    // Refresh webview
    provider.refreshHome();

    // Close panel if open
    closeTaskListPanel(params.listId);

    return {
        operation: 'close',
        closed,
        finalComments
    };
}

// ========================
// Panel Management
// ========================

/**
 * Open the task list panel for a session
 */
function openTaskListPanel(listId: string, provider: AgentInteractionProvider): void {
    if (!extensionUri || !taskListStorage) {
        console.warn('[Seamless Agent] Cannot open panel - extension not initialized');
        return;
    }

    TaskListPanel.open(extensionUri, listId, taskListStorage);
}

/**
 * Update the task list panel if it's open
 */
function updateTaskListPanel(listId: string, provider: AgentInteractionProvider): void {
    TaskListPanel.updateIfOpen(listId);
}

/**
 * Close the task list panel if it's open
 */
function closeTaskListPanel(listId: string): void {
    TaskListPanel.closeIfOpen(listId);
}
