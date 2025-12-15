import * as vscode from 'vscode';
import {
    TaskListSession,
    TaskItem,
    TaskComment,
    TaskStatus,
    PendingComment,
    TaskItemResult,
    generateId
} from '../tools/taskListSchemas';

/**
 * Storage keys for task list global state
 */
const STORAGE_KEYS = {
    TASKLISTS: 'seamless-agent.taskLists',
};

/**
 * Manages persistence of task list sessions
 * Uses VS Code's globalState for cross-session persistence
 */
export class TaskListStorage {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ========================
    // Session Methods
    // ========================

    /**
     * Get all task list sessions
     */
    getAllSessions(): TaskListSession[] {
        return this.context.globalState.get<TaskListSession[]>(STORAGE_KEYS.TASKLISTS, []);
    }

    /**
     * Get a specific session by ID
     */
    getSession(listId: string): TaskListSession | undefined {
        const sessions = this.getAllSessions();
        return sessions.find(s => s.id === listId);
    }

    /**
     * Create a new task list session
     */
    createSession(title: string, initialTasks?: Array<{ title: string; description?: string; status?: TaskStatus }>): TaskListSession {
        const listId = generateId('list');
        const now = Date.now();

        const tasks: TaskItem[] = (initialTasks || []).map((t, index) => ({
            id: generateId('task'),
            title: t.title,
            description: t.description,
            status: t.status || 'pending',
            createdAt: now + index, // Ensure unique timestamps
            comments: []
        }));

        const session: TaskListSession = {
            id: listId,
            title,
            tasks,
            createdAt: now,
            lastActivity: now,
            closed: false
        };

        this.saveSession(session);
        return session;
    }

    /**
     * Add a task to an existing session
     */
    addTask(listId: string, task: { title: string; description?: string; status?: TaskStatus }): TaskItem | null {
        const session = this.getSession(listId);
        if (!session || session.closed) {
            return null;
        }

        const newTask: TaskItem = {
            id: generateId('task'),
            title: task.title,
            description: task.description,
            status: task.status || 'pending',
            createdAt: Date.now(),
            comments: []
        };

        session.tasks.push(newTask);
        session.lastActivity = Date.now();
        this.saveSession(session);

        return newTask;
    }

    /**
     * Update a task in a session
     * Returns { updated: boolean; autoCompleted: boolean } indicating if the list was auto-completed
     */
    updateTask(
        listId: string,
        taskId: string,
        updates: { title?: string; description?: string; status?: TaskStatus }
    ): { updated: boolean; autoCompleted: boolean } {
        const session = this.getSession(listId);
        if (!session || session.closed) {
            return { updated: false, autoCompleted: false };
        }

        const task = session.tasks.find(t => t.id === taskId);
        if (!task) {
            return { updated: false, autoCompleted: false };
        }

        if (updates.title !== undefined) {
            task.title = updates.title;
        }
        if (updates.description !== undefined) {
            task.description = updates.description;
        }
        if (updates.status !== undefined) {
            task.status = updates.status;
        }
        task.updatedAt = Date.now();
        session.lastActivity = Date.now();

        // Check if all tasks are completed - auto-close the list
        const allCompleted = session.tasks.length > 0 &&
            session.tasks.every(t => t.status === 'completed');

        if (allCompleted) {
            session.closed = true;
        }

        this.saveSession(session);
        return { updated: true, autoCompleted: allCompleted };
    }

    /**
     * Close a session
     */
    closeSession(listId: string): boolean {
        const session = this.getSession(listId);
        if (!session) {
            return false;
        }

        session.closed = true;
        session.lastActivity = Date.now();
        this.saveSession(session);
        return true;
    }

    // ========================
    // Comment Methods
    // ========================

    /**
     * Get the next pending task in a session.
     * Prioritizes tasks that were reopened (i.e., have at least one comment with reopened=true).
     */
    getNextPendingTask(listId: string): TaskItem | null {
        const session = this.getSession(listId);
        if (!session || session.closed) {
            return null;
        }

        // First: any pending task that has reopened intent
        for (const task of session.tasks) {
            if (task.status !== 'pending') continue;
            if (task.comments?.some(c => c.reopened)) {
                return task;
            }
        }

        // Fallback: first pending task
        const next = session.tasks.find(t => t.status === 'pending');
        return next || null;
    }

    /**
     * Add a comment to a task
     */
    addComment(listId: string, taskId: string, revisedPart: string, revisorInstructions: string, reopened: boolean = false): TaskComment | null {
        const session = this.getSession(listId);
        if (!session) {
            return null;
        }

        const task = session.tasks.find(t => t.id === taskId);
        if (!task) {
            return null;
        }

        const comment: TaskComment = {
            id: generateId('comment'),
            taskId,
            revisedPart,
            revisorInstructions,
            status: 'pending',
            reopened,
            createdAt: Date.now()
        };

        task.comments.push(comment);

        // If user requested to reopen the task, change its status back to pending
        if (reopened && task.status === 'completed') {
            task.status = 'pending';
            task.updatedAt = Date.now();
        }

        session.lastActivity = Date.now();
        this.saveSession(session);

        return comment;
    }

