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
 * Download voice file directly using Telegram API as fallback
 */
async function downloadVoiceFileDirectly(ctx: any, tempDir: string): Promise<string> {
    try {
        // Extract file_id from the correct location in context
        let fileId = null
        if (ctx.message?.voice?.file_id) {
            fileId = ctx.message.voice.file_id
        } else if (ctx.messageCtx?.update?.message?.voice?.file_id) {
            fileId = ctx.messageCtx.update.message.voice.file_id
        } else if (ctx.messageCtx?.update?.message?.audio?.file_id) {
            fileId = ctx.messageCtx.update.message.audio.file_id
        }

        if (!fileId) {
            throw new Error('No voice file_id found in context')
        }

        logger.debug({ fileId }, 'Downloading voice file directly via Telegram API')

        // Get bot token from environment
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        if (!botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN not found in environment')
        }

        // Get file info from Telegram API
        const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        const fileInfoResponse = await fetch(fileInfoUrl)

        if (!fileInfoResponse.ok) {
            throw new Error(`Failed to get file info: ${fileInfoResponse.status} ${fileInfoResponse.statusText}`)
        }

        const fileInfo = await fileInfoResponse.json()
        if (!fileInfo.ok || !fileInfo.result?.file_path) {
            throw new Error('Invalid file info response from Telegram API')
        }

        // Download the file
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`
        const fileResponse = await fetch(downloadUrl)

        if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`)
        }

        // Generate local file path with normalized extension
        let extension = path.extname(fileInfo.result.file_path) || '.ogg'
        // Normalize .oga to .ogg for transcription service compatibility
        if (extension === '.oga') {
            extension = '.ogg'
        }
        const localPath = generateTempFilePath(extension.replace('.', ''))

        // Save file to disk
        const buffer = await fileResponse.arrayBuffer()
        fs.writeFileSync(localPath, Buffer.from(buffer))

        logger.debug({ fileId, localPath, size: buffer.byteLength }, 'Voice file downloaded successfully')
        return localPath
    } catch (error) {
        logger.error({ err: error }, 'Failed to download voice file directly')
        throw error
    }
}

/**
 * Wrapper for provider.saveFile with proper temp directory and enhanced error handling
 */
export async function saveToTemp(provider: any, ctx: any): Promise<string> {
    const tempDir = getTempDir()

    try {
        logger.debug({
            provider: provider.constructor?.name || 'unknown',
            hasMessage: !!ctx.message,
            hasMessageCtx: !!ctx.messageCtx,
            hasVoice: !!(ctx.message?.voice || ctx.messageCtx?.update?.message?.voice),
            tempDir
        }, 'Attempting to save file to temp directory')

        // Validate context before passing to provider
        if (!ctx) {
            throw new Error('Context is undefined - cannot save file')
        }

        // Check for media in multiple possible locations (BuilderBot context structure)
        const hasMedia = ctx.message?.voice || ctx.message?.audio || ctx.message?.document ||
                         ctx.messageCtx?.update?.message?.voice ||
                         ctx.messageCtx?.update?.message?.audio ||
                         ctx.messageCtx?.update?.message?.document

        if (!hasMedia) {
            logger.warn({ ctx }, 'No media found in context message')
            throw new Error('No media file found in context message')
        }

        // Try provider's saveFile method first
        try {
            const localPath = await provider.saveFile(ctx, { path: tempDir })

            if (!localPath) {
                throw new Error('Provider saveFile returned undefined path')
            }

            logger.debug({ path: localPath }, 'File saved to temp directory successfully')
            return localPath
        } catch (providerError) {
            logger.warn({ err: providerError }, 'Provider saveFile failed, trying direct download for voice files')

            // Fallback to direct download for voice files
            const hasVoice = ctx.message?.voice || ctx.messageCtx?.update?.message?.voice
            if (hasVoice) {
                logger.info('Using direct Telegram API download for voice file')
                return await downloadVoiceFileDirectly(ctx, tempDir)
            }

            throw providerError
        }
    } catch (error) {
        logger.error({
            err: error,
            tempDir,
            hasProvider: !!provider,
            providerType: provider.constructor?.name,
            hasContext: !!ctx,
            hasMessage: !!ctx?.message,
            hasMessageCtx: !!ctx?.messageCtx,
            messageType: {
                voice: !!(ctx?.message?.voice || ctx?.messageCtx?.update?.message?.voice),
                audio: !!(ctx?.message?.audio || ctx?.messageCtx?.update?.message?.audio),
                document: !!(ctx?.message?.document || ctx?.messageCtx?.update?.message?.document)
            }
        }, 'Failed to save file to temp directory')

        // Re-throw with more descriptive error
        if (error instanceof Error) {
            throw new Error(`File save failed: ${error.message}`)
        }
        throw new Error(`File save failed: ${String(error)}`)
    }
}

// Auto-cleanup old temp files every hour
setInterval(async () => {
    await cleanupOldTempFiles()
}, 60 * 60 * 1000)

// Initialize temp directory on import
ensureTempDir()
