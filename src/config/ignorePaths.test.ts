/**
 * Unit Tests for Ignore Paths Configuration
 *
 * Tests DEFAULT_IGNORED_SOURCE_GLOBS, getIgnoredPaths, and getExcludePattern
 * functions that manage file search filtering.
 *
 * Requires the vscode mock (loaded via --require ./test/vscode-mock.cjs).
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    DEFAULT_IGNORED_SOURCE_GLOBS,
    getIgnoredPaths,
    getExcludePattern,
} from './ignorePaths';

const vscode = require('vscode') as any;
const { setConfig, clearConfig } = vscode.__test__;

describe('Ignore Paths Configuration', () => {
    beforeEach(() => {
        clearConfig();
    });

    // ========================
    // DEFAULT_IGNORED_SOURCE_GLOBS
    // ========================
    describe('DEFAULT_IGNORED_SOURCE_GLOBS', () => {
        it('should be a non-empty array', () => {
            assert.ok(Array.isArray(DEFAULT_IGNORED_SOURCE_GLOBS));
            assert.ok(DEFAULT_IGNORED_SOURCE_GLOBS.length > 0);
        });

        it('should include node_modules', () => {
            assert.ok(DEFAULT_IGNORED_SOURCE_GLOBS.some(p => p.includes('node_modules')));
        });

        it('should include .git', () => {
            assert.ok(DEFAULT_IGNORED_SOURCE_GLOBS.some(p => p.includes('.git')));
        });

        it('should include common build output folders', () => {
            const expected = ['dist', 'build', 'out', 'bin', 'target'];
            for (const folder of expected) {
                assert.ok(
                    DEFAULT_IGNORED_SOURCE_GLOBS.some(p => p.includes(folder)),
                    `Expected to find "${folder}" pattern in defaults`
                );
            }
        });

        it('should include Python-specific paths', () => {
            const expected = ['__pycache__', '.venv', '.mypy_cache', '.pytest_cache'];
            for (const folder of expected) {
                assert.ok(
                    DEFAULT_IGNORED_SOURCE_GLOBS.some(p => p.includes(folder)),
                    `Expected to find "${folder}" pattern in defaults`
                );
            }
        });

        it('should include JavaScript framework paths', () => {
            const expected = ['.next', '.nuxt', '.svelte-kit', '.vite'];
            for (const folder of expected) {
                assert.ok(
                    DEFAULT_IGNORED_SOURCE_GLOBS.some(p => p.includes(folder)),
                    `Expected to find "${folder}" pattern in defaults`
                );
            }
        });

        it('should use glob double-star patterns', () => {
            // Most patterns should use ** for recursive matching
            const doubleStarPatterns = DEFAULT_IGNORED_SOURCE_GLOBS.filter(p => p.includes('**'));
            assert.ok(doubleStarPatterns.length > DEFAULT_IGNORED_SOURCE_GLOBS.length / 2);
        });

        it('should not contain duplicate entries', () => {
            const unique = new Set(DEFAULT_IGNORED_SOURCE_GLOBS);
            assert.strictEqual(unique.size, DEFAULT_IGNORED_SOURCE_GLOBS.length);
        });
    });

    // ========================
    // getIgnoredPaths
    // ========================
    describe('getIgnoredPaths', () => {
        it('should return defaults when ignoreCommonPaths is true (default)', () => {
            setConfig('seamless-agent.ignoreCommonPaths', true);
            const paths = getIgnoredPaths();
            assert.ok(paths.length >= DEFAULT_IGNORED_SOURCE_GLOBS.length);
        });

        it('should return only additional paths when ignoreCommonPaths is false', () => {
            setConfig('seamless-agent.ignoreCommonPaths', false);
            setConfig('seamless-agent.additionalIgnoredPaths', ['**/custom/**']);

            const paths = getIgnoredPaths();
            assert.strictEqual(paths.length, 1);
            assert.strictEqual(paths[0], '**/custom/**');
        });

        it('should combine defaults with additional paths', () => {
            setConfig('seamless-agent.ignoreCommonPaths', true);
            setConfig('seamless-agent.additionalIgnoredPaths', ['**/custom/**', '**/my-build/**']);

            const paths = getIgnoredPaths();
            assert.ok(paths.length >= DEFAULT_IGNORED_SOURCE_GLOBS.length + 2);
            assert.ok(paths.includes('**/custom/**'));
            assert.ok(paths.includes('**/my-build/**'));
        });

        it('should deduplicate when additional paths overlap with defaults', () => {
            setConfig('seamless-agent.ignoreCommonPaths', true);
            setConfig('seamless-agent.additionalIgnoredPaths', ['**/node_modules/**']);

            const paths = getIgnoredPaths();
            const nodeModulesCount = paths.filter(p => p === '**/node_modules/**').length;
            assert.strictEqual(nodeModulesCount, 1);
        });

        it('should return empty array when both sources are empty', () => {
            setConfig('seamless-agent.ignoreCommonPaths', false);
            setConfig('seamless-agent.additionalIgnoredPaths', []);

            const paths = getIgnoredPaths();
            assert.strictEqual(paths.length, 0);
        });
    });

    // ========================
    // getExcludePattern
    // ========================
    describe('getExcludePattern', () => {
        it('should return a non-empty string when patterns exist', () => {
            setConfig('seamless-agent.ignoreCommonPaths', true);
            const pattern = getExcludePattern();
            assert.ok(pattern.length > 0);
        });

        it('should return empty string when no patterns exist', () => {
            setConfig('seamless-agent.ignoreCommonPaths', false);
            setConfig('seamless-agent.additionalIgnoredPaths', []);

            const pattern = getExcludePattern();
            assert.strictEqual(pattern, '');
        });

        it('should contain the patterns from getIgnoredPaths', () => {
            setConfig('seamless-agent.ignoreCommonPaths', true);
            const pattern = getExcludePattern();

            // The exclude pattern should contain at least some of the default patterns
            assert.ok(pattern.includes('node_modules'));
        });
    });
});
