import { z } from 'zod';

// ================================
// Task List Interfaces
// ================================

/**
 * Comment status - tracks whether the comment has been sent to the LLM
 */
export type TaskCommentStatus = 'pending' | 'sent';

/**
 * User comment on a task
 */
export interface TaskComment {
    id: string;
    taskId: string;
    revisedPart: string;
    revisorInstructions: string;
    status: TaskCommentStatus;
    reopened: boolean;
    createdAt: number;
    sentAt?: number;
}

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';

/**
 * A single task item in the list
 */
export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    createdAt: number;
    updatedAt?: number;
    comments: TaskComment[];
}

/**
 * A task list session
 */
export interface TaskListSession {
    id: string;
    title: string;
    tasks: TaskItem[];
    createdAt: number;
    lastActivity: number;
    closed: boolean;
}

// ================================
// Input Schemas with Zod Validation
// ================================

/**
 * Task input for create operation
 */
export const TaskInputSchema = z.object({
    title: z.string().min(1, 'Task title cannot be empty'),
    description: z.string().optional(),
    status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).optional().default('pending')
});

/**
 * Schema for Task List input
 */
export const TaskListInputSchema = z.object({
    operation: z.enum(['create', 'add', 'update', 'read', 'close'])
        .describe('The operation to perform on the task list'),
    listId: z.string()
        .optional()
        .describe('REQUIRED for all operations except "create". The list ID received from the create operation.'),
    title: z.string()
        .optional()
        .describe('List title (required for "create" operation). Task title update (optional for "update" operation).'),
    description: z.string()
        .optional()
        .describe('Task description (optional for "add" and "update" operations).'),
    tasks: z.array(TaskInputSchema)
        .optional()
        .describe('Initial tasks array (optional for "create" operation).'),
    task: TaskInputSchema
        .optional()
        .describe('Task to add (required for "add" operation).'),
    taskId: z.string()
        .optional()
        .describe('Task ID to update (required for "update" operation).'),
    status: z.enum(['pending', 'in-progress', 'completed', 'blocked'])
        .optional()
        .describe('New task status (optional for "update" operation).')
});

export type TaskListInput = z.infer<typeof TaskListInputSchema>;
export type TaskInput = z.infer<typeof TaskInputSchema>;

// ================================
// Result Interfaces
// ================================

/**
 * Pending comment returned to the LLM (without sent status, simplified)
 */
export interface PendingComment {
    commentId: string;
    taskId: string;
    taskTitle: string;
    revisedPart: string;
    revisorInstructions: string;
    reopened: boolean;
}

/**
 * Task as returned to the LLM
 */
export interface TaskItemResult {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
}

/**
 * Result for create operation
 */
export interface TaskListCreateResult {
    operation: 'create';
    listId: string;
    tasks: TaskItemResult[];
    pendingComments: PendingComment[];
}

/**
 * Result for add operation
 */
export interface TaskListAddResult {
    operation: 'add';
    taskId: string;
    pendingComments: PendingComment[];
}

/**
 * Result for update operation
 */
export interface TaskListUpdateResult {
    operation: 'update';
    updated: boolean;
    autoCompleted?: boolean;
    pendingComments: PendingComment[];
}

/**
 * Result for read operation
 */
export interface TaskListReadResult {
    operation: 'read';
    listId: string;
    title: string;
    tasks: TaskItemResult[];
    pendingComments: PendingComment[];
}

/**
 * Result for close operation
 */
export interface TaskListCloseResult {
    operation: 'close';
    closed: boolean;
    finalComments: PendingComment[];
}

/**
 * Union of all possible results
 */
export type TaskListToolResult =
    | TaskListCreateResult
    | TaskListAddResult
    | TaskListUpdateResult
    | TaskListReadResult
    | TaskListCloseResult;

/**
 * Error result
 */
export interface TaskListErrorResult {
    error: string;
    operation: string;
}

// ================================
// Validation Helpers
// ================================

/**
 * Validates and parses Task List input, throwing on validation errors
 */
export function parseTaskListInput(input: unknown): TaskListInput {
    return TaskListInputSchema.parse(input);
}

/**
 * Validates input and returns result or error message
 */
export function safeParseTaskListInput(
    input: unknown
): { success: true; data: TaskListInput } | { success: false; error: string } {
    const result = TaskListInputSchema.safeParse(input);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errorMessages = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { success: false, error: errorMessages };
}

/**
 * Generate a unique ID for tasks and lists
 */
export function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
