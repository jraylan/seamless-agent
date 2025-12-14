import * as vscode from 'vscode';

/**
 * Default list of well-known folders to ignore when searching for files.
 * These include build outputs, caches, dependencies, and version control folders.
 */
export const DEFAULT_IGNORED_SOURCE_GLOBS = [
    "**/node_modules/**",
    "**/.venv/**",
    "**/__pycache__/**",

    // Python
    "**/.mypy_cache/**",
    "**/.pytest_cache/**",
    "**/.ruff_cache/**",
    "**/.tox/**",
    "**/.pdm-build/**",

    // JavaScript / TypeScript
    "**/dist/**",
    "**/build/**",
    "**/.turbo/**",
    "**/.parcel-cache/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/.svelte-kit/**",
    "**/.vite/**",
    "**/.yarn/**",
    "**/.pnpm-store/**",

    // Java / Kotlin
    "**/target/**",
    "**/out/**",
    "**/.gradle/**",
    "**/.mvn/**",

    // .NET
    "**/bin/**",
    "**/obj/**",

    // Rust
    "**/target/**",

    // Go
    "**/vendor/**",

    // PHP / Composer
    "**/vendor/**",

    // Ruby
    "**/.bundle/**",
    "**/bundle/**",

    // General tooling
    "**/.git/**",
    "**/.hg/**",
    "**/.svn/**",
    "**/.idea/**",
    "**/.vscode/**",
    "**/.DS_Store/**",
    "**/Thumbs.db/**",
    "**/.cache/**",
    "**/coverage/**",
    "**/tmp/**",
    "**/temp/**"
];

/**
 * Gets the list of ignored paths based on user configuration.
 * 
 * - If `ignoreCommonPaths` is true (default): returns default patterns + user-defined additional patterns
 * - If `ignoreCommonPaths` is false: returns only user-defined additional patterns
 * 
 * @returns Array of glob patterns to exclude when searching for files
 */
export function getIgnoredPaths(): string[] {
    const config = vscode.workspace.getConfiguration('seamless-agent');
    const ignoreCommon = config.get<boolean>('ignoreCommonPaths', true);
    const additional = config.get<string[]>('additionalIgnoredPaths', []);

    if (ignoreCommon) {
        // Combine defaults with additional patterns, removing duplicates
        const combined = new Set([...DEFAULT_IGNORED_SOURCE_GLOBS, ...additional]);
        return Array.from(combined);
    }

    return additional;
}

/**
 * Builds an exclude pattern string for VS Code's findFiles API.
 * Combines multiple glob patterns using the VS Code pattern syntax.
 * 
 * @returns A pattern string suitable for vscode.workspace.findFiles exclude parameter
 */
export function getExcludePattern(): string {
    const patterns = getIgnoredPaths();

    if (patterns.length === 0) {
        return '';
    }

    if (patterns.length === 1) {
        return patterns[0];
    }

    // VS Code's findFiles expects a single pattern or a GlobPattern object
    // For multiple patterns, we use the {pattern1,pattern2,...} syntax
    return `{${patterns.join(',')}}`;
}