# E2E Testing Guide

Comprehensive guide for end-to-end testing of the Telegram ISP Bot using the Flow Test Harness.

## Overview

The e2e testing infrastructure provides **95% fidelity** to production conversation flows:

✅ **What's Real:**
- BuilderBot's CoreClass (message routing engine)
- Flow execution logic (actions, answers, navigation)
- State management (Map-based storage)
- AI SDK calls (real Gemini 2.0 Flash responses)
- Intent classification (real Langchain calls)
- Multi-turn conversation orchestration

🔧 **What's Mocked:**
- ISP API responses (realistic test data)
- Database operations (in-memory repositories)
- Telegram API (mock provider)
- Message logging (no-op)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Flow Test Harness                   │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ BuilderBot   │  │ Mock Telegram│  │   Mock   │  │
│  │  CoreClass   │──│   Provider   │──│ Database │  │
│  │  (Real)      │  │  (Captures)  │  │ (In-mem) │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│           │                                          │
│           │ Routes to flows                          │
│           ▼                                          │
│  ┌──────────────────────────────────────────────┐  │
│  │          Your BuilderBot Flows               │  │
│  │  (userInfoFlow, welcomeFlow, adminFlows...)  │  │
│  └──────────────────────────────────────────────┘  │
│           │                                          │
│           │ Uses extensions                          │
│           ▼                                          │
│  ┌──────────────────────────────────────────────┐  │
│  │           Mock/Real Services                 │  │
│  │  - MockISPService (test data)                │  │
│  │  - RealAIService (Gemini API)                │  │
│  │  - MockMessageService                         │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Basic Single-Turn Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createFlowTestHarness } from '~/tests/utils/FlowTestHarness'
import { createMockISPService } from '~/tests/utils/MockISPService'
import { userInfoFlow } from '~/features/isp/flows/UserInfoFlow'

describe('Customer Lookup', () => {
    let harness
    let mockISPService

    beforeEach(() => {
        mockISPService = createMockISPService()

        harness = createFlowTestHarness(
            [userInfoFlow], // Your flows
            {
                ispService: mockISPService, // Mock ISP API
                userManagementService: {
                    getPersonality: async () => ({ bot_name: 'Test Bot' }),
                },
            }
        )
    })

    it('should lookup customer by username', async () => {
        // Send message from user
        const response = await harness.sendMessage(
            '+1234567890', // User ID
            'check josianeyoussef' // Message
        )

        // Assert ISP API was called
        expect(mockISPService.searchCustomerCalls).toHaveLength(1)
        expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

        // Assert bot response
        expect(response.lastMessage.text).toContain('Josiane Youssef')
        expect(response.lastMessage.text).toContain('🟢') // Online
    })
})
```

### 2. Multi-Turn Conversation Test

```typescript
it('should complete 2-turn customer lookup', async () => {
    // Turn 1: User asks without identifier
    const r1 = await harness.sendMessage('+123', 'lookup customer')
    expect(r1.lastMessage.text).toMatch(/provide|phone|username/)

    // Check state was saved
    expect(harness.getState('+123').awaitingIdentifier).toBe(true)

    // Turn 2: User provides identifier
    const r2 = await harness.sendMessage('+123', 'josianeyoussef')
    expect(r2.lastMessage.text).toContain('Josiane')

    // State cleared
    expect(harness.getState('+123').awaitingIdentifier).toBeUndefined()
})
```

### 3. Full Conversation Simulation

```typescript
it('should handle full conversation flow', async () => {
    const responses = await harness.simulateConversation([
        { from: '+123', body: 'hello' },
        { from: '+123', body: 'check josianeyoussef' },
        { from: '+123', body: 'what is the IP address?' },
        { from: '+123', body: 'thanks' },
    ])

    expect(responses).toHaveLength(4)
    expect(responses[1].lastMessage.text).toContain('Josiane')
    expect(responses[2].lastMessage.text).toContain('10.50.1.45')
})
```

### 4. Testing with REAL AI

```typescript
import { coreAIService } from '~/features/conversation/services/CoreAIService'

