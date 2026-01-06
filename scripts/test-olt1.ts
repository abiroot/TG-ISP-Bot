/**
 * Test OLT1 Service
 */
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

import { olt1Service } from '../src/features/isp/services/OLT1Service.js'

async function test() {
    console.log('Testing OLT1 Service...')
    console.log('Enabled:', olt1Service.isEnabled())

    // Test extraction
    const testInterface = '(VM-PPPoe4)-vlan2021-olt1-zone7-jamildib'
    const username = olt1Service.extractONUUsername(testInterface)
    console.log('Test interface:', testInterface)
    console.log('Extracted username:', username)

    if (!username) {
        console.error('Failed to extract username from interface')
        return
    }

    // Test lookup
    console.log('\nQuerying OLT1 for:', username)
    const result = await olt1Service.getONUInfo(username)
    console.log('Result:', JSON.stringify(result, null, 2))

    if (result) {
        console.log('\nFormatted output:')
        console.log(olt1Service.formatONUInfo(result))
    } else {
        console.log('\nNo ONU found for username:', username)
    }
}

test().catch(console.error)
