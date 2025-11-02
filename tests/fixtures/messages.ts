/**
 * Message Fixtures
 *
 * Sample conversation history for testing RAG and context-aware responses
 */

import type { Message, MessageDirection, MessageStatus, MessageContextType } from '~/database/schemas/message'

/**
 * Sample conversation: Customer lookup
 */
export const customerLookupConversation: Message[] = [
    {
        id: 'msg-1',
        message_id: 'telegram-msg-1',
        context_id: '+1234567890',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: '+1234567890',
        recipient: 'bot',
        content: 'Hello, I need help checking a customer',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Test User' },
        created_at: new Date('2025-11-02T10:00:00Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-2',
        message_id: 'telegram-msg-2',
        context_id: '+1234567890',
        context_type: 'private' as MessageContextType,
        direction: 'outgoing' as MessageDirection,
        sender: 'bot',
        recipient: '+1234567890',
        content: 'Hello! I can help you look up customer information. Please provide a phone number or username.',
        status: 'sent' as MessageStatus,
        metadata: { bot_name: 'ISP Support Assistant' },
        created_at: new Date('2025-11-02T10:00:05Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-3',
        message_id: 'telegram-msg-3',
        context_id: '+1234567890',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: '+1234567890',
        recipient: 'bot',
        content: 'josianeyoussef',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Test User' },
        created_at: new Date('2025-11-02T10:00:15Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-4',
        message_id: 'telegram-msg-4',
        context_id: '+1234567890',
        context_type: 'private' as MessageContextType,
        direction: 'outgoing' as MessageDirection,
        sender: 'bot',
        recipient: '+1234567890',
        content: '<b>User Details:</b>\nName: Josiane Youssef\nStatus: 🟢 Online\nAccount: Active',
        status: 'sent' as MessageStatus,
        metadata: { bot_name: 'ISP Support Assistant' },
        created_at: new Date('2025-11-02T10:00:20Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
]

/**
 * Sample conversation: Location update
 */
export const locationUpdateConversation: Message[] = [
    {
        id: 'msg-5',
        message_id: 'telegram-msg-5',
        context_id: '+9876543210',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: '+9876543210',
        recipient: 'bot',
        content: 'Update location for josianeyoussef to 33.8938, 35.5018',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Admin User' },
        created_at: new Date('2025-11-02T11:00:00Z'),
        is_bot_command: false,
        is_admin_command: true,
        is_deleted: false,
    },
    {
        id: 'msg-6',
        message_id: 'telegram-msg-6',
        context_id: '+9876543210',
        context_type: 'private' as MessageContextType,
        direction: 'outgoing' as MessageDirection,
        sender: 'bot',
        recipient: '+9876543210',
        content: 'Location updated successfully for customer josianeyoussef',
        status: 'sent' as MessageStatus,
        metadata: { bot_name: 'Admin Control Bot' },
        created_at: new Date('2025-11-02T11:00:05Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
]

/**
 * Sample conversation: General AI chat
 */
export const generalChatConversation: Message[] = [
    {
        id: 'msg-7',
        message_id: 'telegram-msg-7',
        context_id: 'test-context-1',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: 'test-user',
        recipient: 'bot',
        content: 'Hello bot!',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Test User' },
        created_at: new Date('2025-11-02T12:00:00Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-8',
        message_id: 'telegram-msg-8',
        context_id: 'test-context-1',
        context_type: 'private' as MessageContextType,
        direction: 'outgoing' as MessageDirection,
        sender: 'bot',
        recipient: 'test-user',
        content: 'Hello! How can I help you today?',
        status: 'sent' as MessageStatus,
        metadata: { bot_name: 'Test Bot' },
        created_at: new Date('2025-11-02T12:00:03Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-9',
        message_id: 'telegram-msg-9',
        context_id: 'test-context-1',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: 'test-user',
        recipient: 'bot',
        content: 'What can you do?',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Test User' },
        created_at: new Date('2025-11-02T12:00:10Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
    {
        id: 'msg-10',
        message_id: 'telegram-msg-10',
        context_id: 'test-context-1',
        context_type: 'private' as MessageContextType,
        direction: 'outgoing' as MessageDirection,
        sender: 'bot',
        recipient: 'test-user',
        content: 'I can help you with ISP customer lookups, account status checks, technical support, and more!',
        status: 'sent' as MessageStatus,
        metadata: { bot_name: 'Test Bot' },
        created_at: new Date('2025-11-02T12:00:15Z'),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
    },
]

/**
 * All test conversations
 */
export const allConversations = {
    customerLookup: customerLookupConversation,
    locationUpdate: locationUpdateConversation,
    generalChat: generalChatConversation,
}

/**
 * Helper: Get conversation history by context ID
 */
export function getConversationHistory(contextId: string): Message[] {
    const allMessages = [
        ...customerLookupConversation,
        ...locationUpdateConversation,
        ...generalChatConversation,
    ]
    return allMessages.filter((msg) => msg.context_id === contextId)
}

/**
 * Helper: Create a test message
 */
export function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: `msg-${Date.now()}`,
        message_id: `telegram-msg-${Date.now()}`,
        context_id: 'test-context',
        context_type: 'private' as MessageContextType,
        direction: 'incoming' as MessageDirection,
        sender: 'test-user',
        recipient: 'bot',
        content: 'Test message',
        status: 'delivered' as MessageStatus,
        metadata: { from_name: 'Test User' },
        created_at: new Date(),
        is_bot_command: false,
        is_admin_command: false,
        is_deleted: false,
        ...overrides,
    }
}
