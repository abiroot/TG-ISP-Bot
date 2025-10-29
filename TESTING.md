# Testing Guide

## Overview

This project includes comprehensive E2E testing using **Vitest** to ensure the AI-powered ISP customer support functionality works correctly.

## Test Features

### ISP Customer Support Testing

**Purpose**: Verify that the AI can properly handle customer information lookups, account status checks, and technical support queries using ISP API integration.

**Key Functionality Tested**:
- Customer information lookup via ISP API
- Sequential customer queries (testing conversation context)
- Tool execution with real ISP data
- Conversation history preservation with tool calls
- Phone number extraction from natural language

**Files Modified**:
- `src/services/messageService.ts` - Fixed response.messages access and added validation logging
- `src/database/repositories/ispRepository.ts` - Added `deleteAllCustomerData()` helper for testing
- `src/database/repositories/messageRepository.ts` - Added `deleteByContextId()` helper for testing

## Test Structure

```
tests/
├── setup/
│   ├── globalSetup.ts        # Environment configuration
│   └── mockContext.ts         # Mock BuilderBot contexts
└── integration/
    └── aiService.e2e.test.ts  # E2E tests for AI service
```

## Test Coverage

The E2E test suite (`tests/integration/aiService.e2e.test.ts`) covers:

1. **Single Customer Lookup**: Verifies ISP tool execution and database persistence
2. **Sequential Customer Lookups**: Tests multiple customer queries in conversation context
3. **Extended Sequential Test**: Three consecutive customer lookups to ensure robust handling
4. **Conversation History Reconstruction**: Validates proper tool history preservation with ISP data

## Running Tests

### Prerequisites

The tests require:
- **PostgreSQL database** connection (configured via .env)
- **OpenAI API key** (for real AI SDK calls)
- All environment variables from `.env`

### Test Commands

```bash
# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

### Database Setup for Testing

#### Option 1: Local PostgreSQL (Recommended for CI/CD)

1. Install PostgreSQL locally
2. Create a test database
3. Run migrations
4. Update `.env` with local database connection

#### Option 2: Remote Database (Current Setup)

The current setup uses a remote database on DigitalOcean. To run tests:

1. Ensure `.env` has proper database credentials
2. Ensure SSH access to server (if needed)
3. Run tests - they'll use the production database

**⚠️ Warning**: Tests create and delete test data. Always use test phone numbers (with "TEST" suffix).

## Test Design

### Real Integration (Not Mocked)

These are **true E2E tests**:
- ✅ Real AI SDK v5 (`generateText` with ISP tools)
- ✅ Real PostgreSQL database
- ✅ Real tool execution (ISP customer lookups)
- ✅ Real message storage and conversation history

### What's Mocked

- ❌ Telegram Bot API (BuilderBot context objects are mocked)
- ❌ ISP API responses (use mock data for testing)

### Test Data Cleanup

Tests automatically clean up after themselves:
- `beforeEach`: Deletes test user's ISP query entries and messages
- `afterAll`: Deletes test personality and all test data

Test users always have phone numbers ending in "TEST" (e.g., `+1234567890TEST`).

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: tg_isp_test
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Run migrations
        run: # Run your migration script

      - name: Run tests
        env:
          POSTGRES_DB_HOST: localhost
          POSTGRES_DB_PORT: 5432
          POSTGRES_DB_NAME: tg_isp_test
          POSTGRES_DB_USER: test_user
          POSTGRES_DB_PASSWORD: test_password
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: pnpm test
```

## Debugging Tests

### View Test Output

```bash
# Run with verbose logging
pnpm test --reporter=verbose

# Run specific test file
pnpm test tests/integration/aiService.e2e.test.ts

# Run specific test case
pnpm test -t "should handle SECOND customer lookup correctly"
```

### Check Test Data

If a test fails, check the database:

```sql
-- View test messages
SELECT * FROM messages WHERE context_id LIKE '%TEST%' ORDER BY created_at DESC;

-- View test ISP query entries
SELECT * FROM isp_queries WHERE user_phone LIKE '%TEST%' ORDER BY created_at DESC;

-- View test personalities
SELECT * FROM personalities WHERE context_id LIKE '%TEST%';
```

## AI SDK v5 Documentation References

From [Vercel AI SDK v5 docs](https://sdk.vercel.ai/docs/ai-sdk-core/generate-text):

> Both `generateText` and `streamText` provide a `response.messages` property, which is an array of `ModelMessage` objects that can be appended to the existing messages array.

This is the authoritative source that confirms our fix.

## Extending Tests

### Adding New Test Cases

1. Add test to `tests/integration/aiService.e2e.test.ts`
2. Use the same setup (beforeAll, afterAll, beforeEach)
3. Use test phone number with "TEST" suffix
4. Ensure proper cleanup

### Adding New Test Files

1. Create in `tests/integration/`
2. Import from `~/` (path alias configured in vitest.config.ts)
3. Follow the E2E pattern (real database, real AI SDK)

## Known Limitations

1. **Database Dependency**: Tests require actual PostgreSQL connection
2. **API Costs**: Tests make real OpenAI API calls (costs ~$0.01 per test run)
3. **Timing**: Each test takes 30-90 seconds due to real AI calls
4. **Test Isolation**: Tests use shared database (filtered by test user)

## Future Improvements

1. **Local Test Database**: Set up automated local PostgreSQL for faster tests
2. **Mock AI Responses**: Add option to mock AI SDK for faster unit tests
3. **Test Factories**: Create factory functions for test data generation
4. **Parallel Execution**: Enable parallel test execution with proper isolation
5. **Snapshot Testing**: Add snapshot tests for AI responses
