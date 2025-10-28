import { addKeyword, EVENTS } from '@builderbot/bot'
import { TwilioProvider as Provider } from '@builderbot/provider-twilio'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runUserMiddleware } from '~/middleware/pipeline'
import { aiService } from '~/services/aiService'
import { intentService } from '~/services/intentService'
import { botStateService } from '~/services/botStateService'
import { messageService } from '~/services/messageService'
import { personalityService } from '~/services/personalityService'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('welcome')

/**
 * Welcome flow - catches ALL incoming messages that don't match other keywords
 * Uses EVENTS.WELCOME which triggers when no other keyword matches
 * Now includes Langchain-based intent classification for intelligent routing
 * This is the official BuilderBot way to create a catch-all flow
 * Now uses centralized middleware pipeline for cleaner code
 */
export const welcomeFlow = addKeyword<Provider, Database>(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic, gotoFlow, state, endFlow, fallBack, blacklist, provider }) => {
        flowLogger.info({ from: ctx.from, body: ctx.body }, 'WELCOME flow triggered')

        // Note: Message logging now handled automatically by event listeners in app.ts

        // Check if personality exists BEFORE running middleware
        // This allows us to immediately route first-time users to setup
        const contextId = personalityService.getContextId(ctx.from)
        const personality = await personalityService.getPersonality(contextId)

        if (!personality) {
            flowLogger.info({ from: ctx.from }, 'First-time user detected - sending welcome and routing to setup flow')

            // Send welcome message immediately
            const welcomeMessage = '👋 Welcome! Let me get to know you better. This will only take a minute.\n\n' +
                '⏱️ _This setup will timeout after 5 minutes of inactivity._'
            await flowDynamic(welcomeMessage)

            // Log the welcome message
            try {
                const { MessageLogger } = await import('~/middleware/messageLogger')
                await MessageLogger.logOutgoing(contextId, ctx.from, welcomeMessage, undefined, {
                    method: 'first_time_welcome'
                })
            } catch (logError) {
                flowLogger.error({ err: logError }, 'Failed to log welcome message')
            }

            // Import and route to first-time user flow
            const { firstTimeUserFlow } = await import('~/flows/personality/firstTimeFlow')
            return gotoFlow(firstTimeUserFlow)
        }

        // Run centralized middleware pipeline (checks maintenance, rate limit, whitelist)
        // Note: We already have personality from above check
        const middlewareResult = await runUserMiddleware(ctx, { flowDynamic, gotoFlow, state, endFlow, fallBack, blacklist } as any)

        if (!middlewareResult.allowed) {
            flowLogger.debug({ from: ctx.from, reason: middlewareResult.reason }, 'Middleware check failed')
            return
        }

        // Use the personality we already fetched above
        flowLogger.debug({ from: ctx.from, botName: personality.bot_name }, 'All middleware checks passed')

        // Check if AI responses feature is enabled
        if (!(await botStateService.isFeatureEnabled('ai_responses'))) {
            flowLogger.warn({ from: ctx.from }, 'AI responses feature is disabled')
            await flowDynamic('⚠️ AI responses are currently disabled. Please contact an administrator.')
            return
        }

        try {
            // Fetch recent conversation history for AI context
            // NOTE: 10 messages = ~5 turns, provides better context for follow-up questions
            // Each message may contain tool call metadata for proper context reconstruction
            // The AI service will reconstruct complete tool history from these messages
            const contextId = personalityService.getContextId(ctx.from)
            const startTime = Date.now()
            const recentMessages = await messageService.getLastMessages(contextId, 10)
            const historyFetchTime = Date.now() - startTime

            flowLogger.debug(
                { contextId, messageCount: recentMessages.length, durationMs: historyFetchTime },
                'Fetched conversation history with tool metadata'
            )

            // 🎯 LANGCHAIN INTENT CLASSIFICATION
            const intentStartTime = Date.now()
            const intentResult = await intentService.classifyIntent(ctx.body, recentMessages)
            const intentDurationMs = Date.now() - intentStartTime

            flowLogger.info(
                {
                    intent: intentResult.intention,
                    confidence: intentResult.confidence,
                    durationMs: intentDurationMs
                },
                'Intent classified'
            )

            // Route based on intent classification
            if (intentResult.confidence >= 0.7) {
                switch (intentResult.intention) {
                    case 'USER_INFO':
                    case 'ACCOUNT_STATUS':
                    case 'TECHNICAL_SUPPORT':
                    case 'BILLING_QUERY':
                    case 'NETWORK_INFO': {
                        // Check if message contains a phone number - if yes, route to user info flow
                        // If no phone number, let AI handle it with conversation context
                        const { ispApiService } = await import('~/services/ispApiService')
                        const hasPhoneNumber = ispApiService.extractPhoneNumberFromMessage(ctx.body, ctx.from)

                        if (hasPhoneNumber) {
                            flowLogger.info({ from: ctx.from, intent: intentResult.intention, phoneNumber: hasPhoneNumber }, 'Phone number detected - routing to user info flow')
                            // Import and route to user info flow
                            const { userInfoFlow } = await import('~/flows/isp/userInfoFlow')
                            return gotoFlow(userInfoFlow)
                        } else {
                            flowLogger.info({ from: ctx.from, intent: intentResult.intention }, 'No phone number in follow-up question - using AI with context')
                            // Fall through to AI response for follow-up questions
                            break
                        }
                    }

                    case 'GREETING': {
                        flowLogger.info({ from: ctx.from }, 'Handling greeting intent')
                        const greetingResponse = `Hello! 👋 I'm ${personality.bot_name}, your ISP Support assistant.\n\n` +
                            `I can help you:\n` +
                            `📞 Look up customer information by phone number\n` +
                            `🔍 Check account status and online status\n` +
                            `🌐 View network details and connection info\n` +
                            `💰 Check billing and account expiry\n` +
                            `📡 Provide technical support details\n\n` +
                            `How can I help you today?`
                        await flowDynamic(greetingResponse)

                        // Log the greeting response
                        try {
                            const { MessageLogger } = await import('~/middleware/messageLogger')
                            await MessageLogger.logOutgoing(contextId, ctx.from, greetingResponse, undefined, {
                                method: 'greeting_intent',
                                intent_classification: { intent: 'GREETING', confidence: intentResult.confidence }
                            })
                        } catch (logError) {
                            flowLogger.error({ err: logError }, 'Failed to log greeting response')
                        }
                        return
                    }

                    case 'APPRECIATION': {
                        flowLogger.info({ from: ctx.from }, 'Handling appreciation intent')
                        const appreciationResponse = `You're welcome! 😊\n\n` +
                            `I'm always here to help with any customer information or technical support you need.\n\n` +
                            `Is there anything else I can assist you with?`
                        await flowDynamic(appreciationResponse)

                        // Log the appreciation response
                        try {
                            const { MessageLogger } = await import('~/middleware/messageLogger')
                            await MessageLogger.logOutgoing(contextId, ctx.from, appreciationResponse, undefined, {
                                method: 'appreciation_intent',
                                intent_classification: { intent: 'APPRECIATION', confidence: intentResult.confidence }
                            })
                        } catch (logError) {
                            flowLogger.error({ err: logError }, 'Failed to log appreciation response')
                        }
                        return
                    }

                    case 'HELP': {
                        flowLogger.info({ from: ctx.from }, 'Handling help intent')
                        const helpResponse = `🤖 *How to use ${personality.bot_name}:*\n\n` +
                            `📞 *Customer Info:* "Check +1234567890" or "Get info for 555-1234"\n` +
                            `📊 *Account Status:* "Is customer +1234567890 online?"\n` +
                            `🌐 *Technical Support:* "What's the IP for +1234567890?"\n` +
                            `💰 *Billing Query:* "Check billing for +1234567890"\n` +
                            `📡 *Network Info:* "What are the speeds for +1234567890?"\n\n` +
                            `Simply provide a phone number with your query, and I'll fetch the information!`
                        await flowDynamic(helpResponse)

                        // Log the help response
                        try {
                            const { MessageLogger } = await import('~/middleware/messageLogger')
                            await MessageLogger.logOutgoing(contextId, ctx.from, helpResponse, undefined, {
                                method: 'help_intent',
                                intent_classification: { intent: 'HELP', confidence: intentResult.confidence }
                            })
                        } catch (logError) {
                            flowLogger.error({ err: logError }, 'Failed to log help response')
                        }
                        return
                    }

                    // For CUSTOMER_SEARCH and other intents, fall through to AI response
                }
            }

            // For UNKNOWN, QUERY, or low confidence intents: Use tool-enabled RAG AI response
            flowLogger.debug({ from: ctx.from }, 'Using tool-enabled RAG AI response for query/unknown intent')

            const aiStartTime = Date.now()
            // Use tool-enabled RAG response for best experience
            const response = await aiService.generateResponseWithToolsAndRAG(
                contextId,
                ctx.from, // userPhone
                ctx.name, // userName
                ctx.body,
                personality,
                recentMessages
            )
            const aiDurationMs = Date.now() - aiStartTime

            flowLogger.info(
                { contextId, durationMs: aiDurationMs, responseLength: response.length },
                'Tool-enabled RAG AI response generated'
            )

            // Send response with slight delay for natural conversation feel
            await flowDynamic(response, { delay: 300 })

            // Manually log the outgoing AI response
            try {
                const { MessageLogger } = await import('~/middleware/messageLogger')
                await MessageLogger.logOutgoing(contextId, ctx.from, response, undefined, {
                    method: 'ai_response',
                    ai_model: 'gpt-4o-mini',
                    response_time_ms: aiDurationMs,
                    intent_classification: {
                        intent: intentResult.intention,
                        confidence: intentResult.confidence
                    }
                })
                flowLogger.debug({ contextId, responseLength: response.length }, 'Logged AI response to database')
            } catch (logError) {
                flowLogger.error({ err: logError, contextId }, 'Failed to log AI response')
            }
        } catch (error) {
            flowLogger.error({ err: error, from: ctx.from }, 'Error generating AI response')
            const errorMsg = '❌ Sorry, I encountered an error processing your message. Please try again.'
            await flowDynamic(errorMsg)

            // Log the error response
            try {
                const { MessageLogger } = await import('~/middleware/messageLogger')
                await MessageLogger.logOutgoing(contextId, ctx.from, errorMsg, undefined, {
                    method: 'error_response',
                    error: error.message || 'Unknown error'
                })
            } catch (logError) {
                flowLogger.error({ err: logError }, 'Failed to log error response')
            }
        }
    })
