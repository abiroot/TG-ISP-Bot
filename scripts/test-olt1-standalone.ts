/**
 * Standalone OLT1 Test Script
 * Tests OLT1 login and ONU lookup without requiring full app environment
 */
import { Agent, fetch as undiciFetch } from 'undici'

const insecureDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
    },
})

const OLT1_CONFIG = {
    baseUrl: 'https://185.170.131.29',
    username: 'admin',
    password: 'Mikrotik1',
}

async function login(): Promise<string | null> {
    console.log('Step 1: Logging in to OLT1...')
    console.log(`  URL: ${OLT1_CONFIG.baseUrl}/action/main.html`)
    console.log(`  Username: ${OLT1_CONFIG.username}`)

    const formData = new URLSearchParams({
        user: OLT1_CONFIG.username,
        pass: OLT1_CONFIG.password,
        button: 'Login',
        who: '100',
    })

    const loginResponse = await undiciFetch(`${OLT1_CONFIG.baseUrl}/action/main.html`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: formData.toString(),
        dispatcher: insecureDispatcher,
    })

    console.log(`  Login response status: ${loginResponse.status}`)

    if (!loginResponse.ok) {
        console.error('  ❌ Login request failed')
        return null
    }

    const loginHtml = await loginResponse.text()
    if (loginHtml.includes('login.html') || loginHtml.includes('Login failed')) {
        console.error('  ❌ Login failed - invalid credentials')
        return null
    }

    console.log('  ✅ Login successful, fetching ONU page for session key...')

    // Fetch ONU page to get session key
    const onuResponse = await undiciFetch(`${OLT1_CONFIG.baseUrl}/action/onuauthinfo.html`, {
        method: 'GET',
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        dispatcher: insecureDispatcher,
    })

    if (!onuResponse.ok) {
        console.error(`  ❌ Failed to fetch ONU page: ${onuResponse.status}`)
        return null
    }

    const onuHtml = await onuResponse.text()
    const sessionKeyMatch = onuHtml.match(/SessionKey=([a-zA-Z0-9]+)/i)

    if (sessionKeyMatch && sessionKeyMatch[1]) {
        console.log(`  ✅ Session key obtained: ${sessionKeyMatch[1]}`)
        return sessionKeyMatch[1]
    }

    console.error('  ❌ Could not extract session key from ONU page')
    console.log('  HTML preview:', onuHtml.substring(0, 500))
    return null
}

async function searchONU(sessionKey: string, description: string): Promise<any> {
    console.log(`\nStep 2: Searching for ONU: ${description}`)

    const searchDescription = description.toLowerCase()
    console.log(`  Search term (lowercase): ${searchDescription}`)

    const formData = new URLSearchParams({
        select: '255',
        onutype: '0',
        searchMac: '',
        searchDescription: searchDescription,
        onuid: '0/',
        select2: '1/',
        who: '300',
        SessionKey: sessionKey,
    })

    const response = await undiciFetch(`${OLT1_CONFIG.baseUrl}/action/onuauthinfo.html`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `${OLT1_CONFIG.baseUrl}/action/onuauthinfo.html`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: formData.toString(),
        dispatcher: insecureDispatcher,
    })

    console.log(`  Search response status: ${response.status}`)

    if (!response.ok) {
        console.error('  ❌ Search request failed')
        return null
    }

    const html = await response.text()

    // Check for session issues
    if (html.includes('login.html') || html.includes('Please login')) {
        console.error('  ❌ Session expired or invalid')
        return null
    }

    // Parse the HTML table
    return parseONUFromHTML(html, description)
}

function parseONUFromHTML(html: string, targetDescription: string): any {
    const targetLower = targetDescription.toLowerCase()
    const rowMatches = html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)

    for (const rowMatch of rowMatches) {
        const row = rowMatch[0]
        const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]

        if (tdMatches.length < 10) continue

        const cells = tdMatches.map((m) => stripHtml(m[1]))
        const description = cells[3]?.trim()

        if (!description) continue

        if (description.toLowerCase() === targetLower) {
            const onuInfo = {
                onuId: cells[0]?.trim() || 'Unknown',
                status: cells[1]?.toLowerCase().includes('online') ? 'Online' : 'Offline',
                macAddress: cells[2]?.trim() || 'Unknown',
                description: description,
                rtt: parseInt(cells[4]?.trim() || '0', 10),
                type: cells[5]?.trim() || 'Unknown',
                authFlag: cells[6]?.trim() || 'Unknown',
                exchange: cells[7]?.trim() || 'Unknown',
                authMode: cells[8]?.trim() || 'None',
                loid: cells[9]?.trim() || 'N/A',
            }

            console.log('  ✅ ONU found!')
            return onuInfo
        }
    }

    console.log('  ❌ ONU not found in response')

    // Show some debug info about what ONUs were found
    const allDescriptions: string[] = []
    const rowMatches2 = html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)
    for (const rowMatch of rowMatches2) {
        const row = rowMatch[0]
        const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        if (tdMatches.length >= 10) {
            const desc = stripHtml(tdMatches[3]?.[1] || '').trim()
            if (desc && desc.length > 0 && !desc.includes('Description')) {
                allDescriptions.push(desc)
            }
        }
    }

    if (allDescriptions.length > 0) {
        console.log(`  Found ${allDescriptions.length} ONUs in response:`)
        allDescriptions.slice(0, 10).forEach(d => console.log(`    - ${d}`))
        if (allDescriptions.length > 10) {
            console.log(`    ... and ${allDescriptions.length - 10} more`)
        }
    }

    return null
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()
}

async function main() {
    console.log('=== OLT1 Service Test ===')
    console.log(`Base URL: ${OLT1_CONFIG.baseUrl}`)
    console.log('')

    // Test interface from the user's example
    const testInterface = '(VM-PPPoe4)-vlan2021-olt1-zone7-jamildib'
    console.log(`Test interface: ${testInterface}`)

    // Extract username
    const parts = testInterface.split('-')
    const username = parts[parts.length - 1].trim()
    console.log(`Extracted ONU username: ${username}`)
    console.log('')

    try {
        // Login and get session key
        const sessionKey = await login()

        if (!sessionKey) {
            console.error('\n❌ Failed to obtain session key. Cannot proceed.')
            process.exit(1)
        }

        // Search for ONU
        const result = await searchONU(sessionKey, username)

        if (result) {
            console.log('\n=== ONU Info ===')
            console.log(JSON.stringify(result, null, 2))

            const statusEmoji = result.status === 'Online' ? '🟢' : '🔴'
            console.log('\n=== Formatted Output ===')
            console.log(`${statusEmoji} ONU Status: ${result.status}`)
            console.log(`  - ONU ID: ${result.onuId}`)
            console.log(`  - MAC: ${result.macAddress}`)
            console.log(`  - Type: ${result.type}`)
            console.log(`  - RTT: ${result.rtt} TQ`)
        } else {
            console.log('\n❌ ONU not found')
        }
    } catch (error) {
        console.error('\n❌ Error:', error)
        process.exit(1)
    }
}

main()
