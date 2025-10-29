import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { requireAdmin } from '~/middleware/adminCheck'
import { botStateService } from '~/services/botStateService'
import { APP_VERSION } from '~/app'

/**
 * Enable Maintenance Mode Flow
 */
export const enableMaintenanceFlow = addKeyword<TelegramProvider, Database>(
    ['maintenance on', '/maintenance on', 'maint on'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        await utils.flowDynamic('Do you want to set a custom maintenance message? (Reply with message or "skip")')
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const response = ctx.body.trim()

        if (response.toLowerCase() === 'skip') {
            await botStateService.enableMaintenanceMode(undefined, ctx.from)
        } else {
            await botStateService.enableMaintenanceMode(response, ctx.from)
        }

        await utils.flowDynamic(
            '🔧 *Maintenance Mode Enabled*\n\n' +
                `Message: "${await botStateService.getMaintenanceMessage()}"\n\n` +
                'The bot will now only respond to admin commands.'
        )
    })

/**
 * Disable Maintenance Mode Flow
 */
export const disableMaintenanceFlow = addKeyword<TelegramProvider, Database>(
    ['maintenance off', '/maintenance off', 'maint off'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        await botStateService.disableMaintenanceMode()

        await utils.flowDynamic('✅ *Maintenance Mode Disabled*\n\nBot is now fully operational.')
    })

/**
 * Check Bot Status Flow
 */
export const botStatusFlow = addKeyword<TelegramProvider, Database>(
    ['bot status', '/bot status', 'system status', 'status'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        const state = await botStateService.getState()
        const features = state.features_enabled

        let statusMessage = '📊 *Bot Status*\n\n'

        statusMessage += `📦 Version: v${APP_VERSION}\n`
        statusMessage += `🔧 Maintenance Mode: ${state.maintenance_mode.enabled ? '🔴 ENABLED' : '🟢 DISABLED'}\n`
        if (state.maintenance_mode.enabled && state.maintenance_mode.message) {
            statusMessage += `   Message: "${state.maintenance_mode.message}"\n`
        }

        statusMessage += '\n*Features:*\n'
        statusMessage += `• AI Responses: ${features.ai_responses ? '✅ Enabled' : '❌ Disabled'}\n`
        statusMessage += `• Voice Transcription: ${features.voice_transcription ? '✅ Enabled' : '❌ Disabled'}\n`
        statusMessage += `• Image Analysis: ${features.image_analysis ? '✅ Enabled' : '❌ Disabled'}\n`

        await utils.flowDynamic(statusMessage)
    })

/**
 * Toggle Feature Flow
 */
export const toggleFeatureFlow = addKeyword<TelegramProvider, Database>(['toggle feature', '/toggle feature'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        await utils.flowDynamic(
            'Which feature would you like to toggle?\n\n' +
                '1. ai_responses - AI-powered chat responses\n' +
                '2. voice_transcription - Voice note transcription\n' +
                '3. image_analysis - Image analysis\n\n' +
                'Reply with the feature name (e.g., "ai_responses")'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const feature = ctx.body.trim().toLowerCase() as
            | 'ai_responses'
            | 'voice_transcription'
            | 'image_analysis'

        const validFeatures = ['ai_responses', 'voice_transcription', 'image_analysis']

        if (!validFeatures.includes(feature)) {
            await utils.flowDynamic('❌ Invalid feature name. Please use: ai_responses, voice_transcription, or image_analysis')
            return
        }

        const currentStatus = await botStateService.isFeatureEnabled(feature)

        if (currentStatus) {
            await botStateService.disableFeature(feature)
            await utils.flowDynamic(`🚫 Feature "${feature}" has been DISABLED`)
        } else {
            await botStateService.enableFeature(feature)
            await utils.flowDynamic(`✅ Feature "${feature}" has been ENABLED`)
        }
    })
