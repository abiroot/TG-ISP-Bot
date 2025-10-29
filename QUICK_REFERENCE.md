# Quick Reference Guide - Refactored Features

Quick reference for using the new production-ready features.

---

## 🔐 Admin Security

### Get Numeric Telegram IDs
```bash
npx tsx scripts/getAdminIds.ts
```

### Update Admin Config
```typescript
// src/config/admins.ts
export const ADMIN_IDS: string[] = [
    '123456789',  // @SOLamyy (numeric ID - recommended)
    '987654321',  // @lambasoft (numeric ID - recommended)
]
```

---

## 🛡️ Type-Safe Extensions

### Import Helpers
```typescript
import { getExtensions, getExtension, withExtensions } from '~/utils/extensions'
```

### Use in Flows
```typescript
// Method 1: Get all extensions
.addAction(async (ctx, utils) => {
    const { aiService, messageService } = getExtensions(utils)
    await aiService.chat(ctx.body)
})

// Method 2: Get specific service
.addAction(async (ctx, utils) => {
    const aiService = getExtension(utils, 'aiService')
    await aiService.chat(ctx.body)
})

// Method 3: Wrap action (best for multiple extensions)
.addAction(withExtensions(async (ctx, utils) => {
    const { aiService, intentService } = utils.extensions
    // Type-safe, guaranteed to exist!
}))
```

---

## 📝 Message Sending & Logging

### Import Helper
```typescript
import { sendAndLog, trySendAndLog } from '~/utils/flowHelpers'
```

### Send Messages
```typescript
// Simple message
await sendAndLog(ctx, utils, 'Hello!')

// Multiple messages
await sendAndLog(ctx, utils, [
    'Welcome to our service!',
    'How can I help you today?'
])

// With metadata (for debugging/tracking)
await sendAndLog(ctx, utils, 'User information found', {
    metadata: {
        method: 'getUserInfo',
        userId: 123,
        phone: phoneNumber
    }
})

// With media (image/video/document)
await sendAndLog(ctx, utils, 'Check this image', {
    media: 'https://example.com/image.png'
})

// Non-critical sending (doesn't throw on error)
const success = await trySendAndLog(ctx, utils, 'Optional message')
if (!success) {
    // Handle failure gracefully
}
```

---

## 📊 Tool Execution Audit

### Import Service
```typescript
import { toolExecutionAuditService } from '~/services/toolExecutionAuditService'
```

### Query Audit Logs
```typescript
// Get recent executions for a user
const userLogs = await toolExecutionAuditService.getRecentByUser(
    '123456789', // Telegram user ID
    50           // limit
)

// Get recent executions by tool name
const toolLogs = await toolExecutionAuditService.getRecentByTool(
    'getUserInfo',
    50
)

// Get failed executions (for monitoring)
const failures = await toolExecutionAuditService.getRecentFailures(50)

// Get statistics
const stats = await toolExecutionAuditService.getStats('getUserInfo')
console.log({
    total: stats[0].total_executions,
    successful: stats[0].successful_executions,
    failed: stats[0].failed_executions,
    avgDuration: `${stats[0].avg_duration_ms}ms`,
    successRate: `${(stats[0].successful_executions / stats[0].total_executions * 100).toFixed(2)}%`
})

// Query with filters
const filtered = await toolExecutionAuditService.query({
    user_telegram_id: '123456789',
    tool_name: 'getUserInfo',
    execution_status: 'success',
    start_date: new Date('2025-01-01'),
    end_date: new Date('2025-01-31'),
    limit: 100,
    offset: 0
})

// Check rate limits
const isLimited = await toolExecutionAuditService.checkRateLimit(
    '123456789',    // user ID
    'getUserInfo',  // tool name
    10,             // max executions
    5               // within 5 minutes
)
if (isLimited) {
    await sendAndLog(ctx, utils, 'Rate limit exceeded. Please try again later.')
    return
}

// Get execution count
const count = await toolExecutionAuditService.getExecutionCount(
    '123456789',
    'getUserInfo',
    60 // last 60 minutes
)
```

