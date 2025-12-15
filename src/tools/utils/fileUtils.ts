import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a file as Uint8Array for efficient binary handling
 */
export async function readFileAsBuffer(filePath: string): Promise<Uint8Array> {
    const buffer = await fs.promises.readFile(filePath);
    return new Uint8Array(buffer);
}

/**
 * Gets the MIME type for an image file based on its extension
 */
export function getImageMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
    };

    return mimeTypes[extension] || 'application/octet-stream';
}
