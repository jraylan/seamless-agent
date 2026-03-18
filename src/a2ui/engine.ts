import type { A2UIComponent } from './types';

export type A2UIIssueSeverity = 'error' | 'warning' | 'info';
export type A2UIPrinciple = 'clarity' | 'accessibility' | 'error_prevention' | 'action_orientation' | 'progressive_disclosure';
export type A2UILevel = 'basic' | 'strict';

export interface A2UIIssue {
    severity: A2UIIssueSeverity;
    principle: A2UIPrinciple;
    message: string;
    suggestion: string;
    componentId?: string;
}

export interface A2UIReport {
    enabled: true;
    level: A2UILevel;
    score: number;
    issues: A2UIIssue[];
    appliedEnhancements: string[];
}

export interface A2UIProcessingResult {
    components: A2UIComponent[];
    report: A2UIReport;
}

type MutableComponent = {
    id: string;
    parentId?: string;
    component: Record<string, unknown>;
};

const GENERIC_BUTTON_LABELS = new Set(['ok', 'yes', 'no', 'go', 'run', 'click']);
const DESTRUCTIVE_ACTION_PATTERN = /delete|remove|destroy|purge|wipe/i;

function cloneComponents(components: A2UIComponent[]): MutableComponent[] {
    return components.map((entry) => ({
        id: entry.id,
        ...(entry.parentId ? { parentId: entry.parentId } : {}),
        component: { ...entry.component },
    }));
}

function extractProps(component: Record<string, unknown>): Record<string, unknown> {
    const props = component.props;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
        return { ...(props as Record<string, unknown>) };
    }

    const extractedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(component)) {
        if (key === 'type') {
            continue;
        }
        extractedProps[key] = value;
    }
    return extractedProps;
}

function assignProps(component: MutableComponent, props: Record<string, unknown>): void {
    component.component = {
        type: component.component.type,
        props,
    };
}

function pushIssue(issues: A2UIIssue[], severity: A2UIIssueSeverity, principle: A2UIPrinciple, message: string, suggestion: string, componentId?: string): void {
    issues.push({ severity, principle, message, suggestion, ...(componentId ? { componentId } : {}) });
}

function computeScore(issues: A2UIIssue[]): number {
    const penalty = issues.reduce((total, issue) => total + (issue.severity === 'error' ? 0.2 : issue.severity === 'warning' ? 0.1 : 0.04), 0);
    return Math.max(0, Number((1 - penalty).toFixed(2)));
}

