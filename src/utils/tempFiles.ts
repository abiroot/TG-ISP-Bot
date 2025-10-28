/**
 * Temp File Management Utility
 *
 * Provides consistent temp directory management with automatic cleanup
 * Based on BuilderBot best practices for media file handling
 */

import fs from 'fs'
import path from 'path'
import { createFlowLogger } from './logger'

const logger = createFlowLogger('temp-files')

// Default temp directory (can be overridden via env)
const TEMP_DIR = process.env.TEMP_DIR || path.join(process.cwd(), 'temp')

/**
 * Ensure temp directory exists
 */
export function ensureTempDir(): string {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true })
        logger.info({ path: TEMP_DIR }, 'Temp directory created')
    }
    return TEMP_DIR
}

/**
 * Get the temp directory path
 */
export function getTempDir(): string {
    return ensureTempDir()
}

/**
 * Clean up a single temp file
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath)
            logger.debug({ path: filePath }, 'Temp file deleted')
        } catch (error) {
            logger.error({ err: error, path: filePath }, 'Failed to delete temp file')
        }
    }
}

/**
 * Clean up multiple temp files
 */
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
        await cleanupTempFile(filePath)
    }
}

/**
 * Clean up old temp files (older than maxAgeMs)
 */
export async function cleanupOldTempFiles(maxAgeMs: number = 60 * 60 * 1000): Promise<number> {
    const tempDir = getTempDir()
    let cleanedCount = 0

    try {
        const files = fs.readdirSync(tempDir)
        const now = Date.now()

        for (const file of files) {
            const filePath = path.join(tempDir, file)
            const stats = fs.statSync(filePath)

            if (now - stats.mtimeMs > maxAgeMs) {
                try {
                    fs.unlinkSync(filePath)
                    cleanedCount++
                } catch (error) {
                    logger.error({ err: error, path: filePath }, 'Failed to delete old temp file')
                }
            }
        }

        if (cleanedCount > 0) {
            logger.info({ cleanedCount, maxAgeMs }, 'Old temp files cleaned up')
        }
    } catch (error) {
        logger.error({ err: error, tempDir }, 'Failed to cleanup old temp files')
    }

    return cleanedCount
}

/**
 * Generate a unique temp file path
 */
export function generateTempFilePath(extension: string = 'tmp'): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    const fileName = `${timestamp}-${random}.${extension}`
    return path.join(getTempDir(), fileName)
}

/**
 * Wrapper for provider.saveFile with proper temp directory
 */
export async function saveToTemp(provider: any, ctx: any): Promise<string> {
    const tempDir = getTempDir()
    const localPath = await provider.saveFile(ctx, { path: tempDir })
    logger.debug({ path: localPath }, 'File saved to temp directory')
    return localPath
}

// Auto-cleanup old temp files every hour
setInterval(async () => {
    await cleanupOldTempFiles()
}, 60 * 60 * 1000)

// Initialize temp directory on import
ensureTempDir()
