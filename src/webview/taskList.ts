// Task List Webview Script - VS Code Walkthrough Style

import type { TaskComment, TaskItem, TaskListPanelToWebviewMessage as ToWebviewMessage, TaskListPanelFromWebviewMessage as FromWebviewMessage } from './types';

// Acquire VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: FromWebviewMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
};

// Webview initialization
(function () {
    const vscode = acquireVsCodeApi();

    const STRINGS = ((window as unknown as { __STRINGS__?: Record<string, string> }).__STRINGS__) ?? {};
    const formatTemplate = (template: string, args: Array<string | number>): string => {
        return template.replace(/\{(\d+)\}/g, (_match, idx) => {
            const i = Number(idx);
            const val = args[i];
            return val === undefined ? '' : String(val);
        });
    };
    const t = (key: string, fallback: string, ...args: Array<string | number>): string => {
        const raw = STRINGS[key] ?? fallback;
        return args.length ? formatTemplate(raw, args) : raw;
    };

    // State
    let tasks: TaskItem[] = [];
    let listId = '';
    let isClosed = false;
    let currentTaskId = '';
    const expandedComments: Set<string> = new Set();

    // DOM Elements
    const listTitle = document.getElementById('list-title') as HTMLHeadingElement;
    const listDescription = document.getElementById('list-description') as HTMLParagraphElement;
    const closedBanner = document.getElementById('closed-banner') as HTMLDivElement;
    const tasksContainer = document.getElementById('tasks-container') as HTMLDivElement;
    const commentDialog = document.getElementById('comment-dialog') as HTMLDivElement;
    const taskPreview = document.getElementById('task-preview') as HTMLDivElement;
    const commentInput = document.getElementById('comment-input') as HTMLTextAreaElement;
    const reopenCheckbox = document.getElementById('reopen-checkbox') as HTMLInputElement;
    const dialogSave = document.getElementById('dialog-save') as HTMLButtonElement;
    const dialogCancel = document.getElementById('dialog-cancel') as HTMLButtonElement;
    const dialogClose = document.getElementById('dialog-close') as HTMLButtonElement;

    function getProgressText(): string {
        const completed = tasks.filter(x => x.status === 'completed').length;
        const total = tasks.length;
        return t('tasksCompleted', `${completed} of ${total} tasks completed`, completed, total);
    }

    function renderTasks(): void {
        if (listDescription) {
            listDescription.textContent = getProgressText();
        }

        if (tasks.length === 0) {
            tasksContainer.innerHTML = `
                <div class="empty-state">
                    <span class="codicon codicon-tasklist"></span>
                    <p>${escapeHtml(t('noTasks', 'No tasks yet'))}</p>
                </div>
            `;
            return;
        }

        tasksContainer.innerHTML = tasks.map(task => renderTaskStep(task)).join('');

        // Bind click events for task steps
        document.querySelectorAll('.task-step').forEach(step => {
            step.addEventListener('click', (e) => {
                // Don't trigger if clicking on a button
                if ((e.target as HTMLElement).closest('button')) return;

                const taskId = (step as HTMLElement).dataset.taskId;
                if (taskId && !isClosed) {
                    openCommentDialog(taskId);
                }
            });
        });

        // Bind click events for comment buttons
        document.querySelectorAll('.task-comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = (e.currentTarget as HTMLElement).dataset.taskId;
                if (taskId && !isClosed) {
                    openCommentDialog(taskId);
                }
            });
        });

        // Bind toggle comments events
        document.querySelectorAll('.comments-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = (e.currentTarget as HTMLElement).dataset.taskId;
                if (!taskId) return;

                if (expandedComments.has(taskId)) {
                    expandedComments.delete(taskId);
                } else {
                    expandedComments.add(taskId);
                }
                renderTasks();
            });
        });

        // Bind remove comment events
        document.querySelectorAll('.remove-comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = (e.currentTarget as HTMLElement).dataset.taskId;
                const commentId = (e.currentTarget as HTMLElement).dataset.commentId;
                if (taskId && commentId) {
                    removeComment(taskId, commentId);
                }
            });
        });
    }

    function renderTaskStep(task: TaskItem): string {
        const isCompleted = task.status === 'completed';
        const isInProgress = task.status === 'in-progress';
        const isBlocked = task.status === 'blocked';

        // Checkbox icon based on status
        let checkboxContent = '';
        if (isCompleted) {
            checkboxContent = '<span class="codicon codicon-check"></span>';
        } else if (isBlocked) {
            checkboxContent = '<span class="codicon codicon-error"></span>';
        }

        // Comments section
        let commentsHtml = '';
        if (task.comments.length > 0) {
            const isExpanded = expandedComments.has(task.id);
            const commentsLabel = t('comments', 'Comments ({0})', task.comments.length);

            commentsHtml = `
                <div class="task-comments">
                    <button class="comments-toggle" data-task-id="${task.id}" type="button">
                        <span class="codicon codicon-${isExpanded ? 'chevron-down' : 'chevron-right'}"></span>
                        ${escapeHtml(commentsLabel)}
                    </button>
                    ${isExpanded ? `
                        <div class="comments-list">
                            ${task.comments.map(comment => renderComment(task.id, comment)).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Add comment button (only for non-closed lists)
        const addCommentLabel = t('addComment', 'Add Comment');
        const addCommentBtn = !isClosed
            ? `
                <button
                    class="task-comment-btn"
                    data-task-id="${task.id}"
                    type="button"
                    title="${escapeHtml(addCommentLabel)}"
                    aria-label="${escapeHtml(addCommentLabel)}"
                >
                    <span class="codicon codicon-comment"></span>
                </button>
            `
            : '';

        return `
            <div class="task-step ${isCompleted ? 'completed' : ''} ${isInProgress ? 'in-progress' : ''} ${isBlocked ? 'blocked' : ''}" data-task-id="${task.id}">
                <div class="task-checkbox ${task.status}">
                    ${checkboxContent}
                </div>
                <div class="task-content">
                    <div class="task-title-row">
                        <p class="task-title">${escapeHtml(task.title)}</p>
                        ${addCommentBtn}
                    </div>
                    ${task.description && !isCompleted ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
                    ${commentsHtml}
                </div>
            </div>
        `;
    }

    function renderComment(taskId: string, comment: TaskComment): string {
        const statusClass = comment.status;
        const statusText = comment.status === 'sent' ? t('sent', 'Sent') : t('pending', 'Pending');
        const removeLabel = t('removeComment', 'Remove comment');

        const removeBtn = `
            <button
                class="btn-icon remove-comment-btn"
                data-task-id="${taskId}"
                data-comment-id="${comment.id}"
                title="${escapeHtml(removeLabel)}"
                aria-label="${escapeHtml(removeLabel)}"
                type="button"
            >
                <span class="codicon codicon-close"></span>
            </button>
        `;

        return `
            <div class="comment-item ${statusClass}">
                <div class="comment-content">
                    <div class="comment-instructions">${escapeHtml(comment.revisorInstructions)}</div>
                    <div class="comment-meta">
                        <span class="comment-status ${statusClass}">${statusText}</span>
                        ${removeBtn}
                    </div>
                </div>
            </div>
        `;
    }

    function openCommentDialog(taskId: string): void {
        const task = tasks.find(x => x.id === taskId);
        if (!task) return;

        currentTaskId = taskId;
        taskPreview.textContent = task.title;
        commentInput.value = '';
        reopenCheckbox.checked = false;

        // Show reopen checkbox only for completed tasks
        const checkboxContainer = reopenCheckbox.closest('.dialog-checkbox') as HTMLElement;
        if (checkboxContainer) {
            checkboxContainer.style.display = task.status === 'completed' ? 'block' : 'none';
        }

        commentDialog.classList.remove('hidden');
        commentInput.focus();
    }

    function closeCommentDialog(): void {
        commentDialog.classList.add('hidden');
        currentTaskId = '';
        commentInput.value = '';
        reopenCheckbox.checked = false;
    }

    function saveComment(): void {
        if (!currentTaskId) return;

        const revisorInstructions = commentInput.value.trim();
        if (!revisorInstructions) {
            commentInput.focus();
            return;
        }

        const task = tasks.find(x => x.id === currentTaskId);
        if (!task) return;

        // Use task description if available, otherwise use title
        const revisedPart = task.description || task.title;
        const reopened = reopenCheckbox.checked;

        vscode.postMessage({
            type: 'addComment',
            taskId: currentTaskId,
            revisedPart,
            revisorInstructions,
            reopened
        });

        // Expand comments for this task
        expandedComments.add(currentTaskId);
        closeCommentDialog();
    }

    function removeComment(taskId: string, commentId: string): void {
        vscode.postMessage({
            type: 'removeComment',
            taskId,
            commentId
        });
    }

    function escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function handleMessage(event: MessageEvent<ToWebviewMessage>): void {
        const message = event.data;

        switch (message.type) {
            case 'showTaskList':
                listId = message.listId;
                listTitle.textContent = message.title;
                tasks = message.tasks;
                isClosed = message.closed;

                if (isClosed && closedBanner) {
                    closedBanner.classList.remove('hidden');
                } else if (closedBanner) {
                    closedBanner.classList.add('hidden');
                }

                renderTasks();
                break;

            case 'updateTasks':
                tasks = message.tasks;
                renderTasks();
                break;

            case 'listClosed':
                isClosed = true;
                if (closedBanner) {
                    closedBanner.classList.remove('hidden');
                }
                renderTasks();
                break;
        }
    }

    // Event listeners
    dialogSave?.addEventListener('click', saveComment);
    dialogCancel?.addEventListener('click', closeCommentDialog);
    dialogClose?.addEventListener('click', closeCommentDialog);

    // Keyboard shortcuts
    commentDialog?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCommentDialog();
        } else if (e.key === 'Enter' && e.ctrlKey) {
            saveComment();
        }
    });

    // Listen for messages from extension
    window.addEventListener('message', handleMessage);
})();