it('should use real AI to extract phone number', async () => {
    harness = createFlowTestHarness(
        [welcomeFlow],
        {
            coreAIService, // REAL Gemini AI
            ispService: mockISPService, // Mock ISP API
        }
    )

    const response = await harness.sendMessage(
        '+123',
        'Can you check the customer with phone +961 71 534 710?'
    )

    // AI should extract phone and call ISP service
    expect(mockISPService.searchCustomerCalls).toHaveLength(1)
    expect(mockISPService.searchCustomerCalls[0].identifier).toContain('71 534 710')
})
```

## Test Utilities

### FlowTestHarness

Main testing interface for simulating conversations.

**Methods:**
- `sendMessage(from, body, context?)` - Send single message
- `simulateConversation(messages[])` - Send multiple messages
- `clickButton(from, callbackData)` - Simulate button click
- `getState(userId)` - Get conversation state
- `getLastResponse()` - Get last bot message
- `getAllResponses()` - Get all bot messages
- `getMessagesForUser(userId)` - Get messages for specific user
- `reset()` - Clear state and messages

**Example:**
```typescript
const harness = createFlowTestHarness([flow1, flow2], { services })

// Send message
const response = await harness.sendMessage('+123', 'hello')

// Check state
const state = harness.getState('+123')

// Get all responses
const all = harness.getAllResponses()

// Reset for next test
harness.reset()
```

### MockISPService

Provides realistic ISP API responses without real API calls.

**Methods:**
- `searchCustomer(identifier)` - Returns test customer data
- `getMikrotikUsers(interface)` - Returns test users
- `updateUserLocation(user, lat, lng)` - Simulates location update
- `batchUpdateLocations(updates[])` - Batch location updates
- `getTools()` - Returns AI SDK tools (for AI integration)

**Tracking:**
- `searchCustomerCalls` - Array of calls made
- `updateUserLocationCalls` - Array of update calls

**Example:**
```typescript
const mockISP = createMockISPService()

// Service returns realistic data
const customers = await mockISP.searchCustomer('josianeyoussef')
expect(customers).toHaveLength(1)
expect(customers[0].firstName).toBe('Josiane')

// Track calls
expect(mockISP.searchCustomerCalls).toHaveLength(1)
```

### Mock Fixtures

**ISP Customer Data (`tests/fixtures/ispCustomerData.ts`):**
- `onlineCustomer` - Customer currently online
- `offlineCustomer` - Disconnected customer
- `expiredCustomer` - Account expired
- `mikrotikUsers` - Users on network interface
- `findCustomer(identifier)` - Search helper
- `searchCustomers(query)` - Partial search

**Personalities (`tests/fixtures/personalities.ts`):**
- `privatePersonality` - Private chat bot config
- `groupPersonality` - Group chat bot config
- `adminPersonality` - Admin bot config
- `testPersonality` - Generic test config

**Messages (`tests/fixtures/messages.ts`):**
- `customerLookupConversation` - Sample lookup chat
- `locationUpdateConversation` - Location update chat
- `generalChatConversation` - General AI chat
- `createTestMessage(overrides)` - Message factory

## Testing Patterns

### Pattern 1: Test Flow Logic Only

Mock all services, test flow decisions and routing.

```typescript
it('should route to correct flow based on input', async () => {
    const harness = createFlowTestHarness([flow1, flow2], {
        service1: mockService1,
        service2: mockService2,
    })

    const response = await harness.sendMessage('+123', 'trigger flow2')

    // Assert flow2 was executed
    expect(mockService2.methodCalls).toHaveLength(1)
})
```

### Pattern 2: Test with Real AI

Use real AI SDK for intent classification and tool calling.

```typescript
import { coreAIService } from '~/features/conversation/services/CoreAIService'

it('should classify intent with real AI', async () => {
    const harness = createFlowTestHarness([welcomeFlow], {
        coreAIService, // REAL AI
        ispService: mockISPService,
    })

    const response = await harness.sendMessage('+123', 'hello')

    // AI should generate greeting
    expect(response.lastMessage.text).toMatch(/hello|hi|hey/i)
})
```

### Pattern 3: Test Error Handling

Simulate errors and verify graceful degradation.

```typescript
it('should handle service errors gracefully', async () => {
    mockISPService.searchCustomer = async () => {
        throw new Error('API unavailable')
    }

    const response = await harness.sendMessage('+123', 'check user')

    // Should not crash, should send error message
    expect(response.lastMessage).toBeDefined()
    expect(response.lastMessage.text).toMatch(/error|problem|unavailable/)
})
```

### Pattern 4: Test State Persistence

Verify state management between messages.

```typescript
it('should persist state across messages', async () => {
    await harness.sendMessage('+123', 'start process')

    // Check state was saved
    let state = harness.getState('+123')
    expect(state.processStarted).toBe(true)

    await harness.sendMessage('+123', 'continue')

    // State should still exist
    state = harness.getState('+123')
    expect(state.processStarted).toBe(true)
})
```

## Best Practices

### 1. Use Realistic Test Data

```typescript
// ✅ GOOD: Use fixtures
import { onlineCustomer } from '~/tests/fixtures/ispCustomerData'
expect(response.text).toContain(onlineCustomer.firstName)

