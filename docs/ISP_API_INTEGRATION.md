# ISP API Integration Guide

Complete documentation for integrating with the ISP management system API.

**Last Updated:** 2025-11-17 | **Bot Version:** 1.0.13

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [AI SDK Tools](#ai-sdk-tools)
- [Role-Based Access Control](#role-based-access-control)
- [API Endpoints](#api-endpoints)
- [Error Handling](#error-handling)
- [Usage Examples](#usage-examples)
- [Performance Notes](#performance-notes)

---

## Overview

The ISP Service provides 4 AI SDK tools for customer support operations:

1. **searchCustomer** - Search by phone/username, returns complete customer info
2. **getMikrotikUsers** - List users on a specific Mikrotik interface
3. **updateUserLocation** - Update single customer location coordinates
4. **batchUpdateLocations** - Update multiple customers to same location

**Service Location:** `src/features/isp/services/ISPService.ts`

**Key Features:**
- JWT-based authentication (1-hour token expiry)
- Automatic phone number cleaning (removes Lebanese +961/961 prefix)
- Role-based tool permissions (admin/collector/worker)
- Complete customer information retrieval
- Mikrotik interface monitoring
- Location synchronization

---

## Authentication

### Configuration

Set these environment variables in `.env`:

```bash
ISP_API_BASE_URL=https://your-isp-api.com
ISP_API_USERNAME=your_api_username
ISP_API_PASSWORD=your_api_password
ISP_ENABLED=true  # Optional, defaults to true
```

### Authentication Flow

1. **POST** `/authenticate` with credentials
2. Receive raw JWT token (not JSON, plain text response)
3. Token cached for 1 hour
4. Auto-refresh on subsequent requests

**Implementation:**

```typescript
const response = await fetch(`${baseUrl}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        userName: username,
        password: password,
    }),
})

const token = await response.text() // Raw JWT token
```

**Headers for Authenticated Requests:**

```typescript
{
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
}
```

---

## AI SDK Tools

### 1. searchCustomer

Search for ISP customer by phone number or username. Returns complete account information.

**AI SDK Tool Definition:**

```typescript
{
    description: 'Search for ISP customer by phone number or username. Returns complete information including account status, technical details, and billing. Use for ANY customer-related query.',
    inputSchema: z.object({
        identifier: z.string().describe(
            'Phone number (+1234567890, 555-1234) or username (josianeyoussef, john_doe)'
        ),
    })
}
```

**API Endpoint:** `GET /user-info?mobile={identifier}`

**Phone Number Cleaning:**
- Input: `"+961 71 534 710"` → Cleaned: `"71534710"`
- Input: `"961 71 534 710"` → Cleaned: `"71534710"`
- Input: `"71 534 710"` → Cleaned: `"71534710"`
- Input: `"josianeyoussef"` → Unchanged (username)

**Response Structure:**

```typescript
interface ISPUserInfo {
    // Personal info
    id: number
    userName: string
    firstName: string
    lastName: string
    mobile: string
    phone: string
    mailAddress: string
    address: string

    // Account status
    online: boolean
    active: boolean
    archived: boolean
    expiryAccount: string
    accountTypeName: string

    // Technical details
    ipAddress: string
    staticIP: string
    macAddress: string
    nasHost: string
    mikrotikInterface: string

    // Network speeds
    basicSpeedUp: number    // Mbps
    basicSpeedDown: number  // Mbps

    // Billing
    accountPrice: number
    discount: number

    // Ping diagnostics
    pingResult: string[]

    // ... (see ISPService.ts for complete interface)
}
```

**Formatted Output:**

The tool returns HTML-formatted messages with two views:

**Admin View** (Complete):
- User details (username, mobile, address, comment)
- Account status (online/offline, active, expiry, FUP mode)
- Network details (IP, NAS host, Mikrotik interface, speeds, quotas)
- Station information (status, name, IP, uptime, interface stats)
- Access point (status, signal, electrical, interface stats)
- Users on same AP
- Billing info (price, expiry date)
- Collector info
- Timeline (last login/logout)
- Session history
- Ping diagnostics

**Worker View** (Simplified):
- Basic user info (username, address, mobile)
- Online status and FUP quota
- Simplified station/AP info (name, status, speed, link downs)
- Users on same AP
- Account price
- Ping diagnostics

**Message Splitting:**

Messages are automatically split to respect Telegram's 4096 character limit using `splitISPMessage()` utility.

---

### 2. getMikrotikUsers

List all users connected to a specific Mikrotik interface with online/offline status.

**AI SDK Tool Definition:**

```typescript
{
    description: 'Get list of users connected to a specific Mikrotik interface. Returns usernames and online status. Use when user asks about users on a specific interface/router/AP.',
    inputSchema: z.object({
        mikrotikInterface: z.string().describe(
            'Mikrotik interface name (e.g., "(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1")'
        ),
    })
}
```

**API Endpoint:** `GET /mikrotik-user-list?mikrotikInterface={interface}`

**Response:**

```typescript
interface MikrotikUser {
    userName: string
    online: boolean
}

// Example response
[
    { userName: "customer1", online: true },
    { userName: "customer2", online: false },
    { userName: "customer3", online: true }
]
```

**Formatted Output:**

```
📡 Mikrotik Interface: (VM-PPPoe4)-vlan1607-zone4-OLT1

👥 Total Users: 15
🟢 Online: 8
🔴 Offline: 7

User List:
🟢 customer1
🔴 customer2
🟢 customer3
...
```

**Special Handling for OLT/Ether Interfaces:**

When displaying customer info (via searchCustomer), if the customer's Mikrotik interface contains "OLT" or "ether" (case-insensitive), the bot automatically calls `getMikrotikUsers()` to show all users on that interface instead of using the customer's `accessPointUsers` field.

---

### 3. updateUserLocation

Update location coordinates for a single ISP customer.

**AI SDK Tool Definition:**

```typescript
{
    description: 'Update location coordinates for a single ISP user. Use when user wants to update one person\'s location.',
    inputSchema: z.object({
        userName: z.string().describe('Username to update location for'),
        latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
        longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
    })
}
```

**API Endpoint:** `POST /update-user-location`

**Request Body:**

```json
{
    "userName": "customer123",
    "latitude": 33.8886,
    "longitude": 35.4955
}
```

**Response:**

- Success: `"true"` (plain text boolean)
- User not found: `"false"` (plain text boolean)

**Tool Output:**

```typescript
// Success
{
    success: true,
    message: "✅ Location updated for customer123\n📍 33.8886, 35.4955"
}

// Failure
{
    success: false,
    message: "❌ Failed to update location for customer123\nUser not found in ISP system"
}
```

---

### 4. batchUpdateLocations

Update location for multiple ISP customers at once (same coordinates).

**AI SDK Tool Definition:**

```typescript
{
    description: 'Update location for multiple ISP users at once. Use when user wants to update several users to the same location.',
    inputSchema: z.object({
        userNames: z.array(z.string()).describe('Array of usernames to update'),
        latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
        longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
    })
}
```

**Implementation:**

Calls `updateUserLocation()` sequentially for each username. Returns summary of successes and failures.

**Tool Output:**

```
📍 Batch Location Update

✅ Success: 8/10
❌ Failed: 2
📍 Location: 33.8886, 35.4955

✅ customer1
✅ customer2
❌ customer3 - User not found in ISP system
✅ customer4
...
```

---

## Role-Based Access Control

All ISP tools enforce role-based permissions via `RoleService`:

| Tool | Admin | Collector | Worker |
|------|-------|-----------|--------|
| `searchCustomer` | ✅ | ❌ | ❌ |
| `getMikrotikUsers` | ✅ | ❌ | ❌ |
| `updateUserLocation` | ✅ | ✅ | ✅ |
| `batchUpdateLocations` | ✅ | ✅ | ✅ |

**Permission Check Flow:**

```typescript
// 1. Extract user Telegram ID from AI SDK context
const userTelegramId = experimental_context?.userPhone ||
                      experimental_context?.contextId?.split('_')[0]

// 2. Check permission using RoleService (database-backed)
const hasPermission = await roleService.hasToolPermission(userTelegramId, toolName)

// 3. Deny access if unauthorized
if (!hasPermission) {
    return {
        success: false,
        message: "🚫 Permission Denied\n\nYou don't have permission to use this tool.\n\n**Your roles:** collector\n**Tool:** searchCustomer\n\nContact an administrator to request access."
    }
}
```

**Tool Execution Audit:**

All tool calls are logged to `tool_execution_audit` table:
- User Telegram ID
- Tool name
- Input parameters
- Result/error
- Execution time (ms)
- Timestamp

---

## API Endpoints

### GET /user-info

Search for customer by phone number or username.

**URL:** `{{baseUrl}}/user-info?mobile={{identifier}}`

**Headers:**
```
Authorization: Bearer {{jwt_token}}
Content-Type: application/json
```

**Query Parameters:**
- `mobile` (string, required) - Phone number (cleaned) or username

**Response Codes:**
- `200 OK` - Customer(s) found (returns single object or array)
- `404 Not Found` - No customer found with that identifier
- `401 Unauthorized` - Invalid/expired JWT token
- `500 Internal Server Error` - API error

**Response:** See `ISPUserInfo` interface above.

---

### GET /mikrotik-user-list

List users on a Mikrotik interface.

**URL:** `{{baseUrl}}/mikrotik-user-list?mikrotikInterface={{interface}}`

**Headers:**
```
Authorization: Bearer {{jwt_token}}
Content-Type: application/json
```

**Query Parameters:**
- `mikrotikInterface` (string, required) - Mikrotik interface name

**Response Codes:**
- `200 OK` - Returns array of users
- `404 Not Found` - Interface not found (returns empty array)
- `401 Unauthorized` - Invalid/expired JWT token

**Response:**
```json
[
    { "userName": "customer1", "online": true },
    { "userName": "customer2", "online": false }
]
```

---

### POST /update-user-location

Update customer location coordinates.

**URL:** `{{baseUrl}}/update-user-location`

**Headers:**
```
Authorization: Bearer {{jwt_token}}
Content-Type: application/json
```

**Request Body:**
```json
{
    "userName": "customer123",
    "latitude": 33.8886,
    "longitude": 35.4955
}
```

**Response Codes:**
- `200 OK` - Returns boolean as plain text
- `401 Unauthorized` - Invalid/expired JWT token
- `500 Internal Server Error` - API error

**Response:**
- `"true"` - Location updated successfully
- `"false"` - User not found in system

---

## Error Handling

### Structured Errors

All ISP service methods throw `ISPServiceError` with:

```typescript
class ISPServiceError extends ServiceError {
    serviceName: 'ISPService'
    message: string       // Human-readable description
    code: string         // Machine-readable error code
    cause?: unknown      // Original error for debugging
    retryable: boolean   // Whether operation can be retried
}
```

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `SERVICE_DISABLED` | ISP service disabled via `ISP_ENABLED=false` | No |
| `AUTH_FAILED` | Authentication failed (invalid credentials) | Server errors (5xx) only |
| `AUTH_NETWORK_ERROR` | Network error during authentication | Yes |
| `SEARCH_FAILED` | Customer search failed | Server errors (5xx) only |
| `SEARCH_NETWORK_ERROR` | Network error during search | Yes |
| `MIKROTIK_LIST_FAILED` | Mikrotik user list failed | Server errors (5xx) only |
| `MIKROTIK_LIST_NETWORK_ERROR` | Network error during Mikrotik list | Yes |
| `LOCATION_UPDATE_NETWORK_ERROR` | Network error during location update | Yes |

### Retry Strategy

- **Retryable errors**: Network failures, server errors (5xx)
- **Non-retryable errors**: Client errors (4xx), service disabled
- **Token expiry**: Automatically refreshed on next request

---

## Usage Examples

### Example 1: Search Customer via AI Chat

**User:** "Can you show me info for 71534710?"

**AI Response:**
1. AI SDK calls `searchCustomer` tool with identifier `"71534710"`
2. Phone number cleaned: `"71534710"` (already clean)
3. API request: `GET /user-info?mobile=71534710`
4. Response formatted based on user role (admin/worker)
5. Message split if > 4096 characters
6. Bot sends formatted customer info

---

### Example 2: List Mikrotik Users

**User:** "Show users on (VM-PPPoe4)-vlan1607"

**AI Response:**
1. AI SDK calls `getMikrotikUsers` with interface name
2. API request: `GET /mikrotik-user-list?mikrotikInterface=(VM-PPPoe4)-vlan1607`
3. Returns list of users with online status
4. Formatted output with stats (total/online/offline)

---

### Example 3: Update Location (Manual)

**Admin:** "Update location for customer123 to 33.8886, 35.4955"

**AI Response:**
1. AI SDK calls `updateUserLocation` tool
2. Permission check (admin/collector/worker can use this tool)
3. API request: `POST /update-user-location` with coordinates
4. If successful: "✅ Location updated"
5. If failed: "❌ Failed - User not found"

---

### Example 4: Batch Location Update

**Admin:** "Update location for customer1, customer2, customer3 to 33.8886, 35.4955"

**AI Response:**
1. AI SDK calls `batchUpdateLocations` tool
2. Permission check
3. Sequentially updates each customer
4. Returns summary: "✅ Success: 2/3 ❌ Failed: 1"
5. Lists results for each customer

---

## Performance Notes

### Phone Number Cleaning

Phone number cleaning happens before API calls to normalize inputs:

```typescript
// Examples:
cleanPhoneNumber("+961 71 534 710")  // → "71534710"
cleanPhoneNumber("961 71 534 710")   // → "71534710"
cleanPhoneNumber("71 534 710")       // → "71534710"
cleanPhoneNumber("josianeyoussef")   // → "josianeyoussef" (unchanged)
```

### Token Caching

JWT tokens are cached for 1 hour to reduce authentication overhead:

```typescript
// Check if token is still valid
if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
    return this.authToken
}
```

### Message Splitting

Long customer info messages are automatically split using `splitISPMessage()` to respect Telegram's 4096 character limit. The utility preserves HTML formatting and splits at logical section boundaries.

### Mikrotik Interface Detection

For OLT/ether interfaces, the bot automatically fetches the full user list instead of using the customer's limited `accessPointUsers` field:

```typescript
const isOLT = /OLT|ether/i.test(userInfo.mikrotikInterface)

if (isOLT && userInfo.mikrotikInterface) {
    const mikrotikUsers = await this.getMikrotikUsers(userInfo.mikrotikInterface)
    // Display full list of users on interface
}
```

---

## Related Documentation

- [Role Service](../src/services/roleService.ts) - RBAC implementation
- [Tool Execution Audit](../src/database/schemas/toolExecutionAudit.ts) - Audit logging
- [Telegram Message Splitter](../src/utils/telegramMessageSplitter.ts) - Message splitting utility
- [User Identifier Extractor](../src/features/isp/utils/userIdentifierExtractor.ts) - Phone number parsing

---

**Need Help?**
- Check error codes in `ISPServiceError` class
- Review logs with `isp-service` namespace
- Verify environment variables in `.env`
- Ensure PostgreSQL `user_roles` table is populated
