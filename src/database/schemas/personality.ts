export type ContextType = 'group' | 'private'

export interface Personality {
    id: string
    context_id: string
    context_type: ContextType
    bot_name: string
    created_by: string
    created_at: Date
    updated_at: Date
}

export interface CreatePersonality {
    context_id: string
    context_type: ContextType
    bot_name: string
    created_by: string
}

export interface UpdatePersonality {
    bot_name?: string
}