// ❌ BAD: Hardcoded values
expect(response.text).toContain('John')
```

### 2. Test One Thing Per Test

```typescript
// ✅ GOOD: Focused test
it('should return customer name', async () => {
    const response = await harness.sendMessage('+123', 'check user')
    expect(response.lastMessage.text).toContain('Josiane Youssef')
})

// ❌ BAD: Testing multiple things
it('should work', async () => {
    // Tests 10 different things...
})
```

### 3. Reset Harness Between Tests

```typescript
afterEach(() => {
    harness.reset() // Clear state and messages
})
```

### 4. Use Descriptive Test Names

```typescript
// ✅ GOOD
it('should show offline status for disconnected customers', async () => {

// ❌ BAD
it('test customer lookup', async () => {
```

### 5. Assert on Both Service Calls and Responses

```typescript
it('should call ISP API with correct identifier', async () => {
    await harness.sendMessage('+123', 'check josianeyoussef')

    // Assert service was called correctly
    expect(mockISPService.searchCustomerCalls).toHaveLength(1)
    expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

    // Assert user got correct response
    const response = harness.getLastResponse()
    expect(response.text).toContain('Josiane')
})
```

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific test file
npm run test tests/e2e/flows/ispQuery.e2e.test.ts

# Run with debug output
DEBUG=true npm run test:e2e

# Run tests in watch mode
npm run test:e2e:watch

# Run tests with coverage
npm run test:e2e:coverage
```

## Environment Configuration

Create `.env.test` for test-specific configuration:

```bash
# Test environment
NODE_ENV=test

# AI API keys (for real AI tests)
GOOGLE_API_KEY=your-test-key
OPENAI_API_KEY=your-test-key

# ISP API (disabled in tests)
ISP_ENABLED=false

# Database (not used in e2e - mocked)
POSTGRES_DB_HOST=localhost

# Test-specific settings
RAG_ENABLED=false
RAG_WORKER_ENABLED=false
```

## Troubleshooting

### Tests Timeout

**Problem:** Tests hang and timeout

**Solutions:**
1. Enable debug mode: `harness = createFlowTestHarness(flows, services, true)`
2. Check for missing `await` statements
3. Verify flows are registered correctly

### State Not Persisting

**Problem:** State cleared between messages

**Solutions:**
1. Check flow uses `state.update()` correctly
2. Verify same `from` ID used in both messages
3. Don't call `harness.reset()` between related messages

### Mock Service Not Called

**Problem:** `mockService.calls` is empty

**Solutions:**
1. Verify service is passed in `extensions`
2. Check flow actually uses that service
3. Ensure flow was triggered (check with debug mode)

### AI Tests Failing

**Problem:** Real AI integration tests fail

**Solutions:**
1. Check API keys are valid
2. Verify network connection
3. AI responses are non-deterministic - use `.toMatch()` instead of `.toBe()`
4. Add retry logic for flaky AI tests

## Examples

See these files for complete examples:
- `tests/e2e/flows/ispQuery.e2e.test.ts` - ISP customer lookup
- `tests/e2e/flows/welcomeFlow.e2e.test.ts` - AI chat with tools
- `tests/e2e/conversations/customerLookup.test.ts` - Multi-turn conversations

## Contributing

When adding new e2e tests:

1. Use the `createFlowTestHarness()` pattern
2. Mock external APIs (ISP, database)
3. Use real AI when testing AI features
4. Add fixtures for new test data
5. Follow naming conventions: `*.e2e.test.ts`
6. Document complex test scenarios

## Limitations

**What E2E Tests Cannot Do:**
- ❌ Test actual Telegram API integration
- ❌ Test real database writes
- ❌ Test webhook routing
- ❌ Test deployment infrastructure
- ❌ Test real ISP API responses

**For These, Use:**
- Integration tests with real Telegram bot
- Staging environment testing
- Production monitoring

## Summary

The e2e testing infrastructure provides **high-fidelity conversation simulation** with:

- ✅ Real flow execution via BuilderBot's CoreClass
- ✅ Real state management and multi-turn conversations
- ✅ Real AI integration (Gemini, Langchain)
- ✅ Realistic mock data (ISP customers, personalities)
- ✅ Comprehensive assertions (service calls + responses)
- ✅ Fast test execution (no real API calls except AI)

This gives you **confidence** that your flows work exactly as they will in production.
