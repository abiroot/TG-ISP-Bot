#!/usr/bin/env tsx
/**
 * Billing Service Test Script
 *
 * Tests task creation for the billing system using the task_api.php endpoint.
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
 * Test task creation
 */
async function testTaskCreation(billingService: BillingService, testNumber: number = 1) {
    console.log(`\n📋 Test ${testNumber}: Creating Task...\n`)

    // Sample task data
    const taskData: CreateTaskData = {
        type: 'maintenance',
        message: `Test task ${testNumber} from BillingService - Please ignore this test message`,
        customer_username: 'abedissa2',
        wid: 'wtest',
        whatsapp: 'no', // Don't send WhatsApp notifications during tests
    }

    try {
        console.log(`${testNumber}️⃣  Creating task...`)
        console.log('   Task details:')
        console.log(`     Type: ${taskData.type}`)
        console.log(`     Message: ${taskData.message}`)
        console.log(`     Customer: ${taskData.customer_username}`)
        console.log(`     Worker ID: ${taskData.wid}`)
        console.log(`     WhatsApp: ${taskData.whatsapp}`)

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
 * Test multiple task types
 */
async function testMultipleTaskTypes(billingService: BillingService) {
    console.log('\n📋 Testing Multiple Task Types...\n')

    const taskTypes: Array<{ type: 'maintenance' | 'uninstall'; message: string }> = [
        { type: 'maintenance', message: 'Test maintenance task from API' },
        { type: 'uninstall', message: 'Test uninstall task from API' },
    ]

    const results: boolean[] = []

    for (const [index, taskConfig] of taskTypes.entries()) {
        const taskData: CreateTaskData = {
            type: taskConfig.type,
            message: taskConfig.message,
            customer_username: 'abedissa2',
            wid: 'wtest',
            whatsapp: 'no', // Don't send WhatsApp notifications during tests
        }

        try {
            console.log(`\n${index + 1}. Testing ${taskConfig.type} task...`)
            const response = await billingService.createTask(taskData)
            console.log(`   ✅ ${taskConfig.type} task created successfully`)
            results.push(true)
        } catch (error) {
            console.error(`   ❌ ${taskConfig.type} task failed:`, error)
            results.push(false)
        }
    }

    return results.every((result) => result)
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
    console.log('   Make sure your .env has valid configuration:\n')
    console.log('   - BILLING_API_BASE_URL')
    console.log('   - BILLING_ENABLED=true')

    const results = {
        basicTaskCreation: false,
        multipleTaskTypes: false,
        repeatedCreation: false,
    }

    // Run tests sequentially
    results.basicTaskCreation = await testTaskCreation(billingService, 1)

    if (results.basicTaskCreation) {
        results.multipleTaskTypes = await testMultipleTaskTypes(billingService)
        results.repeatedCreation = await testTaskCreation(billingService, 2)
    }

    // Print summary
    console.log('\n========================================')
    console.log('   TEST RESULTS')
    console.log('========================================\n')

    console.log('Test Results:')
    console.log(`  ${results.basicTaskCreation ? '✅' : '❌'} Basic Task Creation`)
    console.log(`  ${results.multipleTaskTypes ? '✅' : '❌'} Multiple Task Types`)
    console.log(`  ${results.repeatedCreation ? '✅' : '❌'} Repeated Creation`)

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
