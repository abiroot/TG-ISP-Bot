/**
 * User Mapping Middleware
 *
 * Automatically captures and stores username -> Telegram ID mapping
 * when users interact with the bot. This enables webhook notifications
 * to find users by their system username.
 */

import { telegramUserService } from '~/core/services/telegramUserService'
import { createFlowLogger } from '~/core/utils/logger'
import type { BotCtx } from '~/types'

const logger = createFlowLogger('user-mapping-middleware')

/**
 * Auto-capture user mapping from bot interaction
 *
 * Extracts user data from context and stores/updates in telegram_user_mapping table.
 * The username is derived from the user's name (typically first name from Telegram).
 *
 * This runs silently in the background and doesn't block the flow.
 * Updates on EVERY message to ensure mapping is always current.
 */
export async function captureUserMapping(ctx: BotCtx): Promise<void> {
    try {
        // Skip if we don't have telegram ID
        if (!ctx.from) {
            return
        }

        const telegramId = ctx.from

        // Extract user data from Telegram update (BuilderBot doesn't always populate ctx.name)
        let firstName: string | undefined = ctx.name
        let lastName: string | undefined = undefined
        let telegramUsername: string | undefined = (ctx as any).username

        // Fallback: Extract from raw Telegram update if ctx.name is missing
        if (!firstName) {
            const messageCtx = (ctx as any).messageCtx
            if (messageCtx?.update?.message?.from) {
                const telegramUser = messageCtx.update.message.from
                firstName = telegramUser.first_name
                lastName = telegramUser.last_name
                telegramUsername = telegramUser.username || telegramUsername
            }
        }

        // Check if user already exists in mapping
        const existingUser = await telegramUserService.getUserByTelegramId(telegramId)

        // If no name data available but user exists, just update timestamp
        if (!firstName && existingUser) {
            await telegramUserService.upsertUser({
                username: existingUser.username,
                telegram_id: telegramId,
                telegram_username: existingUser.telegram_username || undefined,
                first_name: existingUser.first_name || undefined,
                last_name: existingUser.last_name || undefined,
            })

            logger.debug(
                { telegramId, username: existingUser.username },
                'User mapping timestamp updated (no name data)'
            )
            return
        }

        // If no name data and no existing user, skip
        if (!firstName) {
            logger.debug({ telegramId }, 'Skipping user mapping - no name data available')
            return
        }

        // Derive username from first name (remove spaces, convert to lowercase)
        // For example: "Josiane Youssef" -> "josianeyoussef"
        const username = firstName.toLowerCase().replace(/\s+/g, '')

        // Skip if username is empty after processing
        if (!username) {
            return
        }

        // Upsert user mapping (create or update if exists)
        await telegramUserService.upsertUser({
            username,
            telegram_id: telegramId,
            telegram_username: telegramUsername,
            first_name: firstName,
            last_name: lastName,
        })

        logger.debug(
            { username, telegramId, telegramUsername, firstName, lastName },
            'User mapping captured/updated'
        )
    } catch (error) {
        // Log error but don't throw - user mapping should not block flows
        logger.error({ err: error, from: ctx.from }, 'Failed to capture user mapping')
    }
}
