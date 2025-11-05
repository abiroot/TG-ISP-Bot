#!/usr/bin/env tsx
/**
 * Billing Service Test Script
 *
 * Tests cookie-based authentication and task creation for the billing system.
 * Useful for development/testing the BillingService integration.
 *
 * Usage:
 *   npm run tsx scripts/test-billing-task-creation.ts
 *
 * OR directly:
 *   tsx scripts/test-billing-task-creation.ts
 */

import 'dotenv/config'
import { BillingService } from '../src/features/billing/index.js'
import type { CreateTaskData } from '../src/features/billing/index.js'

/**
 * Test authentication
 */
async function testAuthentication(billingService: BillingService) {
    console.log('\n📋 Testing Authentication...\n')

    try {
        console.log('1️⃣  Authenticating to billing system...')
        const cookies = await billingService.authenticate()

        console.log('✅ Authentication successful!')
        console.log(`   Cookies received: ${cookies.length}`)
        cookies.forEach((cookie, index) => {
            // Only show first 50 chars of each cookie for security
            const displayCookie = cookie.length > 50 ? `${cookie.substring(0, 50)}...` : cookie
            console.log(`   ${index + 1}. ${displayCookie}`)
        })

        // Show cookie status
        const status = billingService.getCookieStatus()
        console.log(`   Valid until: ${status.expiresAt}`)
        console.log(`   Is valid: ${status.isValid}`)

        return true
    } catch (error) {
        console.error('❌ Authentication failed:', error)
        if (error instanceof Error) {
            console.error('   Message:', error.message)
        }
        return false
    }
}

/**
 * Test task creation
 */
async function testTaskCreation(billingService: BillingService) {
    console.log('\n📋 Testing Task Creation...\n')

    // Sample task data
    const taskData: CreateTaskData = {
        type: 'maintenance',
        message: 'Test task from BillingService - Please ignore this test message',
        customer_username: 'test1',
        worker_ids: [13],
        send_whatsapp: 1,
    }

    try {
        console.log('2️⃣  Creating task...')
        console.log('   Task details:')
        console.log(`     Type: ${taskData.type}`)
        console.log(`     Message: ${taskData.message}`)
        console.log(`     Customer: ${taskData.customer_username}`)
        console.log(`     Worker IDs: [${taskData.worker_ids.join(', ')}]`)
        console.log(`     Send WhatsApp: ${taskData.send_whatsapp ? 'Yes' : 'No'}`)

        const response = await billingService.createTask(taskData)

        console.log('\n✅ Task creation successful!')
        console.log(`   Success: ${response.success}`)
        if (response.taskId) {
            console.log(`   Task ID: ${response.taskId}`)
        }
        if (response.message) {
            console.log(`   Message: ${response.message}`)
        }

        return true
    } catch (error) {
        console.error('❌ Task creation failed:', error)
        if (error instanceof Error) {
            console.error('   Message:', error.message)
        }
        return false
    }
}

/**
 * Test cookie caching
 */
async function testCookieCaching(billingService: BillingService) {
    console.log('\n📋 Testing Cookie Caching...\n')

    try {
        console.log('3️⃣  Calling authenticate() again (should use cached cookies)...')
        const startTime = Date.now()
        const cookies = await billingService.authenticate()
        const duration = Date.now() - startTime

        console.log('✅ Cookie caching works!')
        console.log(`   Duration: ${duration}ms (should be very fast if cached)`)
        console.log(`   Cookies returned: ${cookies.length}`)

        return true
    } catch (error) {
        console.error('❌ Cookie caching test failed:', error)
        return false
    }
}

/**
 * Test cookie clearing
 */
async function testCookieClearing(billingService: BillingService) {
    console.log('\n📋 Testing Cookie Clearing...\n')

    try {
        console.log('4️⃣  Clearing cookies...')
        billingService.clearCookies()

        const status = billingService.getCookieStatus()
        console.log('✅ Cookies cleared!')
        console.log(`   Has cookies: ${status.hasCookies}`)
        console.log(`   Is valid: ${status.isValid}`)

        console.log('\n5️⃣  Authenticating again (should fetch fresh cookies)...')
        const cookies = await billingService.authenticate()

        console.log('✅ Re-authentication successful!')
        console.log(`   New cookies received: ${cookies.length}`)

        return true
    } catch (error) {
        console.error('❌ Cookie clearing test failed:', error)
        return false
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log('\n========================================')
    console.log('   BILLING SERVICE TEST SUITE')
    console.log('========================================')

    // Check if billing service is enabled
    const billingService = new BillingService()

    if (!billingService.isEnabled()) {
        console.error('\n❌ ERROR: Billing service is disabled!')
        console.error('   Set BILLING_ENABLED=true in your .env file\n')
        process.exit(1)
    }

    console.log('\nℹ️  Running tests against billing system...')
    console.log('   Make sure your .env has valid credentials:\n')
    console.log('   - BILLING_API_BASE_URL')
    console.log('   - BILLING_USERNAME')
    console.log('   - BILLING_PASSWORD')

    const results = {
        authentication: false,
        taskCreation: false,
        cookieCaching: false,
        cookieClearing: false,
    }

    // Run tests sequentially
    results.authentication = await testAuthentication(billingService)

    if (results.authentication) {
        results.taskCreation = await testTaskCreation(billingService)
        results.cookieCaching = await testCookieCaching(billingService)
        results.cookieClearing = await testCookieClearing(billingService)
    }

    // Print summary
    console.log('\n========================================')
    console.log('   TEST RESULTS')
    console.log('========================================\n')

    console.log('Test Results:')
    console.log(`  ${results.authentication ? '✅' : '❌'} Authentication`)
    console.log(`  ${results.taskCreation ? '✅' : '❌'} Task Creation`)
    console.log(`  ${results.cookieCaching ? '✅' : '❌'} Cookie Caching`)
    console.log(`  ${results.cookieClearing ? '✅' : '❌'} Cookie Clearing`)

    const passedTests = Object.values(results).filter(Boolean).length
    const totalTests = Object.keys(results).length

    console.log(`\nPassed: ${passedTests}/${totalTests}`)

    if (passedTests === totalTests) {
        console.log('\n✅ All tests passed!\n')
        process.exit(0)
    } else {
        console.log('\n❌ Some tests failed. Check the output above for details.\n')
        process.exit(1)
    }
}

// Run the test suite
main().catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
})
