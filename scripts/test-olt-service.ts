/**
 * Test actual OLT Service (OLT1 and OLT2)
 */
import { olt1Service } from '../src/features/isp/services/OLT1Service'
import { olt2Service } from '../src/features/isp/services/OLT2Service'

async function main() {
    const target = process.argv[2] || 'jamildib'
    console.log(`Testing OLT Services for ONU: "${target}"\n`)

    // Test OLT1
    console.log('='.repeat(50))
    console.log('Testing OLT1 Service')
    console.log('='.repeat(50))
    const olt1Result = await olt1Service.getONUInfo(target)
    if (olt1Result) {
        console.log('✅ FOUND on OLT1!')
        console.log(olt1Service.formatONUInfo(olt1Result))
    } else {
        console.log('❌ Not found on OLT1')
    }

    // Test OLT2
    console.log('\n' + '='.repeat(50))
    console.log('Testing OLT2 Service')
    console.log('='.repeat(50))
    const olt2Result = await olt2Service.getONUInfo(target)
    if (olt2Result) {
        console.log('✅ FOUND on OLT2!')
        console.log(olt2Service.formatONUInfo(olt2Result))
    } else {
        console.log('❌ Not found on OLT2')
    }

    console.log('\n✅ Test complete')
}

main().catch(console.error)
