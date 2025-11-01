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

        // Check if user already exists in mapping
        const existingUser = await telegramUserService.getUserByTelegramId(telegramId)

        // If ctx.name is missing but user exists, just update last_seen (via upsert with existing data)
        if (!ctx.name && existingUser) {
            // Re-upsert with existing data to update timestamp
            await telegramUserService.upsertUser({
                username: existingUser.username,
                telegram_id: telegramId,
                telegram_username: existingUser.telegram_username || undefined,
                first_name: existingUser.first_name || undefined,
                last_name: existingUser.last_name || undefined,
            })

            logger.debug(
                { telegramId, username: existingUser.username },
                'User mapping timestamp updated (name not in ctx)'
            )
            return
        }

        // If ctx.name is missing and no existing user, skip (nothing to capture)
        if (!ctx.name) {
            logger.debug({ telegramId }, 'Skipping user mapping - no name in ctx and no existing user')
            return
        }

        const firstName = ctx.name

        // Derive username from name (remove spaces, convert to lowercase)
        // For example: "Josiane Youssef" -> "josianeyoussef"
        const username = firstName.toLowerCase().replace(/\s+/g, '')

        // Skip if username is empty after processing
        if (!username) {
            return
        }

        // Attempt to get telegram_username from ctx if available
        // BuilderBot's ctx might have additional fields from Telegram
        const telegramUsername = (ctx as any).username || undefined

        // Upsert user mapping (create or update if exists)
        await telegramUserService.upsertUser({
            username,
            telegram_id: telegramId,
            telegram_username: telegramUsername,
            first_name: firstName,
            last_name: undefined, // BuilderBot doesn't expose last_name in ctx
        })

        logger.debug(
            { username, telegramId, telegramUsername },
            'User mapping captured/updated'
        )
    } catch (error) {
        // Log error but don't throw - user mapping should not block flows
        logger.error({ err: error, from: ctx.from }, 'Failed to capture user mapping')
    }
}
