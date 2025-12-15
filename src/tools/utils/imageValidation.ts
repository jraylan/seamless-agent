/**
 * Validates that image file content matches its claimed MIME type using magic numbers
 * This provides additional security against files with spoofed extensions
 */
export function validateImageMagicNumber(buffer: Uint8Array, mimeType: string): boolean {
    if (buffer.length < 8) return false;

    // Magic number signatures for common image formats
    const signatures: Record<string, number[][]> = {
        'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        'image/jpeg': [[0xFF, 0xD8, 0xFF]],
        'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a, GIF89a
        'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF....WEBP)
        'image/bmp': [[0x42, 0x4D]], // BM
        'image/x-icon': [[0x00, 0x00, 0x01, 0x00], [0x00, 0x00, 0x02, 0x00]], // ICO, CUR
        'image/tiff': [[0x49, 0x49, 0x2A, 0x00], [0x4D, 0x4D, 0x00, 0x2A]], // Little-endian, Big-endian
    };

    // SVG is text-based, check for XML/SVG start
    if (mimeType === 'image/svg+xml') {
        const text = new TextDecoder().decode(buffer.slice(0, 500));
        return text.includes('<svg') || text.includes('<?xml');
    }

    const expectedSignatures = signatures[mimeType];

    if (!expectedSignatures) {
        // Unknown MIME type - allow but log warning
        console.warn(`No magic number validation for MIME type: ${mimeType}`);
        return true;
    }

    // Check if buffer starts with any of the expected signatures
    for (const signature of expectedSignatures) {
        let matches = true;

        for (let i = 0; i < signature.length; i++) {
            if (buffer[i] !== signature[i]) {
                matches = false;
                break;
            }
        }

        if (matches) return true;
    }

    return false;
}
