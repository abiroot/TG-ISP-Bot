export type MessageDirection = 'incoming' | 'outgoing'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'queued'
export type MessageContextType = 'group' | 'private'
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact'

export interface Message {
    id: string
    message_id: string
    context_id: string
    context_type: MessageContextType
    direction: MessageDirection
    sender: string
    recipient?: string
    content?: string
    media_url?: string
    media_type?: MediaType
    media_content_type?: string
    media_size?: number
    status: MessageStatus
    error_message?: string
    metadata: Record<string, any>
    created_at: Date
    delivered_at?: Date
    read_at?: Date
    reply_to_message_id?: string
    is_bot_command: boolean
    is_admin_command: boolean
    command_name?: string
    deleted_at?: Date
    is_deleted: boolean
}

export interface CreateMessage {
    message_id: string
    context_id: string
    context_type: MessageContextType
    direction: MessageDirection
    sender: string
    recipient?: string
    content?: string
    media_url?: string
    media_type?: MediaType
    media_content_type?: string
    media_size?: number
    status?: MessageStatus
    error_message?: string
    metadata?: Record<string, any>
    reply_to_message_id?: string
    is_bot_command?: boolean
    is_admin_command?: boolean
    command_name?: string
}

export interface UpdateMessage {
    status?: MessageStatus
    error_message?: string
    delivered_at?: Date
    read_at?: Date
    metadata?: Record<string, any>
}

export interface MessageFilter {
    context_id?: string
    sender?: string
    direction?: MessageDirection
    status?: MessageStatus
    context_type?: MessageContextType
    is_bot_command?: boolean
    is_admin_command?: boolean
    has_media?: boolean
    from_date?: Date
    to_date?: Date
    limit?: number
    offset?: number
}

export interface ConversationHistoryOptions {
    context_id: string
    limit?: number
    offset?: number
    before_date?: Date
    after_date?: Date
    include_deleted?: boolean
}