### Cleanup Old Logs (for data retention)
```typescript
// Clean up logs older than 90 days
const deletedCount = await toolExecutionAuditService.cleanupOldLogs(90)
console.log(`Deleted ${deletedCount} old audit logs`)
```

---

## 📞 Phone Number Utilities

### Import Helpers
```typescript
import { normalizePhoneNumber, isValidE164, formatForDisplay } from '~/utils/phoneNormalizer'
import { formatPhoneNumber, getContextId } from '~/utils/flowHelpers'
```

### Use Phone Helpers
```typescript
// Normalize to E.164 format
const normalized = normalizePhoneNumber('+961 70 118 353')
// Result: '+96170118353'

// Validate E.164 format
const isValid = isValidE164('+96170118353')
// Result: true

// Format for display
const formatted = formatForDisplay('+96170118353')
// Result: '+961 70 118 353'

// Quick format (from flowHelpers)
const display = formatPhoneNumber('96170118353')
// Result: '+96170118353'
```

---

## 🔧 JSON Utilities

### Import Helpers
```typescript
import {
    getCircularReplacer,
    safeStringify,
    safeParse,
    deepClone,
    isValidJSON,
    deepMerge
} from '~/utils/jsonHelpers'
```

### Use JSON Helpers
```typescript
// Handle circular references
const obj = { a: 1 }
obj.self = obj // circular!
const json = JSON.stringify(obj, getCircularReplacer())
// Result: '{"a":1,"self":"[Circular Reference]"}'

// Safe stringify (never throws)
const json = safeStringify(complexObject, 2)

// Safe parse (returns default on error)
const data = safeParse<MyType>(jsonString, { default: 'value' })

// Deep clone
const copy = deepClone(originalObject)

// Validate JSON
if (isValidJSON(userInput)) {
    const data = JSON.parse(userInput)
}

// Deep merge objects
const merged = deepMerge(
    { a: 1, b: { c: 2 } },
    { b: { d: 3 }, e: 4 }
)
// Result: { a: 1, b: { c: 2, d: 3 }, e: 4 }
```

---

## 🎨 Flow Context Helpers

### Get Context ID
```typescript
import { getContextId } from '~/utils/flowHelpers'

.addAction(async (ctx, utils) => {
    const contextId = getContextId(ctx)
    // Use for database queries, message tracking, etc.
})
```

---

## 🧪 Admin Flow Example

Complete example showing all best practices:

```typescript
import { addKeyword } from '@builderbot/bot'
import { getExtensions } from '~/utils/extensions'
import { sendAndLog } from '~/utils/flowHelpers'
import { runAdminMiddleware } from '~/middleware/pipeline'

export const myAdminFlow = addKeyword(['admin command'])
    .addAction(async (ctx, utils) => {
        // Run admin middleware (checks admin, maintenance mode, etc.)
        const result = await runAdminMiddleware(ctx, utils)
        if (!result.allowed) return

        // Type-safe extension access
        const { toolExecutionAuditService, userService } = getExtensions(utils)

        // Get user info
        const user = await userService.getUserByTelegramId(ctx.from)

        // Query audit logs
        const stats = await toolExecutionAuditService.getStats()

        // Format response
        const message = `📊 Tool Execution Statistics:

Total Executions: ${stats.reduce((sum, s) => sum + s.total_executions, 0)}
Success Rate: ${(stats.reduce((sum, s) => sum + s.successful_executions, 0) / stats.reduce((sum, s) => sum + s.total_executions, 0) * 100).toFixed(2)}%

By Tool:
${stats.map(s => `• ${s.tool_name}: ${s.total_executions} calls (${s.successful_executions} success, ${s.failed_executions} failed)`).join('\n')}`

        // Send with metadata
        await sendAndLog(ctx, utils, message, {
            metadata: {
                method: 'myAdminFlow',
                admin: user?.username || ctx.from
            }
        })
    })
```

---

## 🧪 ISP Flow Example

Complete example for ISP customer lookup:

