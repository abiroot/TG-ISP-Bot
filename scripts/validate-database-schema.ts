#!/usr/bin/env tsx
/**
 * Database Schema Validation Script
 * Ensures all table schemas match code expectations
 */

import { pool } from '../src/config/database.js'

interface ColumnInfo {
    column_name: string
    data_type: string
    is_nullable: string
}

const EXPECTED_SCHEMAS = {
    telegram_user_mapping: ['id', 'worker_username', 'telegram_id', 'telegram_handle', 'first_name', 'last_name', 'created_at', 'updated_at'],
    messages: ['id', 'message_id', 'context_id', 'context_type', 'direction', 'sender', 'recipient', 'content', 'media_url', 'media_type', 'media_content_type', 'media_size', 'status', 'error_message', 'metadata', 'created_at', 'is_bot_command', 'is_admin_command', 'command_name', 'deleted_at', 'is_deleted'],
    user_roles: ['id', 'user_telegram_id', 'role', 'assigned_by', 'assigned_at', 'notes', 'is_active', 'revoked_by', 'revoked_at', 'created_at', 'updated_at'],
    whitelisted_users: ['id', 'user_identifier', 'whitelisted_by', 'whitelisted_at', 'is_active', 'notes', 'created_at', 'updated_at'],
    whitelisted_groups: ['id', 'group_id', 'whitelisted_by', 'whitelisted_at', 'is_active', 'notes', 'created_at', 'updated_at'],
    personalities: ['id', 'context_id', 'context_type', 'bot_name', 'created_by', 'created_at', 'updated_at'],
    conversation_embeddings: ['id', 'context_id', 'context_type', 'chunk_text', 'embedding', 'message_ids', 'chunk_index', 'timestamp_start', 'timestamp_end', 'created_at', 'updated_at'],
    bot_state: ['key', 'value', 'updated_at'],
    tool_execution_audit: ['id', 'tool_name', 'tool_call_id', 'context_id', 'user_telegram_id', 'user_username', 'user_display_name', 'input_params', 'output_result', 'execution_status', 'error_message', 'started_at', 'completed_at', 'duration_ms', 'metadata', 'created_at'],
}

async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
    )
    return result.rows
}

async function validateSchema() {
    console.log('🔍 Validating database schema...\n')

    let hasErrors = false

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_SCHEMAS)) {
        try {
            const actualColumns = await getTableColumns(tableName)
            const actualColumnNames = actualColumns.map((c) => c.column_name)

            // Check for missing columns
            const missingColumns = expectedColumns.filter((col) => !actualColumnNames.includes(col))
            if (missingColumns.length > 0) {
                console.error(`❌ Table "${tableName}" is missing columns: ${missingColumns.join(', ')}`)
                hasErrors = true
            }

            // Check for extra columns
            const extraColumns = actualColumnNames.filter((col) => !expectedColumns.includes(col))
            if (extraColumns.length > 0) {
                console.warn(`⚠️  Table "${tableName}" has extra columns: ${extraColumns.join(', ')}`)
            }

            if (missingColumns.length === 0 && extraColumns.length === 0) {
                console.log(`✅ Table "${tableName}" schema is valid (${actualColumnNames.length} columns)`)
            }
        } catch (error) {
            console.error(`❌ Error checking table "${tableName}":`, error)
            hasErrors = true
        }
    }

    console.log('\n' + '='.repeat(50))
    if (hasErrors) {
        console.error('❌ Schema validation FAILED - please fix the errors above')
        process.exit(1)
    } else {
        console.log('✅ All table schemas are valid!')
    }
}

async function main() {
    try {
        await validateSchema()
    } catch (error) {
        console.error('Fatal error:', error)
        process.exit(1)
    } finally {
        await pool.end()
    }
}

main()
