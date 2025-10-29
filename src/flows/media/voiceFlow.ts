import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { requireWhitelist } from '~/middleware/whitelistCheck'
import { getPersonality } from '~/middleware/personalityCheck'
import { transcriptionService } from '~/services/transcriptionService'
import { aiService } from '~/services/aiService'
import { intentService } from '~/services/intentService'
import { MessageLogger } from '~/middleware/messageLogger'
import { messageService } from '~/services/messageService'
import { personalityService } from '~/services/personalityService'
import { isAdmin } from '~/config/admins'
import { messageDebouncer } from '~/utils/messageDebouncer'
import { saveToTemp, cleanupTempFile } from '~/utils/tempFiles'
import { createFlowLogger } from '~/utils/logger'
import fs from 'fs'
import path from 'path'

const flowLogger = createFlowLogger('voice')

/**
 * Voice Note Flow - handles voice messages
 * Uses EVENTS.VOICE_NOTE which triggers when a voice note is received
 * Implements message debouncing to handle rapid multiple voice note uploads
 */
export const voiceNoteFlow = addKeyword<TelegramProvider, Database>(EVENTS.VOICE_NOTE).addAction(
    async (ctx, { flowDynamic, provider, state, gotoFlow }) => {
        flowLogger.info({ from: ctx.from }, 'VOICE_NOTE flow triggered')

        const contextId = personalityService.getContextId(ctx.from)

        // Use message debouncer to accumulate rapid voice note uploads
        messageDebouncer.addMessage(
            contextId,
            ctx.body || 'voice_note',
            async (accumulatedMessages) => {
                flowLogger.info({ count: accumulatedMessages.length, contextId }, 'Processing voice note(s)')
                console.log(`  🔄 Processing ${accumulatedMessages.length} voice note(s) for ${contextId}`)

                // Extract voice data from the correct location in context
                let voiceData = null
                if (ctx.message?.voice) {
                    voiceData = ctx.message.voice
                } else if (ctx.messageCtx?.update?.message?.voice) {
                    voiceData = ctx.messageCtx.update.message.voice
                } else if (ctx.messageCtx?.update?.message?.audio) {
                    voiceData = ctx.messageCtx.update.message.audio
                }

                // Log voice note metadata for debugging
                if (voiceData) {
                    flowLogger.info({
                        fileId: voiceData.file_id,
                        duration: voiceData.duration,
                        mimeType: voiceData.mime_type,
                        fileSize: voiceData.file_size,
                        fileUniqueId: voiceData.file_unique_id
                    }, 'Voice note metadata received')
                    console.log(`  📋 Voice metadata: file_id=${voiceData.file_id}, duration=${voiceData.duration}s, mime_type=${voiceData.mime_type}, size=${voiceData.file_size} bytes`)
                } else {
                    flowLogger.error({ ctx: ctx }, 'No voice message found in context')
                    console.log('  🔍 Context structure:', {
                        hasMessage: !!ctx.message,
                        hasMessageCtx: !!ctx.messageCtx,
                        hasUpdate: !!ctx.messageCtx?.update,
                        hasUpdateMessage: !!ctx.messageCtx?.update?.message,
                        hasVoice: !!ctx.messageCtx?.update?.message?.voice,
                        hasAudio: !!ctx.messageCtx?.update?.message?.audio
                    })
                    throw new Error('Voice message context is invalid - no voice data found')
                }

                // Check if context is whitelisted
                const whitelisted = await requireWhitelist(ctx, { flowDynamic } as any)
                if (!whitelisted) {
                    if (!isAdmin(ctx.from)) {
                        flowLogger.warn({ from: ctx.from, contextId }, 'Not whitelisted and not admin - ignoring voice message')
                        console.log('  ⚠️  Not whitelisted and not admin - ignoring voice message')
                        return
                    }
                    flowLogger.info({ from: ctx.from, contextId }, 'Not whitelisted but is admin - allowing voice message')
                    console.log('  ℹ️  Not whitelisted but is admin - allowing voice message')
                }

                // Get personality
                const personality = await getPersonality(ctx, { flowDynamic } as any)
                if (!personality) {
                    flowLogger.error({ from: ctx.from, contextId }, 'No personality found - cannot process voice message')
                    console.log('  ⚠️  No personality found - cannot process voice message')
                    await flowDynamic('⚠️ Please set up your personality first using the setup command.')
                    return
                }

                flowLogger.info({ personality: personality.bot_name }, 'Personality found for voice processing')
                console.log('  ✓ Personality found:', personality.bot_name)

                // Notify user about batch processing
                if (accumulatedMessages.length > 1) {
                    await flowDynamic(`🎤 Transcribing ${accumulatedMessages.length} voice messages...`)
                } else {
                    await flowDynamic('🎤 Transcribing your voice message...')
                }

                let localPath: string | undefined
                try {
                    // Save the voice note locally using temp file utility
                    flowLogger.info({ provider: 'telegram' }, 'Starting voice file download')
                    console.log('  💾 Downloading voice file...')
                    localPath = await saveToTemp(provider, ctx)
                    flowLogger.info({ path: localPath }, 'Voice file saved successfully')
                    console.log('  ✓ Voice file saved to:', localPath)

                    // Validate the saved file
                    if (!localPath || !fs.existsSync(localPath)) {
                        const errorMsg = 'Voice file was not saved properly'
                        flowLogger.error({ path: localPath }, errorMsg)
                        throw new Error(errorMsg)
                    }

                    // Check file size
                    const stats = fs.statSync(localPath)
                    flowLogger.info({ size: stats.size, path: localPath }, 'Saved file stats')
                    console.log(`  📊 File size: ${stats.size} bytes`)

                    if (stats.size === 0) {
                        const errorMsg = 'Downloaded voice file is empty'
                        flowLogger.error({ path: localPath, size: stats.size }, errorMsg)
                        throw new Error(errorMsg)
                    }

                    // Transcribe the audio
                    flowLogger.info({ path: localPath }, 'Starting audio transcription')
                    console.log('  🎯 Transcribing audio...')
                    const transcription = await transcriptionService.transcribeAudio(localPath)
                    flowLogger.info({ transcriptionLength: transcription.length }, 'Transcription completed successfully')
                    console.log('  ✓ Transcription complete:', transcription.substring(0, 100))

                    // Send transcription to user (basic logging handled automatically)
                    await flowDynamic(`📝 *Transcription:* "${transcription}"`)

                    // Fetch recent conversation history for intent classification
                    console.log('  → Fetching conversation history...')
                    const recentMessages = await messageService.getLastMessages(contextId, 10) // Last 10 messages
                    console.log(`  ✓ Retrieved ${recentMessages.length} messages from history`)

                    // 🎯 LANGCHAIN INTENT CLASSIFICATION
                    const intentStartTime = Date.now()
                    const intentResult = await intentService.classifyIntent(transcription, recentMessages)
                    const intentDurationMs = Date.now() - intentStartTime

                    flowLogger.info(
                        {
                            intent: intentResult.intention,
                            confidence: intentResult.confidence,
                            durationMs: intentDurationMs
                        },
                        'Intent classified for voice note'
                    )

                    // Route based on intent classification
                    if (intentResult.confidence >= 0.7) {
                        switch (intentResult.intention) {
                            case 'USER_INFO':
                            case 'ACCOUNT_STATUS':
                            case 'TECHNICAL_SUPPORT':
                            case 'BILLING_QUERY':
                            case 'NETWORK_INFO': {
                                flowLogger.info({ from: ctx.from, intent: intentResult.intention }, 'Detected ISP support intent in voice note - handling directly')

                                // Extract phone number from transcribed text
                                const phoneNumber = intentService.extractPhoneNumber(transcription)

                                if (!phoneNumber) {
                                    await flowDynamic(
                                        '📞 *Phone Number Required*\n\n' +
                                        'I need a phone number to look up user information.\n\n' +
                                        'Please provide a phone number in any of these formats:\n' +
                                        '• +1234567890\n' +
                                        '• 123-456-7890\n' +
                                        '• (123) 456-7890\n' +
                                        '• 123.456.7890\n\n' +
                                        'Example: "Check +1234567890" or "Info for 123-456-7890"'
                                    )
                                    return
                                }

                                flowLogger.info({ from: ctx.from, phoneNumber }, 'Phone number extracted from voice note, fetching user info')

                                await flowDynamic('🔍 *Searching...* Please wait while I retrieve the user information.')

                                try {
                                    // Import and use ISP API service directly
                                    const { ispApiService } = await import('~/services/ispApiService')
                                    const users = await ispApiService.getUserInfo(phoneNumber)

                                    if (!users || users.length === 0) {
                                        await flowDynamic(
                                            `❌ *User Not Found*\n\n` +
                                            `I couldn't find any user with the phone number: *${phoneNumber}*\n\n` +
                                            `Please:\n• Double-check the phone number\n• Make sure the number is registered in the ISP system\n• Try a different phone number`,
                                            { delay: 500 }
                                        )
                                        return
                                    }

                                    // Display information for each user sequentially
                                    await flowDynamic(
                                        `🔍 *Found ${users.length} user(s)* for phone number: *${phoneNumber}*\n\n` +
                                        `Displaying information for each user:`,
                                        { delay: 500 }
                                    )

                                    for (let i = 0; i < users.length; i++) {
                                        const userInfo = users[i]

                                        // Format and display user information
                                        const formattedInfo = ispApiService.formatUserInfo(userInfo)
                                        await flowDynamic(formattedInfo, { delay: 500 })

                                        flowLogger.info({ from: ctx.from, userId: userInfo.id }, 'User information retrieved successfully from voice note')
                                    }

                                } catch (error) {
                                    flowLogger.error({ err: error, from: ctx.from, phoneNumber }, 'Failed to fetch user info from voice note')
                                    await flowDynamic(
                                        '❌ *Error Retrieving Information*\n\n' +
                                        'I encountered an error while trying to fetch the user information. ' +
                                        'This could be due to:\n• Network connectivity issues\n• ISP API being temporarily unavailable\n• Invalid phone number format\n\n' +
                                        'Please try again in a few moments.',
                                        { delay: 500 }
                                    )
                                }
                                return
                            }

                            case 'GREETING': {
                                flowLogger.info({ from: ctx.from }, 'Handling greeting intent from voice note')
                                const greetingResponse = `Hello! 👋 I'm ${personality.bot_name}, your ISP Support assistant.\n\n` +
                                    `I can help you:\n` +
                                    `📞 Look up customer information by phone number\n` +
                                    `🔍 Check account status and online status\n` +
                                    `🌐 View network details and connection info\n` +
                                    `💰 Check billing and account expiry\n` +
                                    `📡 Provide technical support details\n\n` +
                                    `How can I help you today?`
                                return await flowDynamic(greetingResponse)
                            }

                            case 'APPRECIATION': {
                                flowLogger.info({ from: ctx.from }, 'Handling appreciation intent from voice note')
                                const appreciationResponse = `You're welcome! 😊\n\n` +
                                    `I'm always here to help with any customer information or technical support you need.\n\n` +
                                    `Is there anything else I can assist you with?`
                                return await flowDynamic(appreciationResponse)
                            }

                            case 'HELP': {
                                flowLogger.info({ from: ctx.from }, 'Handling help intent from voice note')
                                const helpResponse = `🤖 *How to use ${personality.bot_name}:*\n\n` +
                                    `📞 *Customer Info:* "Check +1234567890" or "Get info for 555-1234"\n` +
                                    `📊 *Account Status:* "Is customer +1234567890 online?"\n` +
                                    `🌐 *Technical Support:* "What's the IP for +1234567890?"\n` +
                                    `💰 *Billing Query:* "Check billing for +1234567890"\n` +
                                    `📡 *Network Info:* "What are the speeds for +1234567890?"\n\n` +
                                    `Simply provide a phone number with your query, and I'll fetch the information!`
                                return await flowDynamic(helpResponse)
                            }
                        }
                    }

                    // For UNKNOWN, QUERY, or low confidence intents: Use tool-enabled RAG AI response
                    flowLogger.debug({ from: ctx.from }, 'Using tool-enabled RAG AI response for voice note query/unknown intent')
                    console.log('  → Generating AI response...')
                    const response = await aiService.generateResponseWithToolsAndRAG(
                        contextId,
                        ctx.from, // userPhone
                        ctx.name, // userName
                        transcription,
                        personality,
                        recentMessages
                    )

                    console.log('  ✓ AI response generated')
                    await flowDynamic(response)
                    console.log('  ✓ Response sent')
                } catch (error) {
                    // Enhanced error handling with specific error types
                    flowLogger.error({ err: error, from: ctx.from, contextId, localPath }, 'Voice message processing failed')
                    console.error('  ❌ Error processing voice message:', error)

                    let userFriendlyMessage = '❌ Sorry, I encountered an error processing your voice message. Please try again or send a text message.'

                    if (error instanceof Error) {
                        const errorMsg = error.message.toLowerCase()

                        if (errorMsg.includes('openai') || errorMsg.includes('api') || errorMsg.includes('whisper')) {
                            userFriendlyMessage = '🔧 *Transcription Service Error*\n\nI\'m having trouble connecting to the transcription service. This is usually temporary.\n\nPlease try again in a few moments or send a text message instead.'
                        } else if (errorMsg.includes('file') || errorMsg.includes('download') || errorMsg.includes('save')) {
                            userFriendlyMessage = '📁 *File Download Error*\n\nI couldn\'t download the voice file properly. This might be due to:\n• Network connection issues\n• Voice file being too large\n• Temporary server issues\n\nPlease try sending the voice message again.'
                        } else if (errorMsg.includes('empty') || errorMsg.includes('size') || errorMsg.includes('invalid')) {
                            userFriendlyMessage = '📄 *Invalid Voice File*\n\nThe voice file appears to be corrupted or empty.\n\nPlease try recording and sending the voice message again.'
                        } else if (errorMsg.includes('format') || errorMsg.includes('audio')) {
                            userFriendlyMessage = '🎵 *Audio Format Error*\n\nI couldn\'t process the audio format of your voice message.\n\nPlease try sending a shorter voice message or use text instead.'
                        }
                    }

                    await flowDynamic(userFriendlyMessage)
                } finally {
                    // Clean up: delete the temporary voice file using utility
                    if (localPath) {
                        flowLogger.debug({ path: localPath }, 'Cleaning up temporary voice file')
                        await cleanupTempFile(localPath)
                    }
                }
            },
            2000 // 2 second debounce window for rapid uploads
        )
    }
)
