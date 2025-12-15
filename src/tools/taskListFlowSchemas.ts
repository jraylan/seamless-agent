import { z } from 'zod';
import {
    PendingComment,
    TaskInputSchema,
    TaskItemResult,
    TaskStatus
} from './taskListSchemas';

// ================================
// Input Schemas with Zod Validation
// ================================

export const CreateTaskListInputSchema = z.object({
    title: z.string().min(1, 'Title cannot be empty')
        .describe('Task list title'),
    description: z.string().optional()
        .describe('Optional description (informational)'),
    tasks: z.array(TaskInputSchema).optional()
        .describe('Initial tasks array')
});

export const GetNextTaskInputSchema = z.object({
    listId: z.string().min(1, 'listId cannot be empty')
        .describe('Task list id returned by createTaskList')
});

export const UpdateTaskStatusInputSchema = z.object({
    listId: z.string().min(1, 'listId cannot be empty')
        .describe('Task list id'),
    taskId: z.string().min(1, 'taskId cannot be empty')
        .describe('Task id to update'),
    status: z.enum(['in-progress', 'completed', 'blocked'])
        .describe('New status for the task')
});

export const CloseTaskListInputSchema = z.object({
    listId: z.string().min(1, 'listId cannot be empty')
        .describe('Task list id')
});

export type CreateTaskListInput = z.infer<typeof CreateTaskListInputSchema>;
export type GetNextTaskInput = z.infer<typeof GetNextTaskInputSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;
export type CloseTaskListInput = z.infer<typeof CloseTaskListInputSchema>;

// ================================
// Result Interfaces
// ================================

export interface CreateTaskListResult {
    created: true;
    listId: string;
    title: string;
    totalTasks: number;
}

export interface GetNextTaskResult {
    listId: string;
    closed: boolean;
    done: boolean;
    task: TaskItemResult | null;
    comments: PendingComment[];
}

export interface UpdateTaskStatusResult {
    listId: string;
    taskId: string;
    updated: boolean;
    status: TaskStatus;
    autoClosed: boolean;
}

export interface CloseTaskListResult {
    listId: string;
    closed: boolean;
    summary: {
        total: number;
        completed: number;
        blocked: number;
        inProgress: number;
        pending: number;
    };
    remainingPendingComments: PendingComment[];
}

export interface TaskListFlowErrorResult {
    error: string;
}

// ================================
// Validation Helpers
// ================================

export function parseCreateTaskListInput(input: unknown): CreateTaskListInput {
    return CreateTaskListInputSchema.parse(input);
}

export function parseGetNextTaskInput(input: unknown): GetNextTaskInput {
    return GetNextTaskInputSchema.parse(input);
}

export function parseUpdateTaskStatusInput(input: unknown): UpdateTaskStatusInput {
    return UpdateTaskStatusInputSchema.parse(input);
}

export function parseCloseTaskListInput(input: unknown): CloseTaskListInput {
    return CloseTaskListInputSchema.parse(input);
}
