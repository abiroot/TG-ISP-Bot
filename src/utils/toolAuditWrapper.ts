/**
 * Tool Audit Wrapper Utility
 *
 * Higher-order function to wrap AI SDK tools with automatic audit logging
 * Tracks all tool executions for compliance and security monitoring
 */

import { tool } from 'ai'
import type { CoreTool } from 'ai'
import { toolExecutionAuditService } from '~/services/toolExecutionAuditService'
import { createFlowLogger } from '~/utils/logger'
import type { ToolExecutionContext } from '~/services/ispToolsService'

const logger = createFlowLogger('tool-audit-wrapper')

/**
 * Wrap an AI SDK tool with automatic audit logging
 *
 * @param toolName - Name of the tool for audit logging
 * @param toolDefinition - AI SDK tool definition
 * @returns Wrapped tool with audit logging
 *
 * @example
 * ```ts
 * export const myTool = withAudit('myTool', tool({
 *     description: 'Does something',
 *     inputSchema: z.object({ param: z.string() }),
 *     execute: async (input, options) => {
 *         // Tool logic here
 *         return { success: true }
 *     }
 * }))
 * ```
 */
export function withAudit<TInput, TOutput>(
    toolName: string,
    toolDefinition: CoreTool<TInput, TOutput>
): CoreTool<TInput, TOutput> {
    return tool({
        description: toolDefinition.description,
        parameters: toolDefinition.parameters,
        execute: async (input, options) => {
            // Extract context for audit logging
            const context = options?.experimental_context as ToolExecutionContext | undefined
            const toolCallId = (options as any)?.toolCallId

            // Start audit tracking
            const complete = await toolExecutionAuditService.startExecution({
                toolName,
                toolCallId,
                contextId: context?.contextId || 'unknown',
                userTelegramId: context?.userPhone || 'unknown',
                userUsername: context?.userName,
                userDisplayName: context?.userName,
                inputParams: input as Record<string, any>,
                metadata: {
                    userMessage: context?.userMessage,
                    personality: context?.personality?.name,
                },
            })

            try {
                // Execute the actual tool
                const result = await toolDefinition.execute!(input, options!)

                // Log successful execution
                await complete('success', result as Record<string, any>)

                return result
            } catch (error) {
                // Log failed execution
                const errorMessage = error instanceof Error ? error.message : String(error)
                await complete('error', null, errorMessage)

                logger.error(
                    {
                        err: error,
                        toolName,
                        input,
                        userId: context?.userPhone,
                    },
                    'Tool execution failed'
                )

                // Re-throw error to preserve original behavior
                throw error
            }
        },
    }) as CoreTool<TInput, TOutput>
}

/**
 * Wrap multiple tools with audit logging
 *
 * @param tools - Object containing tool definitions
 * @returns Object with wrapped tools
 *
 * @example
 * ```ts
 * export const myTools = wrapToolsWithAudit({
 *     getUserInfo: tool({ ... }),
 *     checkStatus: tool({ ... }),
 * })
 * ```
 */
export function wrapToolsWithAudit<T extends Record<string, CoreTool<any, any>>>(
    tools: T
): T {
    const wrappedTools: Record<string, CoreTool<any, any>> = {}

    for (const [toolName, toolDef] of Object.entries(tools)) {
        wrappedTools[toolName] = withAudit(toolName, toolDef)
    }

    return wrappedTools as T
}
