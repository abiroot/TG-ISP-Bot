/**
 * Test OLT Telnet Service
 *
 * Tests the telnet-based OLT communication for both OLT1 and OLT2
 */
import * as net from 'net'

interface OLTConfig {
    name: string
    host: string
    port: number
    username: string
    password: string
}

const OLT_CONFIGS: OLTConfig[] = [
    {
        name: 'OLT1',
        host: '45.159.187.2',
        port: 23,
        username: 'admin',
        password: 'Mikrotik1',
    },
    {
        name: 'OLT2',
        host: '45.159.187.3',
        port: 23,
        username: 'admin',
        password: 'Mikrotik1',
    },
]

// Test target
const TARGET_DESCRIPTION = process.argv[2] || 'jamildib'

class TelnetClient {
    private socket: net.Socket | null = null
    private buffer: string = ''
    private config: OLTConfig

    constructor(config: OLTConfig) {
        this.config = config
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log(`  ❌ Connection timeout to ${this.config.host}`)
                if (this.socket) {
                    this.socket.destroy()
                    this.socket = null
                }
                resolve(false)
            }, 10000)

            this.socket = new net.Socket()

            this.socket.on('data', (data) => {
                this.buffer += data.toString()
            })

            this.socket.on('error', (err) => {
                clearTimeout(timeout)
                console.log(`  ❌ Connection error: ${err.message}`)
                resolve(false)
            })

            this.socket.connect(this.config.port, this.config.host, () => {
                clearTimeout(timeout)
                console.log(`  ✅ Connected to ${this.config.host}:${this.config.port}`)
                resolve(true)
            })
        })
    }

    async sendAndWait(command: string, waitMs: number = 1000): Promise<string> {
        if (!this.socket) throw new Error('Not connected')

        this.buffer = ''
        this.socket.write(command + '\r\n')

        await this.sleep(waitMs)
        return this.buffer
    }

    async waitForPrompt(pattern: RegExp, timeoutMs: number = 5000): Promise<string> {
        const startTime = Date.now()
        while (Date.now() - startTime < timeoutMs) {
            if (pattern.test(this.buffer)) {
                const result = this.buffer
                this.buffer = ''
                return result
            }
            await this.sleep(100)
        }
        const result = this.buffer
        this.buffer = ''
        return result
    }

    disconnect(): void {
        if (this.socket) {
            try {
                this.socket.write('quit\r\n')
                this.socket.destroy()
            } catch {
                // Ignore
            }
            this.socket = null
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}

async function testOLT(config: OLTConfig, targetDescription: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Testing ${config.name} (${config.host}:${config.port})`)
    console.log(`${'='.repeat(60)}`)

    const client = new TelnetClient(config)

    try {
        // Connect
        console.log('\nStep 1: Connecting...')
        const connected = await client.connect()
        if (!connected) return

        // Wait for login prompt
        console.log('\nStep 2: Waiting for login prompt...')
        let response = await client.waitForPrompt(/Login:/i, 5000)
        if (!response.includes('Login')) {
            console.log(`  ⚠️ No login prompt, got: ${response.substring(0, 200)}`)
        } else {
            console.log('  ✅ Login prompt received')
        }

        // Send username
        console.log('\nStep 3: Sending username...')
        response = await client.sendAndWait(config.username, 500)
        await client.waitForPrompt(/Password:/i, 3000)
        console.log('  ✅ Password prompt received')

        // Send password
        console.log('\nStep 4: Sending password...')
        response = await client.sendAndWait(config.password, 500)
        response = await client.waitForPrompt(/>/, 3000)
        if (response.includes('>')) {
            console.log('  ✅ Logged in (user mode)')
        } else {
            console.log(`  ❌ Login failed: ${response.substring(0, 200)}`)
            return
        }

        // Enter enable mode
        console.log('\nStep 5: Entering enable mode...')
        await client.sendAndWait('enable', 300)
        await client.waitForPrompt(/Password:/i, 2000)
        response = await client.sendAndWait(config.password, 500)
        response = await client.waitForPrompt(/#/, 3000)
        if (response.includes('#')) {
            console.log('  ✅ Privileged mode enabled')
        } else {
            console.log(`  ❌ Enable failed: ${response.substring(0, 200)}`)
            return
        }

        // Disable pagination
        console.log('\nStep 6: Disabling pagination...')
        await client.sendAndWait('terminal length 0', 500)
        await client.waitForPrompt(/#/, 2000)
        console.log('  ✅ Pagination disabled')

        // Enter config mode
        console.log('\nStep 7: Entering config mode...')
        await client.sendAndWait('configure terminal', 500)
        response = await client.waitForPrompt(/\(config\)#/, 2000)
        if (response.includes('(config)')) {
            console.log('  ✅ Config mode')
        }

        // Search each EPON port
        const ports = ['0/1', '0/2', '0/3', '0/4']

        for (const port of ports) {
            console.log(`\nSearching EPON ${port}...`)

            // Select interface
            await client.sendAndWait(`interface epon ${port}`, 500)
            response = await client.waitForPrompt(/\(config-pon-/, 2000)

            if (!response.includes(`config-pon-${port}`)) {
                console.log(`  ⚠️ Failed to select interface ${port}`)
                continue
            }

            // Get ONU status
            await client.sendAndWait('show onu status', 500)
            const statusOutput = await client.waitForPrompt(/#/, 5000)

            // Parse ONU status
            const onus = parseONUStatus(statusOutput)
            console.log(`  Found ${onus.length} ONUs`)

            // Get descriptions and search for target
            for (const onu of onus) {
                const index = onu.onuId.match(/:(\d+)$/)?.[1]
                if (!index) continue

                await client.sendAndWait(`show onu ${index} description`, 300)
                const descOutput = await client.waitForPrompt(/#/, 2000)
                const description = descOutput.match(/description\s*:\s*(\S+)/i)?.[1]

                if (description?.toLowerCase() === targetDescription.toLowerCase()) {
                    console.log(`\n${'='.repeat(60)}`)
                    console.log(`🎉 FOUND: ${description}`)
                    console.log(`${'='.repeat(60)}`)
                    console.log(`  ONU ID: ${onu.onuId}`)
                    console.log(`  Status: ${onu.status}`)
                    console.log(`  MAC: ${onu.macAddress}`)
                    console.log(`  Distance: ${onu.distance}m`)
                    console.log(`  RTT: ${onu.rtt} TQ`)
                    console.log(`  Uptime: ${onu.aliveTime}`)
                    console.log(`  Port: EPON ${port}`)

                    // Exit and return
                    await client.sendAndWait('exit', 200)
                    return
                }
            }

            // Exit interface
            await client.sendAndWait('exit', 300)
            await client.waitForPrompt(/#/, 1000)
        }

        console.log(`\n❌ ONU "${targetDescription}" not found on any port`)
    } catch (error) {
        console.error(`\n❌ Error: ${error}`)
    } finally {
        client.disconnect()
        console.log('\nDisconnected')
    }
}

interface ParsedONU {
    onuId: string
    status: string
    macAddress: string
    distance: number
    rtt: number
    aliveTime: string
}

function parseONUStatus(output: string): ParsedONU[] {
    const onus: ParsedONU[] = []
    const lines = output.split('\n')

    for (const line of lines) {
        // Match core fields: EPON ID, status, MAC, distance, RTT
        const coreMatch = line.match(
            /^\s*(EPON\d+\/\d+:\d+)\s+(online|offline)\s+([0-9a-f:]+)\s+(\d+)\s+(\d+)\s+/i
        )

        if (coreMatch) {
            // Extract AliveTime - format: "DD HH:MM:SS" or "HH:MM:SS"
            const aliveTimeMatch = line.match(/(\d+\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})\s+(?:N\/A)?\s*$/i)
            const aliveTime = aliveTimeMatch ? aliveTimeMatch[1] : 'N/A'

            onus.push({
                onuId: coreMatch[1],
                status: coreMatch[2],
                macAddress: coreMatch[3],
                distance: parseInt(coreMatch[4], 10),
                rtt: parseInt(coreMatch[5], 10),
                aliveTime: aliveTime.trim(),
            })
        }
    }

    return onus
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║           OLT Telnet Service Test                          ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log(`\nSearching for ONU: "${TARGET_DESCRIPTION}"`)

    for (const config of OLT_CONFIGS) {
        await testOLT(config, TARGET_DESCRIPTION)
    }

    console.log('\n✅ Test complete')
}

main().catch(console.error)
