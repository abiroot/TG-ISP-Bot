/**
 * Standalone OLT2 Test - No app dependencies
 */
import { Agent, fetch as undiciFetch } from 'undici'

const insecureDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
    },
})

async function testOLT2(description: string) {
    console.log('Testing OLT2 lookup for:', description)

    const formData = new URLSearchParams({
        select: '255',
        onutype: '0',
        searchMac: '',
        searchDescription: description,
        onuid: '0/',
        select2: '1/',
        who: '300',
        SessionKey: 'gzxuh',
    })

    console.log('Request body:', formData.toString())

    try {
        const response = await undiciFetch('https://185.170.131.28/action/onuauthinfo.html', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://185.170.131.28/action/onuauthinfo.html',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            body: formData.toString(),
            dispatcher: insecureDispatcher,
        })

        console.log('Response status:', response.status)

        const html = await response.text()
        console.log('Response length:', html.length)

        // Save HTML for debugging
        const fs = await import('fs')
        fs.writeFileSync('/tmp/olt2-response.html', html)
        console.log('Full response saved to /tmp/olt2-response.html')

        // Try to find the description in the response
        const targetLower = description.toLowerCase()
        if (html.toLowerCase().includes(targetLower)) {
            console.log('✅ Found description in response!')
        } else {
            console.log('❌ Description NOT found in response')
        }

        // Parse table rows
        const rowMatches = html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)
        let rowCount = 0
        for (const rowMatch of rowMatches) {
            rowCount++
            const row = rowMatch[0]

            // Extract all TD contents
            const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
            if (tdMatches.length >= 4) {
                const cells = tdMatches.map((m) =>
                    m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
                )

                // Check if this row matches
                const cellDescription = cells[3]?.toLowerCase()
                if (cellDescription && cellDescription.includes(targetLower)) {
                    console.log('\n✅ FOUND MATCHING ROW:')
                    console.log('  ONU ID:', cells[0])
                    console.log('  Status:', cells[1])
                    console.log('  MAC:', cells[2])
                    console.log('  Description:', cells[3])
                    console.log('  RTT:', cells[4])
                    console.log('  Type:', cells[5])
                    console.log('  All cells:', cells)
                }
            }
        }
        console.log('Total rows found:', rowCount)

    } catch (error) {
        console.error('Error:', error)
    }
}

// Test with DEIRKYEME
testOLT2('DEIRKYEME').catch(console.error)
