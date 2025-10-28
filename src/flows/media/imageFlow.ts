import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { requireWhitelist } from '~/middleware/whitelistCheck'
import { getPersonality } from '~/middleware/personalityCheck'
import { imageAnalysisService } from '~/services/imageAnalysisService'
import { MessageLogger } from '~/middleware/messageLogger'
import { isAdmin } from '~/config/admins'
import { messageDebouncer } from '~/utils/messageDebouncer'
import { personalityService } from '~/services/personalityService'
import { createFlowLogger } from '~/utils/logger'
import { saveToTemp, cleanupTempFile } from '~/utils/tempFiles'
import fs from 'fs'
import path from 'path'

const flowLogger = createFlowLogger('media')

/**
 * Media Flow - handles images and videos
 * Uses EVENTS.MEDIA which triggers when an image or video is received
 * Implements message debouncing to handle rapid multiple image uploads
 */
export const mediaFlow = addKeyword<TelegramProvider, Database>(EVENTS.MEDIA).addAction(
    async (ctx, { flowDynamic, provider }) => {
        flowLogger.info({ from: ctx.from }, 'MEDIA flow triggered')

        const contextId = personalityService.getContextId(ctx.from)

        // Use message debouncer to accumulate rapid media uploads
        messageDebouncer.addMessage(
            contextId,
            ctx.body || 'media',
            async (accumulatedMessages) => {
                flowLogger.debug({ contextId, count: accumulatedMessages.length }, 'Processing media files')

                // Check if context is whitelisted
                const whitelisted = await requireWhitelist(ctx, { flowDynamic } as any)
                if (!whitelisted) {
                    if (!isAdmin(ctx.from)) {
                        flowLogger.debug({ from: ctx.from }, 'Not whitelisted and not admin - ignoring')
                        return
                    }
                    flowLogger.info({ from: ctx.from }, 'Admin bypassing whitelist')
                }

                // Get personality
                const personality = await getPersonality(ctx, { flowDynamic } as any)
                if (!personality) {
                    flowLogger.warn({ from: ctx.from }, 'No personality found')
                    await flowDynamic('⚠️ Please set up your personality first using the setup command.')
                    return
                }

                flowLogger.debug({ from: ctx.from, botName: personality.bot_name }, 'Personality found')

                // Notify user about batch processing
                if (accumulatedMessages.length > 1) {
                    await flowDynamic(`📸 Analyzing ${accumulatedMessages.length} images...`)
                } else {
                    await flowDynamic('📸 Analyzing your image...')
                }

                let localPath: string | undefined
                try {
                    // Save the media file locally using temp file utility
                    flowLogger.debug('Saving media file')
                    localPath = await saveToTemp(provider, ctx)
                    flowLogger.debug({ path: localPath }, 'Media file saved')

                    // Check if it's an image (skip videos for now)
                    const extension = localPath.split('.').pop()?.toLowerCase()
                    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']

                    if (!extension || !imageExtensions.includes(extension)) {
                        flowLogger.info({ extension }, 'Not an image file, skipping analysis')
                        await flowDynamic(
                            '📹 I received your media file. Currently, I can only analyze images (not videos).'
                        )
                        return
                    }

                    // Analyze the image with structured output
                    flowLogger.debug('Analyzing image')
                    const startTime = Date.now()
                    const analysis = await imageAnalysisService.analyzeImage(localPath)
                    const durationMs = Date.now() - startTime
                    flowLogger.info({ durationMs }, 'Image analysis complete')

                    // Format and send the analysis (logging handled automatically)
                    const analysisMessage = imageAnalysisService.formatAnalysis(analysis)
                    await flowDynamic(analysisMessage)

                    flowLogger.debug('Analysis sent to user')
                } catch (error) {
                    flowLogger.error({ err: error, from: ctx.from }, 'Error processing media message')
                    const errorMsg =
                        '❌ Sorry, I encountered an error analyzing your image. Please try again or send a different image.'
                    await flowDynamic(errorMsg)
                } finally {
                    // Clean up: delete the temporary media file using utility
                    if (localPath) {
                        await cleanupTempFile(localPath)
                    }
                }
            },
            2000 // 2 second debounce window for rapid uploads
        )
    }
)