export function processA2UIComponents(components: A2UIComponent[], level: A2UILevel): A2UIProcessingResult {
    const mutableComponents = cloneComponents(components);
    const issues: A2UIIssue[] = [];
    const appliedEnhancements: string[] = [];

    let cancelButtonInjected = false;
    const buttonEntries = mutableComponents.filter((entry) => entry.component.type === 'Button');
    const hasInteractiveFields = mutableComponents.some((entry) => entry.component.type === 'TextField' || entry.component.type === 'Select' || entry.component.type === 'Checkbox');
    const rootCount = mutableComponents.filter((entry) => !entry.parentId).length;
    const hasStructuralContainers = mutableComponents.some((entry) => entry.component.type === 'Card' || entry.component.type === 'Divider');

    if (hasInteractiveFields && buttonEntries.length === 0) {
        pushIssue(
            issues,
            'warning',
            'action_orientation',
            'Interactive controls are present without a submit or confirm action.',
            'Add a clear action button so the user knows how to complete the interaction.',
        );
    }

    if (buttonEntries.length > 2 && buttonEntries.every((entry) => {
        const props = extractProps(entry.component);
        return typeof props.variant !== 'string';
    })) {
        pushIssue(
            issues,
            level === 'strict' ? 'warning' : 'info',
            'action_orientation',
            'The surface has several actions but no explicit emphasis hierarchy.',
            'Use variant or layout grouping to distinguish primary, secondary, and destructive actions.',
        );
    }

    if (rootCount > 6 && !hasStructuralContainers) {
        pushIssue(
            issues,
            level === 'strict' ? 'warning' : 'info',
            'progressive_disclosure',
            'The surface exposes many root-level elements without structural grouping.',
            'Group related content into cards or sections so the user can scan the surface progressively.',
        );
    }

    for (const entry of mutableComponents) {
        const type = String(entry.component.type ?? '');
        const props = extractProps(entry.component);
        let mutated = false;

        if (type === 'Button') {
            const label = String(props.label ?? '').trim();
            const action = String(props.action ?? entry.id);
            const variant = String(props.variant ?? '');
            const isDestructive = variant === 'danger' || DESTRUCTIVE_ACTION_PATTERN.test(label) || DESTRUCTIVE_ACTION_PATTERN.test(action);

            if (label.length > 0 && (label.length < 4 || GENERIC_BUTTON_LABELS.has(label.toLowerCase()))) {
                pushIssue(
                    issues,
                    level === 'strict' ? 'warning' : 'info',
                    'clarity',
                    `Button \"${label}\" is underspecified.`,
                    'Use a more descriptive button label so the action is obvious without extra context.',
                    entry.id,
                );
            }

            if (typeof props.ariaLabel !== 'string' || props.ariaLabel.trim().length === 0) {
                props.ariaLabel = label || action;
                mutated = true;
                appliedEnhancements.push(`Added ariaLabel to button ${entry.id}.`);
                pushIssue(
                    issues,
                    'info',
                    'accessibility',
                    'Button is missing ariaLabel metadata.',
                    'Provide ariaLabel for actionable controls.',
                    entry.id,
                );
            }

            if (isDestructive && !cancelButtonInjected) {
                const siblingCancel = mutableComponents.some((candidate) => {
                    if (candidate.component.type !== 'Button') {
                        return false;
                    }
                    if (candidate.parentId !== entry.parentId) {
                        return false;
                    }
                    const candidateProps = extractProps(candidate.component);
                    const candidateLabel = String(candidateProps.label ?? '').toLowerCase();
                    return candidateLabel.includes('cancel') || candidateLabel.includes('back');
                });

                if (!siblingCancel) {
                    mutableComponents.push({
                        id: `auto_cancel_${entry.id}`,
                        ...(entry.parentId ? { parentId: entry.parentId } : {}),
                        component: {
                            type: 'Button',
                            props: {
                                label: 'Cancel',
                                action: `cancel_${entry.id}`,
                                variant: 'secondary',
                                ariaLabel: 'Cancel and return without applying the destructive action',
                            },
                        },
                    });
                    cancelButtonInjected = true;
                    appliedEnhancements.push(`Injected cancel safeguard next to destructive button ${entry.id}.`);
                    pushIssue(
                        issues,
                        'warning',
                        'error_prevention',
                        'Destructive action did not include a cancel alternative.',
                        'Pair destructive buttons with an adjacent cancel or safe alternative.',
                        entry.id,
                    );
                }
            }
        }

        if (type === 'TextField' || type === 'Select' || type === 'Checkbox') {
            const label = String(props.label ?? '').trim();

            if (label.length === 0) {
                pushIssue(
                    issues,
                    level === 'strict' ? 'warning' : 'info',
                    'clarity',
                    `${type} is missing a visible label.`,
                    'Provide a concise label so the control is understandable in isolation.',
                    entry.id,
                );
            }

            if (typeof props.ariaLabel !== 'string' || props.ariaLabel.trim().length === 0) {
                props.ariaLabel = label || entry.id;
                mutated = true;
                appliedEnhancements.push(`Added ariaLabel to ${type} ${entry.id}.`);
            }

            if (level === 'strict' && props.required === true && typeof props.helperText !== 'string') {
                props.helperText = 'Required field';
                mutated = true;
                appliedEnhancements.push(`Added helper text to required ${type} ${entry.id}.`);
                pushIssue(
                    issues,
                    'info',
                    'error_prevention',
                    `${type} is required but does not explain that state.`,
                    'Add helper text for required inputs so the user understands what is expected.',
                    entry.id,
                );
            }
        }

        if (type === 'Image') {
            const alt = String(props.alt ?? '').trim();
            if (!alt) {
                pushIssue(
                    issues,
                    level === 'strict' ? 'warning' : 'info',
                    'accessibility',
                    'Image is missing alt text.',
                    'Provide alt text so non-visual users understand the image purpose.',
                    entry.id,
                );
            }
        }

        if (mutated) {
            assignProps(entry, props);
        }
    }

    return {
        components: mutableComponents,
        report: {
            enabled: true,
            level,
            score: computeScore(issues),
            issues,
            appliedEnhancements,
        },
    };
}