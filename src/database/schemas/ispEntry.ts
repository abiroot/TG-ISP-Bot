/**
 * ISP Query Schema
 * Represents customer data queries and API responses for analytics and caching
 */

export type QueryType = 'customer_info' | 'usage_status' | 'account_details' | 'connection_info'

export interface IspQuery {
    id: string
    user_phone: string // Security: Who made this query
    context_id: string // Group or private chat context
    query_type: QueryType
    customer_id?: string // ISP customer ID that was looked up
    phone_number?: string // Phone number that was searched
    query_description: string // What the user asked for
    api_response: Record<string, any> // ISP API response data
    response_time_ms: number // How long the API call took
    query_date: Date
    created_at: Date
}

export interface CreateIspQuery {
    user_phone: string
    context_id: string
    query_type: QueryType
    customer_id?: string
    phone_number?: string
    query_description: string
    api_response: Record<string, any>
    response_time_ms: number
    query_date?: string | Date
}

export interface IspQueryFilter {
    user_phone: string // REQUIRED for security
    query_type?: QueryType
    customer_id?: string
    phone_number?: string
    start_date?: string | Date
    end_date?: string | Date
    limit?: number
    offset?: number
}

/**
 * Analytics Types
 */
export interface QuerySummary {
    query_type: QueryType
    query_count: number
    avg_response_time_ms: number
    unique_customers_queried: number
}

export interface MonthlySummary {
    total_queries: number
    avg_response_time_ms: number
    most_queried_customers: Array<{
        customer_id: string
        query_count: number
    }>
    query_type_distribution: Record<QueryType, number>
}

/**
 * ISP API Response Types
 */
export interface CustomerInfoResponse {
    id: number
    userName: string
    firstName: string
    lastName: string
    mobile: string
    phone: string
    mailAddress: string
    address: string
    comment: string
    creationDate: string
    mof: string
    userCategoryId: number
    accountPrice: number
    discount: number
    lastLogin: string
    financialCategoryId: number
    userGroupId: number
    archived: boolean
    lastLogOut: string
    linkId: number
    activatedAccount: boolean
    expiryAccount: string
    staticIP: string
    ipAddress: string
    macAddress: string
    nasHost: string
    online: boolean
    active: boolean
    blocked: boolean
    fupMode: string
    accountTypeName: string
    basicSpeedUp: number
    basicSpeedDown: number
    collectorId: number
    collectorUserName: string
    collectorFirstName: string
    collectorLastName: string
    collectorMobile: string
    stationOnline: boolean
    accessPointOnline: boolean
}