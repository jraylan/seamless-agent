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
        .describe('Task list id returned by create_task_list')
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

export const ResumeTaskListInputSchema = z.object({
    listId: z.string().optional()
        .describe('ID of the task list to resume. If not provided and only one list is open, it will be used automatically. Otherwise, the user will be prompted to provide the ID.')
});

export type CreateTaskListInput = z.infer<typeof CreateTaskListInputSchema>;
export type GetNextTaskInput = z.infer<typeof GetNextTaskInputSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;
export type CloseTaskListInput = z.infer<typeof CloseTaskListInputSchema>;
export type ResumeTaskListInput = z.infer<typeof ResumeTaskListInputSchema>;

// ================================
// Result Interfaces
// ================================

/**
 * Breakpoint instruction returned when a task has breakpoint flag
 */
export interface BreakpointInstruction {
    /** Indicates that there is a priority instruction from the user */
    hasPriorityInstruction: true;
    /** Instruction typed by the user */
    instruction: string;
    /** Clear message for the agent */
    agentMessage: string;
}

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
    /** Present when the task has a breakpoint and user provided instructions */
    breakpointInstruction?: BreakpointInstruction;
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

/**
 * Summary of task list progress
 */
export interface TaskListSummary {
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    blocked: number;
}

/**
 * Result for resume_task operation
 */
export interface ResumeTaskListResult {
    /** ID of the resumed list */
    listId: string;
    /** Title of the list */
    title: string;
    /** Whether the list was previously closed */
    wasClosed: boolean;
    /** Current status of tasks */
    summary: TaskListSummary;
    /** Next pending task (if any) */
    nextTask: TaskItemResult | null;
    /** Pending comments for the next task */
    pendingComments: PendingComment[];
    /** Guidance message for the agent */
    agentGuidance: string;
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

export function parseResumeTaskListInput(input: unknown): ResumeTaskListInput {
    return ResumeTaskListInputSchema.parse(input);
}
