/**
 * User Mapping Middleware
 *
 * Automatically captures and stores worker_username -> Telegram ID mapping
 * when users interact with the bot. This enables webhook notifications
 * to find users by their billing system username.
 */

import { telegramUserService } from '~/core/services/telegramUserService'
import { createFlowLogger } from '~/core/utils/logger'
import { TelegramUserHelper } from '~/core/utils/TelegramUserHelper'
import type { BotCtx } from '~/types'

const logger = createFlowLogger('user-mapping-middleware')

/**
 * Auto-capture user mapping from bot interaction
 *
 * Extracts user data from context and stores/updates in telegram_user_mapping table.
 * The worker_username is derived from the user's first name (for billing system mapping).
 *
 * This runs silently in the background and doesn't block the flow.
 * Updates on EVERY message to ensure mapping is always current.
 */
export async function captureUserMapping(ctx: BotCtx): Promise<void> {
    try {
        logger.debug(
            {
                from: ctx.from,
                name: ctx.name,
                body: ctx.body?.substring(0, 50)
            },
            'User capture starting'
        )

        // Skip if we don't have telegram ID
        if (!ctx.from) {
            logger.warn(
                {
                    body: ctx.body,
                    name: ctx.name,
                    from: ctx.from,
                    keys: Object.keys(ctx)
                },
                'User capture skipped: ctx.from is missing'
            )
            return
        }

        // Extract all user data using unified helper
        const userData = TelegramUserHelper.extractUserData(ctx)

        // Check if user already exists in mapping
        const existingUser = await telegramUserService.getUserByTelegramId(userData.telegramId)

        // If no name data available but user exists, just update timestamp
        if (!userData.firstName && existingUser) {
            await telegramUserService.upsertUser({
                worker_username: existingUser.worker_username,
                telegram_id: userData.telegramId,
                telegram_handle: existingUser.telegram_handle || undefined,
                first_name: existingUser.first_name || undefined,
                last_name: existingUser.last_name || undefined,
            })

            logger.debug(
                { telegramId: userData.telegramId, workerUsername: existingUser.worker_username },
                'User mapping timestamp updated (no name data)'
            )
            return
        }

        // Upsert user mapping (create or update if exists)
        const requestedUsername = userData.workerUsername
        const userMapping = await telegramUserService.upsertUser({
            worker_username: userData.workerUsername,
            telegram_id: userData.telegramId,
            telegram_handle: userData.telegramHandle,
            first_name: userData.firstName,
            last_name: userData.lastName,
        })

        // Log the final username (may be different if conflict occurred)
        if (userMapping.worker_username !== requestedUsername) {
            logger.info(
                {
                    requestedUsername,
                    assignedUsername: userMapping.worker_username,
                    telegramId: userData.telegramId,
                    firstName: userData.firstName,
                },
                'Username conflict - number appended to new user'
            )
        } else {
            logger.debug(
                {
                    workerUsername: userMapping.worker_username,
                    telegramId: userData.telegramId,
                    telegramHandle: userData.telegramHandle,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                },
                'User mapping captured/updated'
            )
        }
    } catch (error) {
        // Log error but don't throw - user mapping should not block flows
        logger.error({ err: error, from: ctx.from }, 'Failed to capture user mapping')
    }
}
