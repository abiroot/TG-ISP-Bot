/**
 * Test customer search to check Mikrotik Interface
 */
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

async function searchCustomer(query: string) {
    const baseUrl = process.env.ISP_API_BASE_URL
    const username = process.env.ISP_API_USERNAME
    const password = process.env.ISP_API_PASSWORD

    if (!baseUrl || !username || !password) {
        console.error('Missing ISP API configuration')
        return
    }

    console.log('Searching for customer:', query)
    console.log('API URL:', baseUrl)

    try {
        // First authenticate
        console.log('Authenticating...')
        const authResponse = await fetch(`${baseUrl}/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userName: username,
                password: password,
            }),
        })

        if (!authResponse.ok) {
            console.error('Auth failed:', authResponse.status, await authResponse.text())
            return
        }

        const token = (await authResponse.text()).trim()
        console.log('Authentication successful, token length:', token.length)

        // Now search - uses user-info endpoint with mobile parameter
        const searchUrl = `${baseUrl}/user-info?mobile=${encodeURIComponent(query)}`
        console.log('Search URL:', searchUrl)

        const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
        })

        console.log('Response status:', response.status)

        if (!response.ok) {
            console.error('API error:', await response.text())
            return
        }

        const data = await response.json() as any
        console.log('Raw response:', JSON.stringify(data, null, 2).substring(0, 500))

        // Handle both array and single object responses
        const users = Array.isArray(data) ? data : (data.users ? data.users : (data.userName ? [data] : []))
        console.log('Found users:', users.length)

        if (users.length > 0) {
            for (const user of users) {
                console.log('\n--- User:', user.userName, '---')
                console.log('Mikrotik Interface:', user.mikrotikInterface)
                console.log('Contains OLT2:', user.mikrotikInterface?.toUpperCase().includes('OLT2') ? 'YES' : 'NO')
                console.log('Online:', user.online)
                console.log('NAS Host:', user.nasHost)
            }
        }
    } catch (error) {
        console.error('Error:', error)
    }
}

// Search for egety
searchCustomer('egety').catch(console.error)
