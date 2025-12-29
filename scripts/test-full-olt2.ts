/**
 * Full OLT2 integration test
 */
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

import { olt2Service } from '../src/features/isp/services/OLT2Service.js'

const mikrotikInterface = '(VM-PPPoe4)-vlan1614-OLT2-PON2-DEIRKYEME'

console.log('Testing full OLT2 flow for egety customer')
console.log('Mikrotik Interface:', mikrotikInterface)
console.log('')

// Step 1: Check if OLT2 interface
const isOLT2 = mikrotikInterface.toUpperCase().includes('OLT2')
console.log('1. Is OLT2 interface:', isOLT2)

// Step 2: Extract ONU username
const onuUsername = olt2Service.extractONUUsername(mikrotikInterface)
console.log('2. Extracted ONU username:', onuUsername)

// Step 3: Query OLT2
console.log('3. Querying OLT2 system...')
const onuInfo = await olt2Service.getONUInfo(onuUsername!)
console.log('   Result:', onuInfo ? 'FOUND' : 'NOT FOUND')

if (onuInfo) {
    console.log('')
    console.log('ONU Info:')
    console.log('  - ONU ID:', onuInfo.onuId)
    console.log('  - Status:', onuInfo.status)
    console.log('  - MAC:', onuInfo.macAddress)
    console.log('  - Description:', onuInfo.description)
    console.log('  - RTT:', onuInfo.rtt, 'TQ')
    console.log('')
    console.log('Formatted output:')
    console.log(olt2Service.formatONUInfo(onuInfo))
}
