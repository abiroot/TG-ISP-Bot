/**
 * Tool Execution Audit Schema
 *
 * TypeScript types for tool_execution_audit table
 * Tracks all tool executions for compliance and security auditing
 */

export type ToolExecutionStatus = 'success' | 'error' | 'timeout'

export interface ToolExecutionAudit {
    id: string
    tool_name: string
    tool_call_id: string | null
    context_id: string
    user_telegram_id: string
    user_username: string | null
    user_display_name: string | null
    input_params: Record<string, any>
    output_result: Record<string, any> | null
    execution_status: ToolExecutionStatus
    error_message: string | null
    started_at: Date
    completed_at: Date | null
    duration_ms: number | null
    metadata: Record<string, any>
    created_at: Date
}

export interface CreateToolExecutionAudit {
    tool_name: string
    tool_call_id?: string | null
    context_id: string
    user_telegram_id: string
    user_username?: string | null
    user_display_name?: string | null
    input_params: Record<string, any>
    output_result?: Record<string, any> | null
    execution_status: ToolExecutionStatus
    error_message?: string | null
    started_at: Date
    completed_at?: Date | null
    duration_ms?: number | null
    metadata?: Record<string, any>
}

export interface ToolExecutionAuditQuery {
    user_telegram_id?: string
    tool_name?: string
    context_id?: string
    execution_status?: ToolExecutionStatus
    start_date?: Date
    end_date?: Date
    limit?: number
    offset?: number
}

export interface ToolExecutionStats {
    tool_name: string
    total_executions: number
    successful_executions: number
    failed_executions: number
    avg_duration_ms: number
    last_execution: Date
}
