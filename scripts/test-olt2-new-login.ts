/**
 * Test OLT2 new login method directly
 */
import { Agent, fetch as undiciFetch } from 'undici'

const insecureDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
    },
})

const baseUrl = 'https://185.170.131.28'
const username = 'admin'
const password = 'Mikrotik1'

async function login(): Promise<string | null> {
    console.log('Step 1: Logging in to OLT2...')

    const formData = new URLSearchParams({
        user: username,
        pass: password,
        button: 'Login',
        who: '100',
    })

    const loginResponse = await undiciFetch(`${baseUrl}/action/main.html`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: formData.toString(),
        dispatcher: insecureDispatcher,
    })

    console.log('Login response status:', loginResponse.status)

    const loginHtml = await loginResponse.text()
    if (loginHtml.includes('login.html') || loginHtml.includes('Login failed')) {
        console.error('Login failed - invalid credentials or redirected to login')
        return null
    }

    console.log('Login successful, fetching ONU page for session key...')

    // Step 2: Fetch ONU page to get session key
    const onuResponse = await undiciFetch(`${baseUrl}/action/onuauthinfo.html`, {
        method: 'GET',
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        dispatcher: insecureDispatcher,
    })

    console.log('ONU page response status:', onuResponse.status)

    const onuHtml = await onuResponse.text()

    // Extract SessionKey from URL patterns like: SessionKey=fgzki
    const sessionKeyMatch = onuHtml.match(/SessionKey=([a-zA-Z0-9]+)/i)
    if (sessionKeyMatch && sessionKeyMatch[1]) {
        console.log('Session key found:', sessionKeyMatch[1])
        return sessionKeyMatch[1]
    }

    console.error('Could not extract session key')
    return null
}

async function queryONU(sessionKey: string, description: string) {
    console.log(`\nStep 2: Querying ONU for description: ${description}`)

    const formData = new URLSearchParams({
        select: '255',
        onutype: '0',
        searchMac: '',
        searchDescription: description,
        onuid: '0/',
        select2: '1/',
        who: '300',
        SessionKey: sessionKey,
    })

    const response = await undiciFetch(`${baseUrl}/action/onuauthinfo.html`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `${baseUrl}/action/onuauthinfo.html`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: formData.toString(),
        dispatcher: insecureDispatcher,
    })

    console.log('Query response status:', response.status)

    const html = await response.text()

    // Check for login redirect
    if (html.includes('login.html') || html.includes('window.top.location.href')) {
        console.log('Session expired, got redirected to login')
        return null
    }

    // Check if we got a login redirect
    if (html.includes('login.html')) {
        console.log('Got login redirect - session may be invalid')
        return null
    }

    // Debug: Check if deirkyeme is anywhere in the response
    const lowerHtml = html.toLowerCase()
    if (lowerHtml.includes('deirkyeme')) {
        console.log('✓ "deirkyeme" found in HTML response')
        // Find the context
        const idx = lowerHtml.indexOf('deirkyeme')
        console.log('Context:', html.substring(Math.max(0, idx - 50), Math.min(html.length, idx + 100)))
    } else {
        console.log('✗ "deirkyeme" NOT found in HTML response')
        // Print some of the response to see what we got
        console.log('HTML preview:', html.substring(0, 500))
    }

    // Parse the response for ONU info
    const targetLower = description.toLowerCase()
    const rowMatches = html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)

    let rowCount = 0
    for (const rowMatch of rowMatches) {
        const row = rowMatch[0]
        const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        if (tdMatches.length < 10) continue

        rowCount++
        const cells = tdMatches.map((m) =>
            m[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .trim()
        )

        // Debug: print first few rows
        if (rowCount <= 3) {
            console.log(`Row ${rowCount}:`, cells.slice(0, 5))
        }

        const desc = cells[3]?.toLowerCase()
        if (desc === targetLower) {
            console.log('\n✅ ONU Found!')
            console.log('  ONU ID:', cells[0])
            console.log('  Status:', cells[1])
            console.log('  MAC:', cells[2])
            console.log('  Description:', cells[3])
            console.log('  RTT:', cells[4])
            console.log('  Type:', cells[5])
            return
        }
    }

    console.log(`Parsed ${rowCount} data rows, ONU not found`)
}

async function main() {
    const sessionKey = await login()
    if (!sessionKey) {
        console.error('Failed to login')
        process.exit(1)
    }

    // Try lowercase since ONU descriptions are typically lowercase
    await queryONU(sessionKey, 'deirkyeme')
}

main().catch(console.error)
