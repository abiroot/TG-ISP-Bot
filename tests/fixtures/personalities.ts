/**
 * Personality Fixtures
 *
 * Test bot personalities for different contexts (groups/private)
 */

import type { Personality, ContextType } from '~/database/schemas/personality'

/**
 * Private chat personality (ISP support bot)
 */
export const privatePersonality: Personality = {
    id: '1',
    context_id: '+1234567890',
    context_type: 'private' as ContextType,
    bot_name: 'ISP Support Assistant',
    created_by: '+1234567890',
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
}

/**
 * Group chat personality (ISP team support)
 */
export const groupPersonality: Personality = {
    id: '2',
    context_id: '-1001234567890',
    context_type: 'group' as ContextType,
    bot_name: 'Team ISP Bot',
    created_by: '+9876543210',
    created_at: new Date('2025-01-05T00:00:00Z'),
    updated_at: new Date('2025-01-10T00:00:00Z'),
}

/**
 * Admin personality (full access)
 */
export const adminPersonality: Personality = {
    id: '3',
    context_id: '+admin123456',
    context_type: 'private' as ContextType,
    bot_name: 'Admin Control Bot',
    created_by: '+admin123456',
    created_at: new Date('2024-12-01T00:00:00Z'),
    updated_at: new Date('2025-01-15T00:00:00Z'),
}

/**
 * Test personality (for general testing)
 */
export const testPersonality: Personality = {
    id: 'test-personality-1',
    context_id: 'test-context-1',
    context_type: 'private' as ContextType,
    bot_name: 'Test Bot',
    created_by: 'test-user',
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-01T00:00:00Z'),
}

/**
 * All test personalities
 */
export const allPersonalities: Personality[] = [
    privatePersonality,
    groupPersonality,
    adminPersonality,
    testPersonality,
]

/**
 * Helper: Find personality by context ID
 */
export function findPersonality(contextId: string): Personality | undefined {
    return allPersonalities.find((p) => p.context_id === contextId)
}
