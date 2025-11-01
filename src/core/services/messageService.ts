import { messageRepository } from '~/database/repositories/messageRepository'
import { CreateMessage, Message, MessageDirection } from '~/database/schemas/message'
import { isAdmin } from '~/config/admins'
import { v4 as uuidv4 } from 'uuid'
import { getContextId, getContextType } from '~/core/utils/contextId'

export class MessageService {
    /**
     * Get context ID from user identifier
     */
    private getContextId(from: string | number): string {
        return getContextId(from)
    }

    /**
     * Get context type (group or private)
     */
    private getContextType(from: string | number): 'group' | 'private' {
        return getContextType(from)
    }

    /**
     * Log an incoming message
     */
    async logIncomingMessage(ctx: any, metadata?: Record<string, any>): Promise<Message> {
        const contextId = this.getContextId(ctx.from)
        const contextType = this.getContextType(ctx.from)

        // Check if message is a command
        const messageBody = (ctx.body || '').trim().toLowerCase()
        const isBotCommand = this.isBotCommand(messageBody)
        const isAdminCommand = isBotCommand && isAdmin(ctx.from)
        const commandName = isBotCommand ? this.extractCommandName(messageBody) : undefined

        const messageData: CreateMessage = {
            message_id: ctx.id || uuidv4(), // Use provider ID or generate one
            context_id: contextId,
            context_type: contextType,
            direction: 'incoming',
            sender: ctx.from,
            content: ctx.body || undefined,
            status: 'received' as any, // Will default to 'sent' but we can update schema if needed
            is_bot_command: isBotCommand,
            is_admin_command: isAdminCommand,
            command_name: commandName,
            metadata: {
                ...metadata,
                name: ctx.name,
                pushName: ctx.pushName,
                raw: ctx,
            },
        }

        // Check for duplicate messages
        if (ctx.id && (await messageRepository.exists(ctx.id))) {
            console.log(`⚠️  Duplicate message detected: ${ctx.id}`)
            return (await messageRepository.getByMessageId(ctx.id))!
        }

        return await messageRepository.create(messageData)
    }

    /**
     * Log an outgoing message sent by the bot
     */
    async logOutgoingMessage(
        contextId: string,
        recipient: string,
        content: string,
        messageId?: string,
        metadata?: Record<string, any>
    ): Promise<Message> {
        const contextType = this.getContextType(contextId)

        const messageData: CreateMessage = {
            message_id: messageId || uuidv4(),
            context_id: contextId,
            context_type: contextType,
            direction: 'outgoing',
            sender: 'bot', // Bot is the sender
            recipient: recipient,
            content: content,
            status: 'sent',
            metadata: metadata || {},
        }

        return await messageRepository.create(messageData)
    }

    /**
     * Log an outgoing media message
     */
    async logOutgoingMediaMessage(
        contextId: string,
        recipient: string,
        content: string | undefined,
        mediaUrl: string,
        mediaType: string,
        messageId?: string,
        metadata?: Record<string, any>
    ): Promise<Message> {
        const contextType = this.getContextType(contextId)

        const messageData: CreateMessage = {
            message_id: messageId || uuidv4(),
            context_id: contextId,
            context_type: contextType,
            direction: 'outgoing',
            sender: 'bot',
            recipient: recipient,
            content: content,
            media_url: mediaUrl,
            media_type: mediaType as any,
            status: 'sent',
            metadata: metadata || {},
        }

        return await messageRepository.create(messageData)
    }

    /**
     * Update message status
     */
    async updateMessageStatus(
        messageId: string,
        status: 'sent' | 'delivered' | 'read' | 'failed',
        errorMessage?: string
    ): Promise<Message | null> {
        return await messageRepository.update(messageId, {
            status,
            error_message: errorMessage,
        })
    }

    /**
     * Get conversation history
     */
    async getConversationHistory(contextId: string, limit = 100, offset = 0): Promise<Message[]> {
        return await messageRepository.getConversationHistory({
            context_id: contextId,
            limit,
            offset,
        })
    }

    /**
     * Get last N messages from conversation
     */
    async getLastMessages(contextId: string, count = 10): Promise<Message[]> {
        const messages = await messageRepository.getConversationHistory({
            context_id: contextId,
            limit: count,
        })
        // Reverse to get chronological order
        return messages.reverse()
    }

    /**
     * Get message statistics for a context
     */
    async getMessageStats(contextId: string) {
        return await messageRepository.getMessageStats(contextId)
    }

    /**
     * Check if a message is a bot command
     */
    private isBotCommand(message: string): boolean {
        const commandPrefixes = [
            'whitelist',
            'remove',
            'list',
            'update personality',
            '/whitelist',
            '/remove',
            '/list',
            '/update',
        ]
        return commandPrefixes.some((prefix) => message.startsWith(prefix))
    }

    /**
     * Extract command name from message
     */
    private extractCommandName(message: string): string {
        // Remove leading slash if present
        const cleanMessage = message.startsWith('/') ? message.substring(1) : message

        // Get first word as command name
        const words = cleanMessage.split(/\s+/)
        return words.length > 1 ? `${words[0]} ${words[1]}` : words[0]
    }

    /**
     * Search messages by content
     */
    async searchMessages(contextId: string, query: string, limit = 50): Promise<Message[]> {
        const result = await messageRepository.findByFilter({
            context_id: contextId,
            limit,
        })

        // Filter by content (simple contains search)
        return result.filter((msg) => msg.content && msg.content.toLowerCase().includes(query.toLowerCase()))
    }

    /**
     * Get failed messages for monitoring
     */
    async getFailedMessages(contextId?: string, limit = 50): Promise<Message[]> {
        return await messageRepository.getFailedMessages(contextId, limit)
    }

