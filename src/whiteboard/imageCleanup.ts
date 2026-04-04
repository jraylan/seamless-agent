import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../logging';
import { TEMP_IMAGE_DIRECTORY } from './constants';

/**
 * Validates that an interaction ID matches the expected format.
 * Expected format: {type}_{timestamp}_{random} (e.g., "whiteboard_1234567890_abc123")
 *
 * @param interactionId - The interaction ID to validate
 * @returns True if the interaction ID matches the expected pattern
 */
function isValidInteractionId(interactionId: string): boolean {
    // Pattern: lowercase letters/numbers, underscore, numbers, underscore, lowercase letters/numbers
    // Example: whiteboard_1234567890_abc123
    const pattern = /^[a-z][a-z0-9]*_[0-9]+_[a-z0-9]+$/;
    return pattern.test(interactionId);
}

/**
 * Validates that a storage path is safe (no path traversal attempts).
 * Ensures the temp image directory will be safely contained.
 *
 * @param storageRootPath - The storage root path to validate
 * @returns True if the path is safe to use
 */
function isSafeStoragePath(storageRootPath: string): boolean {
    try {
        // Ensure path is absolute (VS Code globalStorageUri should always be absolute)
        if (!path.isAbsolute(storageRootPath)) {
            return false;
        }

        // Reject paths containing parent directory references (before normalization)
        if (storageRootPath.includes('..')) {
            return false;
        }

        // Resolve both paths to canonical form and verify temp dir stays within storage root
        const resolvedStorage = path.resolve(storageRootPath);
        const resolvedTempDir = path.resolve(path.join(storageRootPath, TEMP_IMAGE_DIRECTORY));
        
        // Ensure the temp directory is under the storage root
        if (!resolvedTempDir.startsWith(resolvedStorage + path.sep) && resolvedTempDir !== resolvedStorage) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

/**
 * Cleans up temporary whiteboard images for a specific interaction.
 * Deletes all files in the temp-whiteboard-images directory that start with the interactionId.
 *
 * This is an async function that uses fs.promises to avoid blocking the event loop.
 * It includes comprehensive error handling and continues cleanup even if individual files fail.
 *
 * @param interactionId - The interaction ID whose images should be cleaned up
 * @param storageRootPath - The root storage path (e.g., globalStorageUri.fsPath)
 * @returns Promise that resolves when cleanup is complete
 * @throws Error if interactionId or storageRootPath validation fails
 */
export async function cleanupWhiteboardTempImages(
    interactionId: string,
    storageRootPath: string
): Promise<void> {
    // Validate inputs
    if (!isValidInteractionId(interactionId)) {
        throw new Error(`Invalid interactionId format: ${interactionId}`);
    }

    if (!isSafeStoragePath(storageRootPath)) {
        throw new Error(`Unsafe storage path: ${storageRootPath}`);
    }

    const tempDir = path.join(storageRootPath, TEMP_IMAGE_DIRECTORY);

    try {
        // Attempt to read directory - handles TOCTOU by catching ENOENT
        const files = await fs.readdir(tempDir);
        const prefix = `${interactionId}_`;

        let deletedCount = 0;
        let errorCount = 0;

        // Delete files matching the interactionId prefix
        for (const file of files) {
            if (!file.startsWith(prefix)) {
                continue;
            }

            const filePath = path.join(tempDir, file);

            try {
                await fs.rm(filePath, { force: true });
                deletedCount++;
            } catch (error) {
                errorCount++;
                Logger.error(`Failed to delete temporary whiteboard image: ${filePath}`, error);
                // Continue cleanup for other files
            }
        }

        // Log summary at debug level
        if (deletedCount > 0 || errorCount > 0) {
            Logger.debug(
                `Whiteboard image cleanup for ${interactionId}: ${deletedCount} deleted, ${errorCount} errors`
            );
        }
    } catch (error) {
        // Handle ENOENT (directory doesn't exist) gracefully
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            Logger.debug(`Temp whiteboard directory does not exist: ${tempDir}`);
            return;
        }

        // Re-throw other errors
        throw error;
    }
}