    /**
     * Get pending comments for a specific task and mark them as sent.
     * Unlike getPendingCommentsAndMarkSent(), this works even when the task is still pending.
     * This enables the "getNextTask" flow where the agent receives feedback BEFORE execution.
     */
    getPendingCommentsForTaskAndMarkSent(listId: string, taskId: string): PendingComment[] {
        const session = this.getSession(listId);
        if (!session) {
            return [];
        }

        const task = session.tasks.find(t => t.id === taskId);
        if (!task) {
            return [];
        }

        const pendingComments: PendingComment[] = [];
        const now = Date.now();

        for (const comment of task.comments || []) {
            if (comment.status !== 'pending') continue;

            pendingComments.push({
                commentId: comment.id,
                taskId: comment.taskId,
                taskTitle: task.title,
                revisedPart: comment.revisedPart,
                revisorInstructions: comment.revisorInstructions,
                reopened: comment.reopened
            });

            comment.status = 'sent';
            comment.sentAt = now;
        }

        if (pendingComments.length > 0) {
            session.lastActivity = now;
            this.saveSession(session);
        }

        return pendingComments;
    }

    /**
     * Get ALL pending comments in a session (across all tasks) and mark them as sent.
     * Useful for closeTaskList() so no feedback is lost.
     */
    getAllPendingCommentsAndMarkSent(listId: string): PendingComment[] {
        const session = this.getSession(listId);
        if (!session) {
            return [];
        }

        const pendingComments: PendingComment[] = [];
        const now = Date.now();

        for (const task of session.tasks) {
            for (const comment of task.comments || []) {
                if (comment.status !== 'pending') continue;

                pendingComments.push({
                    commentId: comment.id,
                    taskId: comment.taskId,
                    taskTitle: task.title,
                    revisedPart: comment.revisedPart,
                    revisorInstructions: comment.revisorInstructions,
                    reopened: comment.reopened
                });

                comment.status = 'sent';
                comment.sentAt = now;
            }
        }

        if (pendingComments.length > 0) {
            session.lastActivity = now;
            this.saveSession(session);
        }

        return pendingComments;
    }

    /**
     * Remove a comment from a task
     */
    removeComment(listId: string, taskId: string, commentId: string): boolean {
        const session = this.getSession(listId);
        if (!session) {
            return false;
        }

        const task = session.tasks.find(t => t.id === taskId);
        if (!task) {
            return false;
        }

        const commentIndex = task.comments.findIndex(c => c.id === commentId);
        if (commentIndex === -1) {
            return false;
        }

        task.comments.splice(commentIndex, 1);
        session.lastActivity = Date.now();
        this.saveSession(session);

        return true;
    }

    /**
     * Get all pending comments for a session and mark them as sent
     * This is the core of the async comment system - comments are only returned once
     * 
     * IMPORTANT: Only returns comments for tasks that the agent has reached or passed:
     * - Tasks with status 'in-progress' or 'completed' - agent has reached/passed this task
     * - Tasks with status 'pending' - agent hasn't started this task yet, DON'T return comments
     * - Tasks with status 'blocked' - treated same as pending, comments not returned yet
     */
    getPendingCommentsAndMarkSent(listId: string): PendingComment[] {
        const session = this.getSession(listId);
        if (!session) {
            return [];
        }

        const pendingComments: PendingComment[] = [];
        const now = Date.now();

        for (const task of session.tasks) {
            // Only process comments for tasks the agent has reached or passed
            // Skip tasks that are still pending (agent hasn't started them yet)
            // Note: 'blocked' means the agent HAS reached the task but hit a blocker,
            // so comments should be returned for blocked tasks
            if (task.status === 'pending') {
                continue;
            }

            for (const comment of task.comments) {
                if (comment.status === 'pending') {
                    // Add to result
                    pendingComments.push({
                        commentId: comment.id,
                        taskId: comment.taskId,
                        taskTitle: task.title,
                        revisedPart: comment.revisedPart,
                        revisorInstructions: comment.revisorInstructions,
                        reopened: comment.reopened
                    });

                    // Mark as sent
                    comment.status = 'sent';
                    comment.sentAt = now;
                }
            }
        }

        if (pendingComments.length > 0) {
            session.lastActivity = now;
            this.saveSession(session);
        }

        return pendingComments;
    }

    /**
     * Get all final comments (pending ones) when closing a session
     * Marks all pending comments as sent
     */
    getFinalComments(listId: string): PendingComment[] {
        return this.getPendingCommentsAndMarkSent(listId);
    }

    // ========================
    // Helper Methods
    // ========================

    /**
     * Convert tasks to result format (without internal fields)
     */
    tasksToResult(tasks: TaskItem[]): TaskItemResult[] {
        return tasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status
        }));
    }

    /**
     * Save a session to storage
     */
    private saveSession(session: TaskListSession): void {
        const sessions = this.getAllSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);

        if (existingIndex >= 0) {
            sessions[existingIndex] = session;
        } else {
            sessions.push(session);
        }

        this.context.globalState.update(STORAGE_KEYS.TASKLISTS, sessions);
    }

    /**
     * Delete a session
     */
    deleteSession(listId: string): boolean {
        const sessions = this.getAllSessions();
        const index = sessions.findIndex(s => s.id === listId);

        if (index === -1) {
            return false;
        }

        sessions.splice(index, 1);
        this.context.globalState.update(STORAGE_KEYS.TASKLISTS, sessions);
        return true;
    }

    /**
     * Clear all sessions (for testing/reset)
     */
    clearAllSessions(): void {
        this.context.globalState.update(STORAGE_KEYS.TASKLISTS, []);
    }
}
