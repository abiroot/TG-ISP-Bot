/**
 * Test OLT2 Service
 */
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

import { olt2Service } from '../src/features/isp/services/OLT2Service.js'

async function test() {
    console.log('Testing OLT2 Service...')
    console.log('Enabled:', olt2Service.isEnabled())

    // Test extraction
    const testInterface = '(VM-PPPoe4)-vlan1502-OLT2-PON1-DEIRKYEME'
    const username = olt2Service.extractONUUsername(testInterface)
    console.log('Test interface:', testInterface)
    console.log('Extracted username:', username)

    // Test lookup
    console.log('\nQuerying OLT2 for:', username)
    const result = await olt2Service.getONUInfo(username!)
    console.log('Result:', JSON.stringify(result, null, 2))

    if (result) {
        console.log('\nFormatted output:')
        console.log(olt2Service.formatONUInfo(result))
    }
}

test().catch(console.error)
