/**
 * Unit Tests for Image Magic Number Validation
 *
 * Tests the validateImageMagicNumber function that prevents MIME type spoofing
 * by validating file content against expected magic number signatures.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateImageMagicNumber } from './imageValidation';

// Helper to create Uint8Array from byte values
function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

// Helper to pad bytes to minimum 8 length
function padded(...values: number[]): Uint8Array {
    const arr = new Uint8Array(Math.max(values.length, 8));
    for (let i = 0; i < values.length; i++) {
        arr[i] = values[i];
    }
    return arr;
}

describe('validateImageMagicNumber', () => {
    // ========================
    // Buffer size validation
    // ========================
    describe('buffer size validation', () => {
        it('should reject buffers smaller than 8 bytes', () => {
            const result = validateImageMagicNumber(bytes(0x89, 0x50, 0x4E), 'image/png');
            assert.strictEqual(result, false);
        });

        it('should reject empty buffer', () => {
            const result = validateImageMagicNumber(new Uint8Array(0), 'image/png');
            assert.strictEqual(result, false);
        });
    });

    // ========================
    // PNG validation
    // ========================
    describe('PNG', () => {
        it('should validate correct PNG magic number', () => {
            const png = padded(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            assert.strictEqual(validateImageMagicNumber(png, 'image/png'), true);
        });

        it('should reject invalid PNG header', () => {
            const notPng = padded(0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(notPng, 'image/png'), false);
        });

        it('should reject JPEG data with PNG MIME type', () => {
            const jpeg = padded(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(jpeg, 'image/png'), false);
        });
    });

    // ========================
    // JPEG validation
    // ========================
    describe('JPEG', () => {
        it('should validate JPEG with JFIF marker', () => {
            const jpeg = padded(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46);
            assert.strictEqual(validateImageMagicNumber(jpeg, 'image/jpeg'), true);
        });

        it('should validate JPEG with EXIF marker', () => {
            const jpeg = padded(0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(jpeg, 'image/jpeg'), true);
        });

        it('should reject non-JPEG data claiming to be JPEG', () => {
            const png = padded(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            assert.strictEqual(validateImageMagicNumber(png, 'image/jpeg'), false);
        });
    });

    // ========================
    // GIF validation
    // ========================
    describe('GIF', () => {
        it('should validate GIF89a', () => {
            // G I F 8 9 a
            const gif89a = padded(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(gif89a, 'image/gif'), true);
        });

        it('should validate GIF87a', () => {
            // G I F 8 7 a
            const gif87a = padded(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(gif87a, 'image/gif'), true);
        });

        it('should reject invalid GIF header', () => {
            const notGif = padded(0x47, 0x49, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(notGif, 'image/gif'), false);
        });
    });

    // ========================
    // WebP validation
    // ========================
    describe('WebP', () => {
        it('should validate WebP RIFF header', () => {
            // R I F F . . . . W E B P
            const webp = padded(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(webp, 'image/webp'), true);
        });

        it('should reject non-RIFF data as WebP', () => {
            const notWebp = padded(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(notWebp, 'image/webp'), false);
        });
    });

    // ========================
    // BMP validation
    // ========================
    describe('BMP', () => {
        it('should validate BMP header (BM)', () => {
            // B M
            const bmp = padded(0x42, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(bmp, 'image/bmp'), true);
        });

        it('should reject non-BMP data', () => {
            const notBmp = padded(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(notBmp, 'image/bmp'), false);
        });
    });

    // ========================
    // ICO validation
    // ========================
    describe('ICO', () => {
        it('should validate ICO header', () => {
            const ico = padded(0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(ico, 'image/x-icon'), true);
        });

        it('should validate CUR header (cursor format)', () => {
            const cur = padded(0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(cur, 'image/x-icon'), true);
        });
    });

    // ========================
    // TIFF validation
    // ========================
    describe('TIFF', () => {
        it('should validate TIFF little-endian (II)', () => {
            const tiffLE = padded(0x49, 0x49, 0x2A, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(tiffLE, 'image/tiff'), true);
        });

        it('should validate TIFF big-endian (MM)', () => {
            const tiffBE = padded(0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(tiffBE, 'image/tiff'), true);
        });
    });

    // ========================
    // SVG validation
    // ========================
    describe('SVG', () => {
        it('should validate SVG with <svg tag', () => {
            const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
            const buffer = new TextEncoder().encode(svgContent);
            assert.strictEqual(validateImageMagicNumber(buffer, 'image/svg+xml'), true);
        });

        it('should validate SVG with XML declaration', () => {
            const svgContent = '<?xml version="1.0" encoding="UTF-8"?><svg></svg>';
            const buffer = new TextEncoder().encode(svgContent);
            assert.strictEqual(validateImageMagicNumber(buffer, 'image/svg+xml'), true);
        });

        it('should reject non-SVG text content', () => {
            const htmlContent = '<html><body>Not SVG</body></html>';
            const buffer = new TextEncoder().encode(htmlContent);
            assert.strictEqual(validateImageMagicNumber(buffer, 'image/svg+xml'), false);
        });
    });

    // ========================
    // Unknown MIME type
    // ========================
    describe('unknown MIME types', () => {
        it('should return true for unknown MIME type (permissive)', () => {
            const data = padded(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(data, 'image/unknown-format'), true);
        });
    });

    // ========================
    // Cross-format spoofing
    // ========================
    describe('cross-format spoofing detection', () => {
        it('should reject PNG data claiming to be GIF', () => {
            const pngData = padded(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            assert.strictEqual(validateImageMagicNumber(pngData, 'image/gif'), false);
        });

        it('should reject GIF data claiming to be JPEG', () => {
            const gifData = padded(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(gifData, 'image/jpeg'), false);
        });

        it('should reject BMP data claiming to be PNG', () => {
            const bmpData = padded(0x42, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
            assert.strictEqual(validateImageMagicNumber(bmpData, 'image/png'), false);
        });
    });
});
