import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { messageRepository } from '~/database/repositories/messageRepository'
import { personalityRepository } from '~/database/repositories/personalityRepository'
import { embeddingRepository } from '~/database/repositories/embeddingRepository'
import { createFlowLogger } from '~/core/utils/logger'

const flowLogger = createFlowLogger('wipedata')

/**
 * User Data Wipe Flow
 * Allows users to delete ALL their personal data (GDPR compliance)
 *
 * Security:
 * - Only deletes data belonging to the requesting user
 * - Requires explicit confirmation phrase
 * - Cannot be undone
 *
 * Deletes:
 * - All messages where user is sender
 * - User's personality settings (private chat only)
 * - User's conversation embeddings (RAG data)
 */
export const wipeDataFlow = addKeyword<TelegramProvider, Database>(
    ['wipedata', '/wipedata', 'wipe data', '/wipe data', 'delete my data', '/delete my data'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        const userIdentifier = ctx.from

        flowLogger.info({ userIdentifier }, 'User initiated data wipe request')

        await utils.flowDynamic(
            `⚠️ *WARNING: DATA DELETION*

You are about to *permanently delete* ALL your data:

✅ All your messages and conversations
✅ Your bot personality settings
✅ Your conversation history (RAG embeddings)

⚠️ *THIS CANNOT BE UNDONE!*

To confirm, please type exactly:
*DELETE ALL MY DATA*

Or type "cancel" to abort.`
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const confirmation = ctx.body.trim()
        const userIdentifier = ctx.from

        // Check for cancellation
        if (confirmation.toLowerCase() === 'cancel') {
            flowLogger.info({ userIdentifier }, 'User cancelled data wipe')
            await utils.flowDynamic('✅ Data deletion cancelled. Your data is safe.')
            return
        }

        // Check for exact confirmation phrase
        if (confirmation !== 'DELETE ALL MY DATA') {
            flowLogger.warn({ userIdentifier, providedText: confirmation }, 'Incorrect confirmation phrase')
            await utils.flowDynamic(
                `❌ Incorrect confirmation phrase.

You typed: "${confirmation}"

Please type exactly: *DELETE ALL MY DATA*

Or type "cancel" to abort.`
            )
            return utils.fallBack()
        }

        // User confirmed - proceed with deletion
        flowLogger.warn({ userIdentifier }, 'User confirmed data wipe - proceeding with deletion')

        await utils.flowDynamic('🔄 Deleting your data... Please wait.')

        try {
            // Delete all data in parallel
            const [messagesDeleted, personalitiesDeleted, embeddingsDeleted] = await Promise.all([
                messageRepository.deleteByUser(userIdentifier),
                personalityRepository.deleteByUser(userIdentifier),
                embeddingRepository.deleteByUser(userIdentifier),
            ])

            flowLogger.info(
                {
                    userIdentifier,
                    messagesDeleted,
                    personalitiesDeleted,
                    embeddingsDeleted,
                },
                'User data successfully wiped'
            )

            await utils.flowDynamic(
                `✅ *Data Deletion Complete*

Your data has been permanently deleted:

📨 Messages deleted: ${messagesDeleted}
⚙️ Personality settings deleted: ${personalitiesDeleted}
🧠 Conversation embeddings deleted: ${embeddingsDeleted}

Your account is now clean. You can start fresh or stop using the bot.

If you want to continue using the bot, please set up your personality again with /setup personality.`
            )
        } catch (error) {
            flowLogger.error({ err: error, userIdentifier }, 'Failed to wipe user data')
            await utils.flowDynamic(
                `❌ Error occurred while deleting your data. Please contact support or try again later.`
            )
        }
    })