    /**
     * Store AI response with complete tool execution metadata
     * Enables proper conversation history reconstruction for context-aware responses
     *
     * @param contextId - Conversation context identifier
     * @param userPhone - User's phone number
     * @param result - GenerateTextResult from AI SDK v5
     * @returns Created message with tool metadata
     */
    async storeAIResponseWithTools(contextId: string, userPhone: string, result: any): Promise<Message> {
        const contextType = this.getContextType(contextId)

        // Extract ALL tool calls from ALL steps (not just final step)
        // AI SDK v5 stores tool calls in result.steps[].toolCalls, NOT in result.toolCalls
        const allToolCalls = result.steps?.flatMap((step: any) => step.toolCalls || []) || []
        const allToolResults = result.steps?.flatMap((step: any) => step.toolResults || []) || []

        const metadata = {
            // Store complete response.messages array (AI SDK v5 format)
            // This contains the full conversation including tool-call and tool-result messages
            // Critical for proper conversation history reconstruction
            response_messages: result.response.messages || [],

            // Legacy format for backward compatibility - extract from ALL steps
            tool_calls: allToolCalls.map((tc: any) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
            })),

            tool_results: allToolResults.map((tr: any) => ({
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: tr.output,
            })),

            steps: result.steps?.map((step: any) => ({
                text: step.text,
                toolCallCount: step.toolCalls?.length || 0,
                finishReason: step.finishReason,
                usage: step.usage,
            })),

            usage: result.usage,
            generated_at: new Date().toISOString(),
        }

        const messageData: CreateMessage = {
            message_id: uuidv4(),
            context_id: contextId,
            context_type: contextType,
            direction: 'outgoing',
            sender: 'bot',
            recipient: userPhone,
            content: result.text,
            status: 'sent',
            metadata,
        }

        return await messageRepository.create(messageData)
    }

    /**
     * Reconstruct conversation history in AI SDK v5 ModelMessage format
     * Includes tool-call and tool-result messages for proper context
     *
     * @param contextId - Conversation context identifier
     * @param limit - Number of messages to retrieve (default: 6 for 3 turns)
     * @returns Array of ModelMessage compatible with AI SDK v5
     */
    async reconstructConversationHistory(contextId: string, limit = 6): Promise<any[]> {
        try {
            const messages = await this.getLastMessages(contextId, limit)
            const modelMessages: any[] = []

            for (const msg of messages) {
                try {
                    if (msg.direction === 'incoming') {
                        let content = msg.content || ''

                        // Include location data in conversation history if available in metadata
                        const metadata = msg.metadata || {}

                        // Check for location data in both direct metadata and nested metadata
                        const locationData = metadata.latitude && metadata.longitude ?
                            metadata :
                            (metadata.metadata ? metadata.metadata : null)

                        if (locationData && locationData.latitude && locationData.longitude) {
                            const locationInfo = [
                                `📍 Location shared: ${locationData.latitude}, ${locationData.longitude}`,
                                locationData.location_name ? `🏢 Place: ${locationData.location_name}` : null,
                                locationData.address ? `📍 Address: ${locationData.address}` : null,
                            ].filter(Boolean).join('\n')

                            // For location messages, replace the event ID content with actual location info
                            if (metadata.media_type === 'location' && content.startsWith('_event_location_')) {
                                content = locationInfo
                            } else {
                                // Prepend location info to content or use as content if empty
                                content = locationInfo + (content ? `\n\n${content}` : '')
                            }
                        }

                        modelMessages.push({
                            role: 'user',
                            content: content,
                        })
                    } else {
                        const metadata = msg.metadata || {}

                        // Use response.messages if available (preferred)
                        if (metadata.response_messages && Array.isArray(metadata.response_messages)) {
                            modelMessages.push(...metadata.response_messages)
                            continue
                        }

                        // Fallback to old format for backward compatibility
                        if (metadata.tool_calls && metadata.tool_calls.length > 0) {
                            modelMessages.push({
                                role: 'assistant',
                                content: metadata.tool_calls.map((tc: any) => ({
                                    type: 'tool-call',
                                    toolCallId: tc.toolCallId,
                                    toolName: tc.toolName,
                                    args: tc.input,
                                })),
                            })

                            if (metadata.tool_results && metadata.tool_results.length > 0) {
                                modelMessages.push({
                                    role: 'tool',
                                    content: metadata.tool_results.map((tr: any) => ({
                                        type: 'tool-result',
                                        toolCallId: tr.toolCallId,
                                        toolName: tr.toolName,
                                        output: tr.output,
                                    })),
                                })
                            }
                        }

                        if (msg.content) {
                            modelMessages.push({
                                role: 'assistant',
                                content: msg.content,
                            })
                        }
                    }
                } catch (msgError) {
                    console.warn(`⚠️  Error processing message ${msg.id} in history:`, msgError)
                }
            }

            return modelMessages
        } catch (error) {
            console.error(`❌ Failed to reconstruct conversation history for ${contextId}:`, error)
            return []
        }
    }

    /**
     * Extract context from last tool call (fallback if full history fails)
     * Useful for debugging and as safety net
     *
     * @param contextId - Conversation context identifier
     * @returns Last tool call context or null
     */
    async getLastToolContext(contextId: string): Promise<any | null> {
        const messages = await this.getLastMessages(contextId, 10)

        // Find last message with tool calls
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (msg.metadata?.tool_calls && msg.metadata.tool_calls.length > 0) {
                const lastToolCall = msg.metadata.tool_calls[0]
                return {
                    toolName: lastToolCall.toolName,
                    input: lastToolCall.input,
                    timestamp: msg.metadata.generated_at || msg.created_at,
                    messageId: msg.id,
                }
            }
        }

        return null
    }
}

// Export singleton instance
export const messageService = new MessageService()
