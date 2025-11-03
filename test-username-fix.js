// Test script to verify username extraction fix
import { extractUserIdentifiers, isValidUsername } from './src/features/isp/utils/userIdentifierExtractor.ts'

console.log('Testing username extraction fix...\n')

// Test cases
const testCases = [
    { input: '3afifsaiid', description: 'Username starting with digit' },
    { input: 'check 3afifsaiid', description: 'Message with digit-starting username' },
    { input: 'user 3afifsaiid', description: 'User prefix with digit-starting username' },
    { input: 'josianeyoussef', description: 'Letter-starting username (existing)' },
    { input: 'check josianeyoussef', description: 'Message with letter-starting username' },
    { input: '71534710', description: 'Phone number (should be phone, not username)' },
    { input: '+96171534710', description: 'International phone number' },
    { input: '123456789', description: 'All digits (should be phone)' },
]

console.log('=== isValidUsername() Tests ===\n')
testCases.forEach(({ input, description }) => {
    const isValid = isValidUsername(input)
    console.log(`${description}:`)
    console.log(`  Input: "${input}"`)
    console.log(`  Valid: ${isValid}`)
    console.log()
})

console.log('\n=== extractUserIdentifiers() Tests ===\n')
const messages = [
    'check 3afifsaiid',
    'user 3afifsaiid',
    'check josianeyoussef',
    'check 71534710',
    'info for 3afifsaiid and 71534710',
]

messages.forEach(message => {
    const identifiers = extractUserIdentifiers(message)
    console.log(`Message: "${message}"`)
    console.log(`Extracted:`, identifiers)
    console.log()
})
