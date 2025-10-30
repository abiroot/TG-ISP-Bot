import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { personalityService } from '~/services/personalityService'
import { createFlowLogger } from '~/utils/logger'

const log = createFlowLogger('locationFlow')

/**
 * Handles location messages from Telegram users
 * Uses EVENTS.LOCATION which triggers when a location is received
 */
export const locationFlow = addKeyword<TelegramProvider, Database>(EVENTS.LOCATION).addAction(
    async (ctx, { flowDynamic, state, extensions }) => {
        try {
            log.info({ from: ctx.from }, 'Location received')

            const { messageService } = extensions
            const personality = await personalityService.getPersonality(ctx.from)

            log.debug({ from: ctx.from, botName: personality.bot_name }, 'Personality found')

            // Debug: Check available message paths
            log.debug({
                hasMessage: !!ctx.message,
                messageKeys: ctx.message ? Object.keys(ctx.message) : [],
                hasMessageCtx: !!ctx.messageCtx,
                hasLocationMessage: !!ctx.message?.locationMessage,
                hasLocation: !!ctx.message?.location,
            }, 'Message structure analysis')

            // Extract location data - try multiple possible paths
            let locationData = null

            if (ctx.message?.locationMessage) {
                locationData = ctx.message.locationMessage
                log.debug('Found location data in ctx.message.locationMessage')
            } else if (ctx.message?.location) {
                locationData = ctx.message.location
                log.debug('Found location data in ctx.message.location')
            } else if (ctx.messageCtx?.update?.message?.location) {
                locationData = ctx.messageCtx.update.message.location
                log.debug('Found location data in ctx.messageCtx.update.message.location')
            } else if (ctx.messageCtx?.update?.message?.locationMessage) {
                locationData = ctx.messageCtx.update.message.locationMessage
                log.debug('Found location data in ctx.messageCtx.update.message.locationMessage')
            }

            if (!locationData) {
                log.error({
                    messageKeys: ctx.message ? Object.keys(ctx.message) : 'no message',
                    body: ctx.body,
                    from: ctx.from
                }, 'No location data found in context')
                await flowDynamic('❌ Sorry, I couldn\'t read the location data. Please try sending the location again.')
                return
            }

            const latitude = locationData.degreesLatitude || locationData.latitude
            const longitude = locationData.degreesLongitude || locationData.longitude
            const locationName = locationData.name
            const address = locationData.address

            // Log the location message with enhanced metadata
            await messageService.logIncomingMessage(ctx, {
                media_type: 'location',
                metadata: {
                    latitude,
                    longitude,
                    location_name: locationName,
                    address,
                    location_shared_at: new Date().toISOString(),
                    coordinate_precision: `${latitude.toString().split('.')[1]?.length || 0}, ${longitude.toString().split('.')[1]?.length || 0}`,
                }
            })

            // Store location in conversation state if needed
            await state.update({
                userLocation: {
                    latitude,
                    longitude,
                    name: locationName,
                    address: address,
                    timestamp: new Date().toISOString(),
                }
            })

            // Check if there's an ongoing location update conversation
            const lastQueriedUsername = state.get('lastQueriedUsername')
            const awaitingLocation = state.get('awaitingLocation')

            if (awaitingLocation && lastQueriedUsername) {
                // User is providing location for a specific user update
                log.info({ username: lastQueriedUsername, latitude, longitude }, 'Processing location update for specific user')

                try {
                    const { ispApiService } = await import('~/services/ispApiService')
                    const result = await ispApiService.updateUserLocation(lastQueriedUsername, latitude, longitude)

                    if (result.success) {
                        await flowDynamic(
                            `✅ **Location Updated Successfully!**\n\n` +
                            `👤 **User:** ${lastQueriedUsername}\n` +
                            `📍 **Coordinates:** ${latitude}, ${longitude}\n` +
                            (locationName ? `🏢 **Place:** ${locationName}\n` : '') +
                            (address ? `📍 **Address:** ${address}` : '') +
                            `\nThe user's location has been updated in the ISP system.`
                        )
                    } else {
                        await flowDynamic(
                            `❌ **Location Update Failed**\n\n` +
                            `👤 **User:** ${lastQueriedUsername}\n` +
                            `📍 **Coordinates:** ${latitude}, ${longitude}\n\n` +
                            `**Error:** ${result.error || 'Unknown error occurred'}`
                        )
                    }
                } catch (error) {
                    log.error({ error: error.message }, 'Failed to update user location')
                    await flowDynamic('❌ Sorry, I encountered an error updating the location. Please try again.')
                }

                // Clear the awaiting location state
                await state.update({ awaitingLocation: false })
                return
            }

            // If no ongoing location update, just acknowledge and offer to help with location updates
            await flowDynamic(
                `📍 **Location Received!**\n\n` +
                `📊 **Coordinates:** ${latitude}, ${longitude}\n` +
                (locationName ? `🏢 **Place:** ${locationName}\n` : '') +
                (address ? `📍 **Address:** ${address}\n` : '') +
                `\n✅ **These coordinates are now ready to use!** You can ask me to:\n` +
                `• "Update location for acc"\n` +
                `• "We have 5 users at this location"\n` +
                `• "Set josianeyoussef's location here"\n` +
                `• "Update location for jhonnyacc2"\n\n` +
                `🔄 The coordinates (${latitude}, ${longitude}) will be used automatically for location updates.`
            )

        } catch (error) {
            log.error({ error: error.message, from: ctx.from }, 'Error handling location message')
            await flowDynamic('Sorry, I had trouble processing your location. Please try again.')
        }
    }
)