export interface WhitelistedGroup {
    id: string
    group_id: string
    whitelisted_by: string
    whitelisted_at: Date
    is_active: boolean
    notes?: string
    created_at: Date
    updated_at: Date
}

export interface WhitelistedUser {
    id: string
    user_identifier: string
    whitelisted_by: string
    whitelisted_at: Date
    is_active: boolean
    notes?: string
    created_at: Date
    updated_at: Date
}

export interface CreateWhitelistedGroup {
    group_id: string
    whitelisted_by: string
    notes?: string
}

export interface CreateWhitelistedUser {
    user_identifier: string
    whitelisted_by: string
    notes?: string
}