```typescript
import { addKeyword } from '@builderbot/bot'
import { getExtensions } from '~/utils/extensions'
import { sendAndLog } from '~/utils/flowHelpers'
import { normalizePhoneNumber } from '~/utils/phoneNormalizer'
import { runUserMiddleware } from '~/middleware/pipeline'

export const customerLookupFlow = addKeyword(['check user', 'user info'])
    .addAction(async (ctx, utils) => {
        // Run user middleware
        const result = await runUserMiddleware(ctx, utils)
        if (!result.allowed) return
        const personality = result.personality!

        // Get services
        const { ispApiService, messageService } = getExtensions(utils)

        // Extract phone from message
        const phoneMatch = ctx.body.match(/\d{8,15}/)
        if (!phoneMatch) {
            await sendAndLog(ctx, utils, 'Please provide a phone number')
            return
        }

        try {
            // Normalize phone number
            const normalizedPhone = normalizePhoneNumber(phoneMatch[0])

            // ISP API call (automatically audited!)
            const users = await ispApiService.getUserInfo(normalizedPhone)

            if (users.length === 0) {
                await sendAndLog(ctx, utils, `❌ No user found for ${normalizedPhone}`)
                return
            }

            // Format and send response
            const userInfo = users[0]
            const formatted = ispApiService.formatUserInfo(userInfo)

            await sendAndLog(ctx, utils, formatted, {
                metadata: {
                    method: 'customerLookupFlow',
                    phoneNumber: normalizedPhone,
                    userId: userInfo.id
                }
            })

        } catch (error) {
            await sendAndLog(ctx, utils, '❌ Error looking up customer. Please try again.')
        }
    })
```

---

## 📈 Monitoring Dashboard Query

SQL query for monitoring dashboard:

```sql
-- Tool execution statistics (last 24 hours)
SELECT
    tool_name,
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE execution_status = 'success') as successful,
    COUNT(*) FILTER (WHERE execution_status = 'error') as failed,
    AVG(duration_ms)::INTEGER as avg_duration_ms,
    MAX(created_at) as last_execution
FROM tool_execution_audit
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY tool_name
ORDER BY total_calls DESC;

-- Top users by tool executions
SELECT
    user_telegram_id,
    user_username,
    COUNT(*) as total_executions,
    MAX(created_at) as last_execution
FROM tool_execution_audit
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY user_telegram_id, user_username
ORDER BY total_executions DESC
LIMIT 20;

-- Error rate by tool (last hour)
SELECT
    tool_name,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE execution_status = 'error') as errors,
    (COUNT(*) FILTER (WHERE execution_status = 'error')::FLOAT / COUNT(*) * 100)::NUMERIC(5,2) as error_rate_pct
FROM tool_execution_audit
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY tool_name
HAVING COUNT(*) > 0
ORDER BY error_rate_pct DESC;
```

---

## 🎯 Common Patterns

### Pattern 1: Admin Command with Audit Query
```typescript
.addAction(async (ctx, utils) => {
    const result = await runAdminMiddleware(ctx, utils)
    if (!result.allowed) return

    const { toolExecutionAuditService } = getExtensions(utils)
    const stats = await toolExecutionAuditService.getStats()

    await sendAndLog(ctx, utils, formatStats(stats), {
        metadata: { method: 'adminStats' }
    })
})
```

### Pattern 2: User Flow with ISP Lookup
```typescript
.addAction(async (ctx, utils) => {
    const result = await runUserMiddleware(ctx, utils)
    if (!result.allowed) return

    const { ispApiService } = getExtensions(utils)
    const users = await ispApiService.getUserInfo(phoneNumber)

    await sendAndLog(ctx, utils, formatUsers(users), {
        metadata: { phone: phoneNumber }
    })
})
```

### Pattern 3: Media Flow with Analysis
```typescript
.addAction(async (ctx, utils) => {
    const result = await runMediaMiddleware(ctx, utils)
    if (!result.allowed) return

    const { imageAnalysisService } = getExtensions(utils)
    const analysis = await imageAnalysisService.analyze(imageUrl)

    await sendAndLog(ctx, utils, analysis.description, {
        media: imageUrl,
        metadata: { method: 'imageAnalysis' }
    })
})
```

---

**Last Updated:** 2025-01-29
**Version:** 1.0.13
