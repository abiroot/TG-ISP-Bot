/**
 * Test OLT2 Login to find session key pattern
 */
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Agent, fetch as undiciFetch } from 'undici'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env') })

const insecureDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
    },
})

async function testLogin() {
    const baseUrl = 'https://185.170.131.28'
    const username = 'admin'
    const password = 'Mikrotik1'

    console.log('Testing OLT2 login...')
    console.log(`URL: ${baseUrl}/action/main.html`)
    console.log(`User: ${username}`)
    console.log('')

    const formData = new URLSearchParams({
        user: username,
        pass: password,
        button: 'Login',
        who: '100',
    })

    const response = await undiciFetch(`${baseUrl}/action/main.html`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: formData.toString(),
        dispatcher: insecureDispatcher,
    })

    console.log('Response status:', response.status)
    const headers = Object.fromEntries(response.headers.entries())
    console.log('Response headers:', headers)
    console.log('')

    // Check for Set-Cookie header
    const setCookie = response.headers.getSetCookie()
    console.log('Set-Cookie headers:', setCookie)
    console.log('')

    const html = await response.text()

    // Now fetch a page that uses SessionKey (like onuauthinfo.html)
    console.log('=== Testing ONU Auth Info page ===')
    const onuResponse = await undiciFetch(`${baseUrl}/action/onuauthinfo.html`, {
        method: 'GET',
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': setCookie.join('; '),
        },
        dispatcher: insecureDispatcher,
    })

    console.log('ONU page status:', onuResponse.status)

    const onuHtml = await onuResponse.text()

    // Look for SessionKey in the ONU page
    console.log('')
    console.log('=== Looking for SessionKey in ONU page ===')

    const sessionKeyMatch = onuHtml.match(/name=["']?SessionKey["']?[^>]*value=["']?([a-zA-Z0-9]+)["']?/i)
    if (sessionKeyMatch) {
        console.log('Found SessionKey (name first):', sessionKeyMatch[1])
    }

    const sessionKeyMatch2 = onuHtml.match(/value=["']?([a-zA-Z0-9]+)["']?[^>]*name=["']?SessionKey["']?/i)
    if (sessionKeyMatch2) {
        console.log('Found SessionKey (value first):', sessionKeyMatch2[1])
    }

    // Search for any input with SessionKey
    const allInputs = onuHtml.matchAll(/<input[^>]*>/gi)
    for (const input of allInputs) {
        if (input[0].toLowerCase().includes('session')) {
            console.log('Session-related input:', input[0])
        }
    }

    // Also look for hidden inputs
    const hiddenInputs = onuHtml.matchAll(/<input[^>]*type=["']?hidden["']?[^>]*>/gi)
    console.log('\nHidden inputs:')
    for (const input of hiddenInputs) {
        console.log(input[0])
    }

    // Look for form tags with actions
    const forms = onuHtml.matchAll(/<form[^>]*>/gi)
    console.log('\nForms:')
    for (const form of forms) {
        console.log(form[0])
    }

    // Print a relevant section of HTML
    console.log('\n=== HTML snippet around "SessionKey" ===')
    const idx = onuHtml.toLowerCase().indexOf('sessionkey')
    if (idx >= 0) {
        console.log(onuHtml.substring(Math.max(0, idx - 100), Math.min(onuHtml.length, idx + 200)))
    } else {
        console.log('SessionKey not found in HTML')
    }
}

testLogin().catch(console.error)
