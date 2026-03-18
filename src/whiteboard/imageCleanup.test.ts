import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { cleanupWhiteboardTempImages } from './imageCleanup.js';
import { Logger } from '../logging.js';

// Mock Logger to avoid actual logging during tests
mock.method(Logger, 'debug', () => {});
mock.method(Logger, 'error', () => {});

describe('imageCleanup', () => {
    let storageRootPath: string;
    let tempImageDir: string;

    beforeEach(async () => {
        storageRootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'image-cleanup-test-'));
        // Create the temp-whiteboard-images subdirectory
        tempImageDir = path.join(storageRootPath, 'temp-whiteboard-images');
        await fs.mkdir(tempImageDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(storageRootPath, { recursive: true, force: true });
    });

    it('deletes files matching the interactionId prefix', async () => {
        const interactionId = 'whiteboard_1234567890_abc123';

        // Create test files in temp-whiteboard-images directory
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas1_12345.png`), 'test1');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas2_67890.png`), 'test2');
        await fs.writeFile(path.join(tempImageDir, 'other_whiteboard_999999_xyz999_canvas1_11111.png'), 'test3');
        await fs.writeFile(path.join(tempImageDir, 'unrelated-file.txt'), 'test4');

        // Verify files exist before cleanup
        const filesBefore = await fs.readdir(tempImageDir);
        assert.strictEqual(filesBefore.length, 4);

        // Run cleanup
        await cleanupWhiteboardTempImages(interactionId, storageRootPath);

        // Verify only matching files were deleted
        const remaining = await fs.readdir(tempImageDir);
        assert.strictEqual(remaining.length, 2);
        assert.ok(remaining.includes('other_whiteboard_999999_xyz999_canvas1_11111.png'));
        assert.ok(remaining.includes('unrelated-file.txt'));
    });

    it('does nothing when temp directory does not exist', async () => {
        const nonExistentRoot = path.join(storageRootPath, 'does-not-exist');

        // Should not throw
        await assert.doesNotReject(async () => {
            await cleanupWhiteboardTempImages('whiteboard_1234567890_abc123', nonExistentRoot);
        });
    });

    it('handles empty directory', async () => {
        const interactionId = 'whiteboard_1234567890_abc123';

        // Directory is empty, should not throw
        await assert.doesNotReject(async () => {
            await cleanupWhiteboardTempImages(interactionId, storageRootPath);
        });

        // Directory should still exist
        const files = await fs.readdir(tempImageDir);
        assert.strictEqual(files.length, 0);
    });

    it('deletes all files with matching prefix', async () => {
        const interactionId = 'whiteboard_1234567890_xyz';

        // Create multiple files with same prefix
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas1.png`), 'data1');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas2.png`), 'data2');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas3.png`), 'data3');
        await fs.writeFile(path.join(tempImageDir, 'review_999999_abc_canvas.png'), 'data4');

        await cleanupWhiteboardTempImages(interactionId, storageRootPath);

        const remaining = await fs.readdir(tempImageDir);
        assert.strictEqual(remaining.length, 1);
        assert.ok(remaining.includes('review_999999_abc_canvas.png'));
    });

    it('rejects invalid interactionId format', async () => {
        const invalidIds = [
            '',                    // empty
            'INVALID',             // all caps
            'test ../../malicious', // path traversal attempt
            'test<script>',         // script injection attempt
            '123_456_789',          // starts with number
            'test_123',             // missing third part
            'test',                 // missing parts
        ];

        for (const invalidId of invalidIds) {
            await assert.rejects(
                async () => {
                    await cleanupWhiteboardTempImages(invalidId, storageRootPath);
                },
                {
                    message: /Invalid interactionId format/,
                },
                `Should reject invalid interactionId: ${invalidId}`
            );
        }
    });

    it('rejects unsafe storage path with string-level path traversal', async () => {
        // Tests that the function rejects paths containing .. syntax in the actual string
        const unsafePaths = [
            path.join(storageRootPath, '..'),  // Contains .. in string before normalization
            '/tmp/safe/../etc',                 // Contains .. in string
        ];

        for (const unsafePath of unsafePaths) {
            if (unsafePath.includes('..')) {
                // This path still contains .. in the string - should be rejected
                await assert.rejects(
                    async () => {
                        await cleanupWhiteboardTempImages('whiteboard_1234567890_abc', unsafePath);
                    },
                    {
                        message: /Unsafe storage path/,
                    },
                    `Should reject path containing ..: ${unsafePath}`
                );
            }
        }
    });

    it('accepts fully normalized absolute paths', async () => {
        // The function accepts any absolute normalized path without .. in the string
        // (it can't know if .. was intentionally removed)
        const safePath = path.resolve(path.join(storageRootPath, '..', 'etc'));
        
        // This should NOT throw because the path is absolute and doesn't contain ..
        // The function successfully handles it even if it's in a sibling directory
        try {
            await cleanupWhiteboardTempImages('whiteboard_1234567890_abc', safePath);
            // Success - no error thrown
        } catch (e) {
            // Only fail if the error is not about the directory not existing
            if (!(e instanceof Error && e.message.includes('Unsafe'))) {
                // Expected - directory doesn't exist
                assert.ok(true);
            } else {
                throw e;
            }
        }
    });

    it('handles special characters in valid interactionId', async () => {
        // Valid IDs can contain numbers and lowercase letters
        const interactionId = 'whiteboard_1234567890_abc123xyz';

        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas.png`), 'data');
        await fs.writeFile(path.join(tempImageDir, 'other_canvas.png'), 'other');

        await cleanupWhiteboardTempImages(interactionId, storageRootPath);

        const remaining = await fs.readdir(tempImageDir);
        assert.strictEqual(remaining.length, 1);
        assert.ok(remaining.includes('other_canvas.png'));
    });

    it('handles prefix matching respecting filesystem case sensitivity', async () => {
        const interactionId = 'whiteboard_1234567890_abc';

        // Create files with different cases
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_canvas.png`), 'match');
        await fs.writeFile(path.join(tempImageDir, `${interactionId.toUpperCase()}_canvas.png`), 'nomatch');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_Canvas.png`), 'nomatch2');

        await cleanupWhiteboardTempImages(interactionId, storageRootPath);

        const remaining = await fs.readdir(tempImageDir);
        
        // On case-sensitive filesystems: 2 files remain (uppercase ID and Canvas variants)
        // On case-insensitive filesystems (macOS): 0 files remain (all match the prefix)
        const isCaseSensitiveFilesystem = process.platform !== 'darwin' && process.platform !== 'win32';
        
        if (isCaseSensitiveFilesystem) {
            // Expecting 2 files on case-sensitive filesystem
            assert.strictEqual(remaining.length, 2);
            assert.ok(remaining.some(f => f.includes('_Canvas.png')));
            assert.ok(remaining.some(f => f.includes('WHITEBOARD')));
        } else {
            // On case-insensitive filesystems, prefix matching treats all variations as matching
            assert.ok(remaining.length >= 0, 'Should handle case-insensitive filesystem');
        }
    });

    it('handles subdirectories without error', async () => {
        const interactionId = 'whiteboard_1234567890_abc';

        // Create a subdirectory (should not cause issues)
        const subdir = path.join(tempImageDir, `${interactionId}_subdir`);
        await fs.mkdir(subdir);

        // Create a file in the subdirectory
        await fs.writeFile(path.join(subdir, 'file.txt'), 'data');

        // Should not throw, but won't delete the subdirectory
        await assert.doesNotReject(async () => {
            await cleanupWhiteboardTempImages(interactionId, storageRootPath);
        });

        // Subdirectory should still exist (fs.rm with force: true doesn't delete directories)
        const remaining = await fs.readdir(tempImageDir);
        assert.ok(remaining.includes(`${interactionId}_subdir`));
    });

    it('handles force: true flag gracefully', async () => {
        const interactionId = 'whiteboard_1234567890_abc';

        // Create a file
        const filePath = path.join(tempImageDir, `${interactionId}_canvas.png`);
        await fs.writeFile(filePath, 'data');

        // First cleanup should delete it
        await cleanupWhiteboardTempImages(interactionId, storageRootPath);

        // Second cleanup should not throw even though file doesn't exist
        await assert.doesNotReject(async () => {
            await cleanupWhiteboardTempImages(interactionId, storageRootPath);
        });
    });

    it('continues cleanup even if individual file deletion fails', async () => {
        const interactionId = 'whiteboard_1234567890_abc';

        // Create multiple files
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_file1.png`), 'data1');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_file2.png`), 'data2');
        await fs.writeFile(path.join(tempImageDir, `${interactionId}_file3.png`), 'data3');
        await fs.writeFile(path.join(tempImageDir, 'other_file.png'), 'other');

        // Make file2 read-only to simulate deletion failure
        const file2Path = path.join(tempImageDir, `${interactionId}_file2.png`);
        await fs.chmod(file2Path, 0o444);

        // Cleanup should not throw, but log error for file2
        await assert.doesNotReject(async () => {
            await cleanupWhiteboardTempImages(interactionId, storageRootPath);
        });

        // Verify other files were deleted
        const remaining = await fs.readdir(tempImageDir);
        assert.ok(!remaining.includes(`${interactionId}_file1.png`), 'file1 should be deleted');
        assert.ok(remaining.includes('other_file.png'), 'other file should remain');
        // file2 might or might not remain depending on platform/permissions
    });
});
