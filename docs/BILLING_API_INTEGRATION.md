# Billing API Integration Guide

Complete documentation for integrating with the billing system for task creation and management.

**Last Updated:** 2025-11-17 | **Bot Version:** 1.0.13

---

## Table of Contents

- [Overview](#overview)
- [Cookie-Based Authentication](#cookie-based-authentication)
- [Task Creation](#task-creation)
- [WhatsApp Notifications](#whatsapp-notifications)
- [Error Handling](#error-handling)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Billing Service integrates with an external billing system to create and manage support tasks. Unlike the ISP API which uses JWT tokens, the billing system uses **cookie-based session authentication**.

**Service Location:** `src/features/billing/services/BillingService.ts`

**Key Features:**
- Cookie-based session management (12-hour session lifetime)
- Automatic re-authentication on cookie expiry
- Task creation with form data submission
- Worker assignment
- WhatsApp notification preference (handled by billing system, not bot)
- Built-in retry logic

**Task Flow (6-Step Wizard):**
1. Select task type (maintenance/uninstall)
2. Enter task message/description
3. Search for customer username
4. Select workers to assign
5. Toggle WhatsApp notification preference
6. Confirm and create task

---

## Cookie-Based Authentication

### Configuration

Set these environment variables in `.env`:

```bash
BILLING_API_BASE_URL=https://your-billing-system.com
BILLING_USERNAME=your_username
BILLING_PASSWORD=your_password
BILLING_ENABLED=true  # Optional, defaults to true
```

### Authentication Flow

The billing system uses a **two-step authentication process**:

#### Step 1: GET /index.php (Establish Session)

```typescript
const getResponse = await fetch(`${baseUrl}/index.php`, {
    method: 'GET',
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 ...',
    },
})

// Extract initial session cookie from Set-Cookie header
const initialCookies = getResponse.headers.getSetCookie() || []
const initialSessionCookie = initialCookies[0].split(';')[0].trim()
// Example: "PHPSESSID=abc123def456"
```

#### Step 2: POST /index.php (Authenticate with Credentials)

```typescript
const formData = new URLSearchParams({
    username: config.username,
    password: config.password,
})

const response = await fetch(`${baseUrl}/index.php`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initialSessionCookie,  // Include initial session cookie
        'Origin': baseUrl,
        'Referer': `${baseUrl}/index.php`,
    },
    body: formData.toString(),
})

// Extract final session cookie (or reuse initial if none returned)
const finalCookies = response.headers.getSetCookie() || []
const finalCookie = finalCookies.length > 0
    ? finalCookies[0].split(';')[0].trim()
    : initialSessionCookie
```

### Cookie Caching

Cookies are cached for **12 hours** to minimize authentication overhead:

```typescript
interface CookieData {
    cookies: string[]
    expiry: Date  // 12 hours from authentication
}

// Check if cookies are still valid
if (this.cookieData && this.cookieData.expiry > new Date()) {
    return this.cookieData.cookies  // Reuse cached cookies
}

// Otherwise, re-authenticate
```

### Cookie Management Methods

```typescript
// Get session cookies (auto-authenticates if needed)
const cookies = await billingService.authenticate()

// Clear cached cookies (force re-authentication on next request)
billingService.clearCookies()

// Check cookie status
const status = billingService.getCookieStatus()
// Returns: { hasCookies: true, expiresAt: "2025-11-18T00:00:00Z", isValid: true }
```

---

## Task Creation

### Task Creation Flow

Tasks are created through a 6-step conversational flow in `src/features/isp/flows/TaskCreationFlow.ts`:

```
taskTypeSelectionFlow        → Select type (maintenance/uninstall)
taskMessageFlow              → Enter description
taskCustomerSearchFlow       → Search customer
taskWorkerSelectionFlow      → Select workers
taskWhatsAppToggleFlow       → Toggle WhatsApp notification
taskConfirmationFlow         → Confirm & submit
```

### Task Types

```typescript
type TaskType = 'maintenance' | 'uninstall'
```

**Maintenance:** General service/repair tasks
**Uninstall:** Customer disconnection requests

### Task Creation API

**Endpoint:** `POST /create_task.php`

**Request Body (FormData):**

```typescript
{
    type: 'maintenance' | 'uninstall',
    message: string,              // Task description
    customer_username: string,    // ISP customer username
    worker_ids[]: number[],       // Array of billing system worker IDs
    send_whatsapp: '0' | '1'     // WhatsApp notification preference
}
```

**Example Request:**

```typescript
const formData = new URLSearchParams({
    type: 'maintenance',
    message: 'Customer reports internet outage',
    customer_username: 'customer123',
})

// Add worker IDs as array
formData.append('worker_ids[]', '13')  // Worker ID from billing system
formData.append('worker_ids[]', '15')

// Add WhatsApp preference
formData.append('send_whatsapp', '1')  // 1 = send, 0 = don't send
```

**Full Request:**

```typescript
const response = await fetch(`${baseUrl}/create_task.php`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies.join('; '),  // Session cookies from authenticate()
        'Origin': baseUrl,
        'Referer': `${baseUrl}/create_task.php?`,
    },
    body: formData.toString(),
})
```

**Response Codes:**

- `200 OK` - Task created successfully
- `401 Unauthorized` / `403 Forbidden` - Cookie expired (triggers re-authentication)
- `500 Internal Server Error` - Billing system error

**Automatic Re-authentication:**

If the request returns 401/403, the service automatically clears cookies and retries once:

```typescript
if (response.status === 401 || response.status === 403) {
    this.cookieData = undefined  // Clear expired cookies
    return this.createTask(taskData)  // Retry with fresh authentication
}
```

### CreateTaskData Interface

```typescript
interface CreateTaskData {
    type: TaskType                  // 'maintenance' | 'uninstall'
    message: string                 // Task description
    customer_username: string       // ISP customer username
    worker_ids: number[]            // Billing system worker IDs
    send_whatsapp: 0 | 1           // WhatsApp notification preference
}
```

### CreateTaskResponse Interface

```typescript
interface CreateTaskResponse {
    success: boolean
    taskId?: string     // Future: Task ID from billing system
    message?: string    // Success/error message
}
```

---

## WhatsApp Notifications

### Important: Bot Does NOT Send WhatsApp

**The Telegram bot only sets a preference** (`send_whatsapp: 0 | 1`). The **external billing system** is responsible for:
- Reading the `send_whatsapp` parameter
- Sending WhatsApp notifications to assigned workers
- Managing WhatsApp delivery and failures

**Bot's Role:**
1. Ask user: "Send WhatsApp Notification?" (Yes/No buttons)
2. Store preference in task creation request
3. Pass preference to billing system

**Billing System's Role:**
1. Receive task creation request with `send_whatsapp` parameter
2. If `send_whatsapp === 1`, send WhatsApp to assigned workers
3. If `send_whatsapp === 0`, skip WhatsApp notification

### WhatsApp Toggle Flow

**Flow:** `taskWhatsAppToggleFlow` (Step 5 of task creation)

**User Interface:**

```
Send WhatsApp Notification?

[✅ Yes, Send WhatsApp]  (callback_data: "whatsapp:1")
[❌ No WhatsApp]         (callback_data: "whatsapp:0")
```

**Implementation:**

```typescript
export const taskWhatsAppToggleFlow = addKeyword('BUTTON_WHATSAPP')
    .addAction(async (ctx, { flowDynamic, gotoFlow, extensions, state }) => {
        const sendWhatsApp = parseInt(ctx._button_data as string, 10) as 0 | 1

        // Store WhatsApp preference
        taskCreationStore.set(userId, { sendWhatsApp })

        // Show confirmation summary with WhatsApp status
        await flowDynamic(
            `<b>WhatsApp:</b> ${sendWhatsApp ? '✅ Yes' : '❌ No'}\n\n` +
            `Ready to create task?`
        )

        return gotoFlow(taskConfirmationFlow)
    })
```

**Task Confirmation Display:**

```
🔍 Task Summary:

Task Type: Maintenance
Message: Customer reports internet outage
Customer: customer123
Workers: Worker A, Worker B
WhatsApp: ✅ Yes

Ready to submit?

[✅ Confirm & Create]  [❌ Cancel]
```

---

## Error Handling

### Structured Errors

All billing service methods throw `BillingServiceError` with:

```typescript
class BillingServiceError extends ServiceError {
    serviceName: 'BillingService'
    message: string       // Human-readable description
    code: string         // Machine-readable error code
    cause?: unknown      // Original error for debugging
    retryable: boolean   // Whether operation can be retried
}
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `SERVICE_DISABLED` | Billing service disabled via `BILLING_ENABLED=false` | No |
| `AUTH_NO_INITIAL_COOKIE` | No initial session cookie received from GET /index.php | No |
| `AUTH_HTTP_ERROR` | Authentication POST request failed (status code error) | Yes |
| `AUTH_REQUEST_FAILED` | Network error during authentication (fetch failure) | Yes |
| `TASK_CREATE_HTTP_ERROR` | Task creation POST request failed (status code error) | Yes |
| `TASK_CREATE_REQUEST_FAILED` | Network error during task creation (fetch failure) | Yes |

### Retry Strategy

- **Retryable errors**: Network failures, HTTP errors (except 4xx client errors)
- **Non-retryable errors**: Service disabled, client errors (4xx)
- **Cookie expiry**: Automatically clears cookies and retries once (401/403)

---

## Testing

### Test Script

A test script is provided to verify billing integration:

**Location:** `scripts/test-billing-task-creation.ts`

**Run:**

```bash
npm run tsx scripts/test-billing-task-creation.ts
```

**Test Flow:**

```typescript
// 1. Authenticate
const cookies = await billingService.authenticate()
console.log('✅ Authentication successful')

// 2. Create test task
const taskData = {
    type: 'maintenance',
    message: 'Test task from automation',
    customer_username: 'test_customer',
    worker_ids: [13, 15],
    send_whatsapp: 1,
}

const response = await billingService.createTask(taskData)
console.log('✅ Task created:', response)

// 3. Verify cookie caching
const status = billingService.getCookieStatus()
console.log('Cookie status:', status)

// 4. Clear cookies and re-authenticate
billingService.clearCookies()
const newCookies = await billingService.authenticate()
console.log('✅ Re-authentication successful')
```

**Expected Output:**

```
✅ Authentication successful
   Cookies received: PHPSESSID=abc123def456
   Expires at: 2025-11-18T00:00:00Z

✅ Task created successfully
   Task Type: maintenance
   Customer: test_customer
   Workers: 13, 15
   Send WhatsApp: Yes

✅ Cookie cached
   Expires at: 2025-11-18T00:00:00Z
   Valid: true

✅ Re-authentication successful
```

---

## Troubleshooting

### Issue: Authentication Fails

**Symptoms:** `AUTH_HTTP_ERROR` or `AUTH_NO_INITIAL_COOKIE`

**Solutions:**

1. **Check credentials:**
   ```bash
   # Verify environment variables
   echo $BILLING_USERNAME
   echo $BILLING_PASSWORD
   echo $BILLING_API_BASE_URL
   ```

2. **Test manually with curl:**
   ```bash
   # Step 1: GET initial session
   curl -v "https://your-billing-system.com/index.php" \
        -H "User-Agent: Mozilla/5.0 ..." \
        2>&1 | grep "Set-Cookie"

   # Step 2: POST with credentials
   curl -X POST "https://your-billing-system.com/index.php" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -H "Cookie: PHPSESSID=abc123" \
        -d "username=your_username&password=your_password"
   ```

3. **Check network access:**
   - Ensure billing system is accessible from bot server
   - Verify no firewall blocking requests
   - Check SSL/TLS certificate validity

---

### Issue: Task Creation Fails with 401/403

**Symptoms:** `TASK_CREATE_HTTP_ERROR` with 401/403 status

**Cause:** Cookie expired or invalid

**Solution:**

The service automatically handles this:
```typescript
// Automatic retry with fresh authentication
if (response.status === 401 || response.status === 403) {
    this.cookieData = undefined
    return this.createTask(taskData)  // Retry
}
```

If retries fail, check:
1. Cookie expiry time (default 12 hours)
2. Billing system session configuration
3. Network stability

---

### Issue: WhatsApp Notifications Not Sent

**Symptoms:** Task created but workers don't receive WhatsApp

**Solutions:**

1. **Verify `send_whatsapp` parameter:**
   ```typescript
   // Check logs for task creation request
   // Should see: send_whatsapp: 1
   ```

2. **Check billing system configuration:**
   - Ensure billing system has WhatsApp integration enabled
   - Verify worker phone numbers are correct
   - Check billing system logs for WhatsApp delivery failures

3. **Note:** The bot only sets the preference. WhatsApp delivery is handled by the billing system.

---

### Issue: Cookie Expiry Too Short

**Symptoms:** Frequent re-authentication (< 12 hours)

**Solution:**

Adjust session lifetime in `BillingService.ts`:

```typescript
private readonly SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000  // 24 hours instead of 12
```

---

### Issue: Service Disabled

**Symptoms:** `SERVICE_DISABLED` error

**Solution:**

Enable billing service in `.env`:

```bash
BILLING_ENABLED=true
```

Or remove the variable entirely (defaults to `true`).

---

## Usage Examples

### Example 1: Create Maintenance Task

```typescript
const billingService = new BillingService()

const taskData = {
    type: 'maintenance',
    message: 'Customer reports slow internet speed',
    customer_username: 'customer123',
    worker_ids: [13, 15],  // Worker IDs from billing system
    send_whatsapp: 1,      // Send WhatsApp notification
}

try {
    const response = await billingService.createTask(taskData)
    console.log('Task created:', response.message)
} catch (error) {
    if (error instanceof BillingServiceError) {
        console.error(`Error (${error.code}):`, error.message)
        console.error('Retryable:', error.retryable)
    }
}
```

---

### Example 2: Create Uninstall Task (No WhatsApp)

```typescript
const taskData = {
    type: 'uninstall',
    message: 'Customer requested service disconnection',
    customer_username: 'customer456',
    worker_ids: [13],
    send_whatsapp: 0,  // Do NOT send WhatsApp
}

const response = await billingService.createTask(taskData)
```

---

### Example 3: Check Cookie Status

```typescript
const status = billingService.getCookieStatus()

if (!status.isValid) {
    console.log('Cookies expired, will re-authenticate on next request')
} else {
    console.log(`Cookies valid until: ${status.expiresAt}`)
}
```

---

### Example 4: Force Re-authentication

```typescript
// Clear cached cookies
billingService.clearCookies()

// Next request will trigger fresh authentication
const response = await billingService.createTask(taskData)
```

---

## Related Documentation

- [Task Creation Flow](../src/features/isp/flows/TaskCreationFlow.ts) - 6-step task wizard
- [Task Creation Store](../src/features/isp/stores/TaskCreationStore.ts) - State management
- [Service Error](../src/core/errors/ServiceError.ts) - Base error class

---

**Need Help?**
- Run test script: `npm run tsx scripts/test-billing-task-creation.ts`
- Check logs with `billing-service` namespace
- Verify environment variables in `.env`
- Review error codes in `BillingServiceError` class
