/**
 * Unit Tests for File Utilities
 *
 * Tests getImageMimeType for correct MIME type detection based on file extension.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getImageMimeType } from './fileUtils';

describe('getImageMimeType', () => {
    // ========================
    // Standard image formats
    // ========================
    describe('standard image formats', () => {
        it('should return image/png for .png files', () => {
            assert.strictEqual(getImageMimeType('/path/to/image.png'), 'image/png');
        });

        it('should return image/jpeg for .jpg files', () => {
            assert.strictEqual(getImageMimeType('/path/to/photo.jpg'), 'image/jpeg');
        });

        it('should return image/jpeg for .jpeg files', () => {
            assert.strictEqual(getImageMimeType('/path/to/photo.jpeg'), 'image/jpeg');
        });

        it('should return image/gif for .gif files', () => {
            assert.strictEqual(getImageMimeType('/path/to/animation.gif'), 'image/gif');
        });

        it('should return image/webp for .webp files', () => {
            assert.strictEqual(getImageMimeType('/path/to/image.webp'), 'image/webp');
        });

        it('should return image/bmp for .bmp files', () => {
            assert.strictEqual(getImageMimeType('/path/to/image.bmp'), 'image/bmp');
        });

        it('should return image/svg+xml for .svg files', () => {
            assert.strictEqual(getImageMimeType('/path/to/icon.svg'), 'image/svg+xml');
        });

        it('should return image/x-icon for .ico files', () => {
            assert.strictEqual(getImageMimeType('/path/to/favicon.ico'), 'image/x-icon');
        });

        it('should return image/tiff for .tiff files', () => {
            assert.strictEqual(getImageMimeType('/path/to/scan.tiff'), 'image/tiff');
        });

        it('should return image/tiff for .tif files', () => {
            assert.strictEqual(getImageMimeType('/path/to/scan.tif'), 'image/tiff');
        });
    });

    // ========================
    // Case insensitivity
    // ========================
    describe('case handling', () => {
        it('should handle uppercase extensions', () => {
            assert.strictEqual(getImageMimeType('/path/to/IMAGE.PNG'), 'image/png');
        });

        it('should handle mixed case extensions', () => {
            assert.strictEqual(getImageMimeType('/path/to/Photo.JpG'), 'image/jpeg');
        });
    });

    // ========================
    // Unknown formats
    // ========================
    describe('unknown formats', () => {
        it('should return application/octet-stream for unknown extension', () => {
            assert.strictEqual(getImageMimeType('/path/to/file.xyz'), 'application/octet-stream');
        });

        it('should return application/octet-stream for no extension', () => {
            assert.strictEqual(getImageMimeType('/path/to/file'), 'application/octet-stream');
        });

        it('should return application/octet-stream for .txt files', () => {
            assert.strictEqual(getImageMimeType('/path/to/readme.txt'), 'application/octet-stream');
        });

        it('should return application/octet-stream for .pdf files', () => {
            assert.strictEqual(getImageMimeType('/path/to/document.pdf'), 'application/octet-stream');
        });
    });

    // ========================
    // Path edge cases
    // ========================
    describe('path edge cases', () => {
        it('should handle paths with multiple dots', () => {
            assert.strictEqual(getImageMimeType('/path/to/file.backup.png'), 'image/png');
        });

        it('should handle Windows-style paths', () => {
            assert.strictEqual(getImageMimeType('C:\\Users\\test\\image.jpg'), 'image/jpeg');
        });

        it('should handle paths with spaces', () => {
            assert.strictEqual(getImageMimeType('/path/to/my image.gif'), 'image/gif');
        });

        it('should handle filename that is just an extension', () => {
            // path.extname('.png') returns '' (dot-only filename), so fallback is expected
            const result = getImageMimeType('.png');
            assert.ok(result === 'image/png' || result === 'application/octet-stream');
        });
    });
});
