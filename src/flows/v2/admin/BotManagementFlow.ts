/**
 * Bot Management Flow (v2)
 *
 * Consolidates 3 flows into 1:
 * - enableMaintenanceFlow
 * - disableMaintenanceFlow
 * - botStatusFlow
 * - toggleFeatureFlow
 *
 * Single flow for all bot management operations
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { APP_VERSION } from '~/app'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('bot-management')

/**
 * Bot Management Flow
 */
export const botManagementFlow = addKeyword<TelegramProvider, Database>([
    'bot status',
    '/status',
    'enable maintenance',
    'disable maintenance',
    'toggle ai',
    'toggle voice',
    'toggle media',
    'toggle rag',
    'toggle isp',
])
    .addAction(async (ctx, { flowDynamic, extensions }) => {
        const { botStateService, userManagementService } = extensions!

        flowLogger.info({ from: ctx.from, body: ctx.body }, 'Bot management triggered')

        // Check admin
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        const input = ctx.body.toLowerCase()

        // Route to appropriate action
        if (input.includes('status')) {
            return handleBotStatus(ctx, flowDynamic, botStateService)
        } else if (input.includes('enable maintenance')) {
            await botStateService.enableMaintenanceMode({
                message: '🔧 Bot is under maintenance. Please try again later.',
                enabledBy: ctx.from,
            })
            await flowDynamic('✅ Maintenance mode **ENABLED**')
        } else if (input.includes('disable maintenance')) {
            await botStateService.disableMaintenanceMode(ctx.from)
            await flowDynamic('✅ Maintenance mode **DISABLED**')
        } else if (input.includes('toggle')) {
            return handleToggleFeature(ctx, flowDynamic, botStateService)
        }
    })

/**
 * Handle bot status display
 */
async function handleBotStatus(ctx: any, flowDynamic: any, botStateService: any) {
    const state = await botStateService.getFullState()
    const uptime = process.uptime()
    const uptimeHours = Math.floor(uptime / 3600)
    const uptimeMinutes = Math.floor((uptime % 3600) / 60)

    const maintenanceStatus = state.maintenance.enabled ? '🔧 **ENABLED**' : '✅ **DISABLED**'

    let message = `🤖 **Bot Status**\n\n`
    message += `**Version:** ${APP_VERSION}\n`
    message += `**Uptime:** ${uptimeHours}h ${uptimeMinutes}m\n`
    message += `**Maintenance:** ${maintenanceStatus}\n\n`

    message += `**Features:**\n`
    message += `• AI Responses: ${state.features.ai_responses ? '✅' : '❌'}\n`
    message += `• RAG: ${state.features.rag_enabled ? '✅' : '❌'}\n`
    message += `• Voice Transcription: ${state.features.voice_transcription ? '✅' : '❌'}\n`
    message += `• Image Analysis: ${state.features.image_analysis ? '✅' : '❌'}\n`
    message += `• ISP Tools: ${state.features.isp_tools ? '✅' : '❌'}\n`
    message += `• Rate Limiting: ${state.features.rate_limiting ? '✅' : '❌'}\n`

    if (state.features.button_demos || state.features.test_flows) {
        message += `\n**Development:**\n`
        if (state.features.button_demos) message += `• Button Demos: ✅\n`
        if (state.features.test_flows) message += `• Test Flows: ✅\n`
    }

    await flowDynamic(message)
}

/**
 * Handle feature toggle
 */
async function handleToggleFeature(ctx: any, flowDynamic: any, botStateService: any) {
    const input = ctx.body.toLowerCase()

    let feature: string | null = null
    if (input.includes('ai')) feature = 'ai_responses'
    else if (input.includes('rag')) feature = 'rag_enabled'
    else if (input.includes('voice')) feature = 'voice_transcription'
    else if (input.includes('media')) feature = 'image_analysis'
    else if (input.includes('isp')) feature = 'isp_tools'

    if (!feature) {
        await flowDynamic('❌ Unknown feature. Available: ai, rag, voice, media, isp')
        return
    }

    const newState = await botStateService.toggleFeature(feature, ctx.from)
    const status = newState ? '✅ ENABLED' : '❌ DISABLED'

    await flowDynamic(`🔄 Feature **${feature}** is now ${status}`)
}

/**
 * Flow metadata
 */
