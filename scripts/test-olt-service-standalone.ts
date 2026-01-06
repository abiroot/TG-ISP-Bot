/**
 * Standalone test for OLT Telnet Service
 * Does not require environment variables
 */
import * as net from 'net'

interface ONUStatus {
    onuId: string
    status: 'Online' | 'Offline'
    macAddress: string
    distanceMeters: number
    rtt: number
    lastRegTime: string
    aliveTime: string
}

interface ONUInfo extends ONUStatus {
    description: string
    port: string
}

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

const EPON_PORTS = ['0/1', '0/2', '0/3', '0/4']

class OLTTester {
    private socket: net.Socket | null = null
    private buffer: string = ''
    private config: OLTConfig

    constructor(config: OLTConfig) {
        this.config = config
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms))
    }

    async connect(): Promise<boolean> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.socket?.destroy()
                resolve(false)
            }, 10000)

            this.socket = new net.Socket()
            this.socket.on('data', (data) => {
                this.buffer += data.toString()
            })
            this.socket.on('error', () => {
                clearTimeout(timeout)
                resolve(false)
            })
            this.socket.connect(this.config.port, this.config.host, () => {
                clearTimeout(timeout)
                resolve(true)
            })
        })
    }

    async sendAndWait(cmd: string, waitMs: number = 500): Promise<string> {
        this.buffer = ''
        this.socket?.write(cmd + '\r\n')
        await this.sleep(waitMs)
        return this.buffer
    }

    async waitForPrompt(pattern: RegExp, timeoutMs: number = 3000): Promise<string> {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
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
        try {
            this.socket?.write('quit\r\n')
            this.socket?.destroy()
        } catch {
            // Ignore
        }
        this.socket = null
    }

    parseONUStatus(output: string): ONUStatus[] {
        const onus: ONUStatus[] = []
        const lines = output.split('\n')

        for (const line of lines) {
            const coreMatch = line.match(
                /^\s*(EPON\d+\/\d+:\d+)\s+(online|offline)\s+([0-9a-f:]+)\s+(\d+)\s+(\d+)\s+/i
            )

            if (coreMatch) {
                const aliveTimeMatch = line.match(
                    /(\d+\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})\s+(?:N\/A)?\s*$/i
                )
                const aliveTime = aliveTimeMatch ? aliveTimeMatch[1] : 'N/A'

                const afterRtt = line.substring(coreMatch[0].length)
                const lastRegMatch = afterRtt.match(
                    /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}|N\/A)/i
                )
                const lastRegTime = lastRegMatch ? lastRegMatch[1] : 'N/A'

                onus.push({
                    onuId: coreMatch[1],
                    status: coreMatch[2].toLowerCase() === 'online' ? 'Online' : 'Offline',
                    macAddress: coreMatch[3],
                    distanceMeters: parseInt(coreMatch[4], 10),
                    rtt: parseInt(coreMatch[5], 10),
                    lastRegTime,
                    aliveTime: aliveTime.trim(),
                })
            }
        }
        return onus
    }

    parseDescription(output: string): string | null {
        const match = output.match(/description\s*:\s*(\S+)/i)
        return match ? match[1].trim() : null
    }

    async searchForONU(targetDesc: string): Promise<ONUInfo | null> {
        const searchDesc = targetDesc.toLowerCase()

        // Connect
        console.log(`  Connecting to ${this.config.host}...`)
        if (!(await this.connect())) {
            console.log(`  ❌ Connection failed`)
            return null
        }
        console.log(`  ✅ Connected`)

        try {
            // Login
            await this.waitForPrompt(/Login:/i, 5000)
            await this.sendAndWait(this.config.username, 200)
            await this.waitForPrompt(/Password:/i, 3000)
            await this.sendAndWait(this.config.password, 200)
            const loginRes = await this.waitForPrompt(/>/, 3000)
            if (!loginRes.includes('>')) {
                console.log(`  ❌ Login failed`)
                return null
            }

            // Enable mode
            await this.sendAndWait('enable', 300)
            await this.waitForPrompt(/Password:/i, 2000)
            await this.sendAndWait(this.config.password, 200)
            const enableRes = await this.waitForPrompt(/#/, 3000)
            if (!enableRes.includes('#')) {
                console.log(`  ❌ Enable mode failed`)
                return null
            }

            // Terminal length
            await this.sendAndWait('terminal length 0', 300)
            await this.waitForPrompt(/#/, 2000)

            // Config mode
            await this.sendAndWait('configure terminal', 300)
            await this.waitForPrompt(/\(config\)#/, 2000)

            // Search each port
            for (const port of EPON_PORTS) {
                console.log(`  Searching EPON ${port}...`)

                // Select interface
                await this.sendAndWait(`interface epon ${port}`, 300)
                const ifRes = await this.waitForPrompt(/\(config-pon-/, 2000)
                if (!ifRes.includes(`config-pon-${port}`)) {
                    console.log(`    ⚠️ Failed to select interface`)
                    continue
                }

                // Get ONU status
                await this.sendAndWait('show onu status', 300)
                const statusOut = await this.waitForPrompt(/#/, 5000)
                const onus = this.parseONUStatus(statusOut)
                console.log(`    Found ${onus.length} ONUs`)

                // Check descriptions
                for (const onu of onus) {
                    const index = onu.onuId.match(/:(\d+)$/)?.[1]
                    if (!index) continue

                    await this.sendAndWait(`show onu ${index} description`, 200)
                    const descOut = await this.waitForPrompt(/#/, 2000)
                    const description = this.parseDescription(descOut)

                    if (description?.toLowerCase() === searchDesc) {
                        console.log(`    ✅ Found: ${description}`)

                        // Exit interface
                        await this.sendAndWait('exit', 200)

                        return {
                            ...onu,
                            description,
                            port,
                        }
                    }
                }

                // Exit interface
                await this.sendAndWait('exit', 200)
                await this.waitForPrompt(/#/, 1000)
            }

            console.log(`  ❌ ONU not found on any port`)
            return null
        } finally {
            this.disconnect()
        }
    }
}

function formatONUInfo(info: ONUInfo): string {
    const statusEmoji = info.status === 'Online' ? '🟢' : '🔴'
    return `${statusEmoji} ONU Status: ${info.status}
  - ONU ID: ${info.onuId}
  - MAC: ${info.macAddress}
  - Distance: ${info.distanceMeters}m
  - RTT: ${info.rtt} TQ
  - Uptime: ${info.aliveTime}
  - Port: EPON ${info.port}`
}

async function main() {
    const target = process.argv[2] || 'jamildib'
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║           OLT Telnet Service Test (Standalone)             ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log(`\nSearching for ONU: "${target}"\n`)

    for (const config of OLT_CONFIGS) {
        console.log('='.repeat(60))
        console.log(`Testing ${config.name} (${config.host}:${config.port})`)
        console.log('='.repeat(60))

        const tester = new OLTTester(config)
        const result = await tester.searchForONU(target)

        if (result) {
            console.log('\n' + '='.repeat(60))
            console.log(`🎉 FOUND on ${config.name}!`)
            console.log('='.repeat(60))
            console.log(formatONUInfo(result))
            console.log()
        }
    }

    console.log('\n✅ Test complete')
}

main().catch(console.error)
