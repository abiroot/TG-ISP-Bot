/**
 * OLT Telnet Service
 *
 * Communicates with EPON OLT devices via Telnet to query ONU status.
 * Uses Node.js built-in `net` module - no external dependencies.
 *
 * Supported commands:
 * - show onu status: Get all ONU status (online/offline, MAC, RTT, distance)
 * - show onu <ID> description: Get ONU customer name/description
 */

import * as net from 'net'
import { createFlowLogger } from '~/core/utils/logger'

const oltLogger = createFlowLogger('olt-telnet')

/**
 * ONU Status from `show onu status` command
 */
export interface ONUStatus {
    onuId: string          // e.g., "EPON0/1:3"
    status: 'Online' | 'Offline'
    macAddress: string
    distanceMeters: number
    rtt: number            // Round Trip Time in TQ
    lastRegTime: string    // Last registration time
    lastDeregTime: string  // Last deregistration time
    lastDeregReason: string // Why it went offline (Power Off, Wire Down, etc.)
    aliveTime: string      // Current uptime
}

/**
 * ONU Optical Module Information from `show onu <id> optical-transceiver-diagnosis`
 */
export interface ONUOpticalInfo {
    temperature: string     // e.g., "37.00 °C"
    supplyVoltage: string   // e.g., "3.30 V"
    biasCurrent: string     // e.g., "8.00 mA"
    transmitPower: string   // e.g., "1.67 mW (2.21 dBm)"
    receivePower: string    // e.g., "0.04 mW (-14.56 dBm)"
}

/**
 * ONU Port Information from `show onu <id> port`
 */
export interface ONUPortInfo {
    linkStatus: string      // e.g., "Up" or "Down"
}

/**
 * Complete ONU Information (status + description + detailed info)
 */
export interface ONUInfo {
    onuId: string
    status: 'Online' | 'Offline'
    macAddress: string
    description: string
    rtt: number
    distanceMeters: number
    aliveTime: string
    lastRegTime: string     // Last registration time
    lastDeregTime: string   // Last time it went offline
    lastDeregReason: string // Reason for last offline (Power Off, Wire Down, etc.)
    port: string            // EPON port (0/1, 0/2, etc.)
    // Detailed info (optional - only optical and port status are fetched)
    opticalInfo?: ONUOpticalInfo
    portInfo?: ONUPortInfo
}

/**
 * OLT Telnet Configuration
 */
export interface OLTConfig {
    name: string           // For logging (e.g., "OLT1", "OLT2")
    host: string
    port: number
    username: string
    password: string
    enablePassword: string
    enabled: boolean
    connectionTimeout: number
    commandTimeout: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<OLTConfig> = {
    port: 23,
    username: 'admin',
    password: 'Mikrotik1',
    enablePassword: 'Mikrotik1',
    enabled: true,
    connectionTimeout: 20000,  // 20 seconds
    commandTimeout: 10000,     // 10 seconds per command
}

/**
 * EPON ports to search
 */
const EPON_PORTS = ['0/1', '0/2', '0/3', '0/4']

/**
 * OLT Telnet Service
 *
 * Handles telnet communication with EPON OLT devices.
 */
export class OLTTelnetService {
    protected config: OLTConfig
    private socket: net.Socket | null = null
    private buffer: string = ''

    // ONU info cache with TTL
    private onuCache = new Map<string, { data: ONUInfo; timestamp: number }>()
    private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

    // Connection pooling state
    private isAuthenticated = false
    private lastActivity = 0
    private readonly CONNECTION_TTL_MS = 5 * 60 * 1000 // 5 minutes - close idle connections

    constructor(config: Partial<OLTConfig> & { name: string; host: string }) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        } as OLTConfig

        oltLogger.info(
            { name: this.config.name, host: this.config.host, enabled: this.config.enabled },
            'OLTTelnetService initialized'
        )
    }

    /**
     * Check if service is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled
    }

    /**
     * Clear the ONU info cache
     */
    clearCache(): void {
        this.onuCache.clear()
        oltLogger.debug({ name: this.config.name }, 'ONU cache cleared')
    }

    /**
     * Extract ONU username from Mikrotik Interface
     *
     * For interfaces like "(VM-PPPoe4)-vlan2021-olt1-zone7-jamildib"
     * Returns the last segment after the last "-": "jamildib"
     */
    extractONUUsername(mikrotikInterface: string, oltPattern: string): string | null {
        if (!mikrotikInterface) return null

        // Check if interface contains the OLT pattern (case-insensitive)
        if (!mikrotikInterface.toUpperCase().includes(oltPattern.toUpperCase())) {
            return null
        }

        // Split by "-" and get the last part
        const parts = mikrotikInterface.split('-')
        if (parts.length < 2) return null

        const lastPart = parts[parts.length - 1].trim()
        if (!lastPart) return null

        return lastPart
    }

    /**
     * Connect to OLT via telnet
     */
    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.socket) {
                    this.socket.destroy()
                    this.socket = null
                }
                reject(new Error(`Connection timeout to ${this.config.host}:${this.config.port}`))
            }, this.config.connectionTimeout)

            this.socket = new net.Socket()
            this.buffer = ''

            this.socket.on('data', (data) => {
                // Just accumulate data - let waitForPrompt handle pattern matching
                this.buffer += data.toString()
            })

            this.socket.on('error', (err) => {
                clearTimeout(timeout)
                oltLogger.error({ err, host: this.config.host }, 'Socket error')
                reject(err)
            })

            this.socket.on('close', () => {
                oltLogger.debug({ host: this.config.host }, 'Socket closed')
            })

            this.socket.connect(this.config.port, this.config.host, () => {
                clearTimeout(timeout)
                oltLogger.debug({ host: this.config.host }, 'Connected to OLT')
                resolve()
            })
        })
    }

    /**
     * Send command (simplified - just sends, use waitForPrompt after)
     */
    private async sendCommand(command: string, delayMs: number = 200): Promise<void> {
        if (!this.socket) {
            throw new Error('Not connected')
        }

        // Small delay before sending
        await this.sleep(delayMs)
        this.socket.write(command + '\r\n')
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Wait for specific prompt
     */
    private waitForPrompt(promptPattern: RegExp, timeoutMs: number = 3000): Promise<string> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now()
            const checkInterval = setInterval(() => {
                if (promptPattern.test(this.buffer)) {
                    clearInterval(checkInterval)
                    const response = this.buffer
                    this.buffer = ''
                    resolve(response)
                } else if (Date.now() - startTime > timeoutMs) {
                    clearInterval(checkInterval)
                    const response = this.buffer
                    this.buffer = ''
                    resolve(response) // Return what we have
                }
            }, 100)
        })
    }

    /**
     * Disconnect from OLT
     */
    private disconnect(): void {
        if (this.socket) {
            try {
                this.socket.write('quit\r\n')
                this.socket.destroy()
            } catch {
                // Ignore errors during disconnect
            }
            this.socket = null
        }
        this.buffer = ''
        this.isAuthenticated = false
        this.lastActivity = 0
    }

    /**
     * Force disconnect (for graceful shutdown or explicit cleanup)
     */
    forceDisconnect(): void {
        oltLogger.debug({ name: this.config.name }, 'Force disconnecting pooled connection')
        this.disconnect()
    }

    /**
     * Ensure connection is established and authenticated (connection pooling)
     *
     * Reuses existing connection if still valid, otherwise establishes a new one.
     * Connection is considered valid if:
     * - Socket is connected
     * - Already authenticated
     * - Last activity was within CONNECTION_TTL_MS
     */
    private async ensureConnection(): Promise<boolean> {
        const now = Date.now()

        // Check if existing connection is still valid
        if (this.socket && this.isAuthenticated) {
            if (now - this.lastActivity < this.CONNECTION_TTL_MS) {
                this.lastActivity = now
                oltLogger.debug(
                    { name: this.config.name, idleMs: now - this.lastActivity },
                    'Reusing pooled connection'
                )
                return true
            }
            // Connection expired, disconnect and reconnect
            oltLogger.debug(
                { name: this.config.name, idleMs: now - this.lastActivity },
                'Pooled connection expired, reconnecting'
            )
            this.disconnect()
        }

        // Establish new connection
        try {
            await this.connect()
            const authenticated = await this.authenticate()
            if (authenticated) {
                this.isAuthenticated = true
                this.lastActivity = now
                oltLogger.debug({ name: this.config.name }, 'New pooled connection established')
                return true
            }
        } catch (error) {
            oltLogger.error({ err: error, name: this.config.name }, 'Failed to establish pooled connection')
            this.disconnect()
        }

        return false
    }

    /**
     * Authenticate with OLT (login + enable mode)
     */
    private async authenticate(): Promise<boolean> {
        try {
            // Wait for login prompt
            await this.waitForPrompt(/Login:/i, 10000)

            // Send username
            await this.sendCommand(this.config.username, 400)
            await this.waitForPrompt(/Password:/i, 6000)

            // Send password (increased delay and timeout for slower connections)
            await this.sendCommand(this.config.password, 1000)
            const loginResponse = await this.waitForPrompt(/>/, 10000)

            if (!loginResponse.includes('>')) {
                oltLogger.error({ response: loginResponse.substring(0, 200) }, 'Login failed - no user prompt received')
                return false
            }

            // Enter enable mode
            await this.sendCommand('enable', 1000)
            await this.waitForPrompt(/Password:/i, 6000)

            // Send enable password
            await this.sendCommand(this.config.enablePassword, 1000)
            const enableResponse = await this.waitForPrompt(/#/, 10000)

            if (!enableResponse.includes('#')) {
                oltLogger.error({ response: enableResponse.substring(0, 200) }, 'Enable mode failed - no privileged prompt received')
                return false
            }

            // Disable pagination
            await this.sendCommand('terminal length 0', 1000)
            await this.waitForPrompt(/#/, 6000)

            oltLogger.debug({ host: this.config.host }, 'Authentication successful')
            return true
        } catch (error) {
            oltLogger.error({ err: error }, 'Authentication failed')
            return false
        }
    }

    /**
     * Enter configuration mode and select EPON interface
     */
    private async selectInterface(port: string): Promise<boolean> {
        try {
            // Enter config mode
            await this.sendCommand('configure terminal', 300)
            await this.waitForPrompt(/\(config\)#/, 2000)

            // Select EPON interface
            await this.sendCommand(`interface epon ${port}`, 300)
            const response = await this.waitForPrompt(/\(config-pon-/, 2000)

            return response.includes(`config-pon-${port}`)
        } catch (error) {
            oltLogger.error({ err: error, port }, 'Failed to select interface')
            return false
        }
    }

    /**
     * Exit interface mode
     */
    private async exitInterface(): Promise<void> {
        await this.sendCommand('exit', 200)
        await this.waitForPrompt(/#/, 1000)
    }

    /**
     * Parse `show onu status` output
     *
     * Format:
     * ONU-ID      Status    MAC  Address         Distance(m)  RTT(TQ) LastRegTime             LastDeregTime           LastDeregReason    AliveTime    Upgrade
     * EPON0/1:1   online    74:a0:63:7e:d6:a8    1436         972     1907/12/27 01:26:01     N/A                     N/A               42 02:24:43  N/A
     */
    private parseONUStatus(output: string): ONUStatus[] {
        const onus: ONUStatus[] = []
        const lines = output.split('\n')

        for (const line of lines) {
            // Match core fields: EPON ID, status, MAC, distance, RTT
            const coreMatch = line.match(
                /^\s*(EPON\d+\/\d+:\d+)\s+(online|offline)\s+([0-9a-f:]+)\s+(\d+)\s+(\d+)\s+/i
            )

            if (coreMatch) {
                // Extract AliveTime - it's in format "DD HH:MM:SS" or just "HH:MM:SS"
                // Look for pattern near end of line before optional "N/A" and trailing whitespace
                const aliveTimeMatch = line.match(/(\d+\s+\d{2}:\d{2}:\d{2}|\d{2}:\d{2}:\d{2})\s+(?:N\/A)?\s*$/i)
                const aliveTime = aliveTimeMatch ? aliveTimeMatch[1] : 'N/A'

                // Extract fields after RTT: LastRegTime, LastDeregTime, LastDeregReason
                const afterRtt = line.substring(coreMatch[0].length)

                // LastRegTime (date/time or N/A)
                const lastRegMatch = afterRtt.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}|N\/A)/i)
                const lastRegTime = lastRegMatch ? lastRegMatch[1] : 'N/A'

                // Extract LastDeregTime and LastDeregReason
                let lastDeregTime = 'N/A'
                let lastDeregReason = 'N/A'

                if (lastRegMatch) {
                    const afterLastReg = afterRtt.substring(lastRegMatch[0].length)
                    // Match LastDeregTime
                    const lastDeregTimeMatch = afterLastReg.match(/^\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}|N\/A)/i)
                    if (lastDeregTimeMatch) {
                        lastDeregTime = lastDeregTimeMatch[1]
                        const afterDeregTime = afterLastReg.substring(lastDeregTimeMatch[0].length)
                        // Match LastDeregReason - typically "Power Off", "Wire Down", "N/A", etc.
                        const reasonMatch = afterDeregTime.match(/^\s+([A-Za-z][A-Za-z\s/]*?)(?=\s+\d)/i)
                        if (reasonMatch && reasonMatch[1]) {
                            lastDeregReason = reasonMatch[1].trim()
                        }
                    }
                }

                onus.push({
                    onuId: coreMatch[1],
                    status: coreMatch[2].toLowerCase() === 'online' ? 'Online' : 'Offline',
                    macAddress: coreMatch[3],
                    distanceMeters: parseInt(coreMatch[4], 10),
                    rtt: parseInt(coreMatch[5], 10),
                    lastRegTime: lastRegTime,
                    lastDeregTime: lastDeregTime,
                    lastDeregReason: lastDeregReason,
                    aliveTime: aliveTime.trim(),
                })
            }
        }

        return onus
    }

    /**
     * Parse `show onu <id> description` output
     */
    private parseONUDescription(output: string): string | null {
        // Match: description         : rogersaade
        const match = output.match(/description\s*:\s*(\S+)/i)
        return match ? match[1].trim() : null
    }

    /**
     * Parse `show onu <id> ctc opm_diag` output
     *
     * Format:
     * Temperature         : 37.00 C
     * Supply Voltage      : 3.31 V
     * TX Bias Current     : 8.00 mA
     * TX Power            : 1.63 mW (2.13 dBm)
     * RX Power            : 0.04 mW (-14.55 dBm)
     */
    private parseOpticalInfo(output: string): ONUOpticalInfo | null {
        // Temperature : 37.00 C
        const tempMatch = output.match(/Temperature\s*:\s*([\d.]+)\s*C/i)
        // Supply Voltage : 3.31 V
        const voltageMatch = output.match(/Supply\s*Voltage\s*:\s*([\d.]+)\s*V/i)
        // TX Bias Current : 8.00 mA
        const currentMatch = output.match(/TX\s*Bias\s*Current\s*:\s*([\d.]+)\s*mA/i)
        // TX Power : 1.63 mW (2.13 dBm)
        const txPowerMatch = output.match(/TX\s*Power\s*:\s*([\d.]+)\s*mW\s*\(([-\d.]+)\s*dBm\)/i)
        // RX Power : 0.04 mW (-14.55 dBm)
        const rxPowerMatch = output.match(/RX\s*Power\s*:\s*([\d.]+)\s*mW\s*\(([-\d.]+)\s*dBm\)/i)

        if (!tempMatch && !rxPowerMatch) {
            return null
        }

        const txPower = txPowerMatch
            ? `${txPowerMatch[1]} mW (${txPowerMatch[2]} dBm)`
            : 'N/A'
        const rxPower = rxPowerMatch
            ? `${rxPowerMatch[1]} mW (${rxPowerMatch[2]} dBm)`
            : 'N/A'

        return {
            temperature: tempMatch ? `${tempMatch[1]} °C` : 'N/A',
            supplyVoltage: voltageMatch ? `${voltageMatch[1]} V` : 'N/A',
            biasCurrent: currentMatch ? `${currentMatch[1]} mA` : 'N/A',
            transmitPower: txPower,
            receivePower: rxPower,
        }
    }

    /**
     * Parse `show onu <id> ctc eth 1 linkstate` output
     *
     * Format:
     * Ethernet link state: up
     * or
     * Ethernet link state: down
     * or just: up / down
     */
    private parsePortInfo(output: string): ONUPortInfo | null {
        // Try various formats
        const linkMatch = output.match(/(?:Ethernet\s*)?(?:link\s*)?state\s*:\s*(up|down)/i)
            || output.match(/\b(up|down)\b/i)

        if (!linkMatch) {
            return null
        }

        const status = linkMatch[1].toLowerCase()
        return {
            linkStatus: status === 'up' ? 'Up' : 'Down',
        }
    }

    /**
     * Get ONU index from ONU ID (e.g., "EPON0/1:3" -> "3")
     */
    private getONUIndex(onuId: string): string | null {
        const match = onuId.match(/:(\d+)$/)
        return match ? match[1] : null
    }

    /**
     * Get all ONUs with their descriptions from a specific port
     */
    private async getONUsFromPort(port: string): Promise<Array<ONUStatus & { description: string }>> {
        const results: Array<ONUStatus & { description: string }> = []

        // Select interface
        const selected = await this.selectInterface(port)
        if (!selected) {
            oltLogger.warn({ port }, 'Failed to select interface')
            return results
        }

        // Get ONU status
        await this.sendCommand('show onu status', 300)
        const statusOutput = await this.waitForPrompt(/#/, 5000)
        const onus = this.parseONUStatus(statusOutput)

        oltLogger.debug({ port, onuCount: onus.length }, 'Found ONUs on port')

        // Get description for each ONU
        for (const onu of onus) {
            const index = this.getONUIndex(onu.onuId)
            if (!index) continue

            await this.sendCommand(`show onu ${index} description`, 200)
            const descOutput = await this.waitForPrompt(/#/, 2000)
            const description = this.parseONUDescription(descOutput)

            if (description) {
                results.push({ ...onu, description })
            }
        }

        // Exit interface
        await this.exitInterface()

        return results
    }

    /**
     * Fetch detailed information for a specific ONU using CTC commands
     * Must be called while already in the interface context
     * Only fetches optical info and port status (displayed in UI)
     */
    private async fetchDetailedONUInfo(index: string): Promise<{
        opticalInfo?: ONUOpticalInfo
        portInfo?: ONUPortInfo
    }> {
        const result: {
            opticalInfo?: ONUOpticalInfo
            portInfo?: ONUPortInfo
        } = {}

        try {
            // Fetch optical info using CTC command
            await this.sendCommand(`show onu ${index} ctc opm_diag`, 300)
            const opticalOutput = await this.waitForPrompt(/#/, 3000)
            result.opticalInfo = this.parseOpticalInfo(opticalOutput) ?? undefined

            // Fetch port link state using CTC eth command
            await this.sendCommand(`show onu ${index} ctc eth 1 linkstate`, 300)
            const portOutput = await this.waitForPrompt(/#/, 3000)
            result.portInfo = this.parsePortInfo(portOutput) ?? undefined

            oltLogger.debug(
                {
                    index,
                    hasOpticalInfo: !!result.opticalInfo,
                    hasPortInfo: !!result.portInfo,
                },
                'Fetched detailed ONU info'
            )
        } catch (error) {
            oltLogger.error({ err: error, index }, 'Failed to fetch detailed ONU info')
        }

        return result
    }

    /**
     * Search for ONU by description across all EPON ports
     *
     * @param targetDescription - The ONU description to search for (case-insensitive)
     * @returns ONU info if found, null otherwise
     */
    async getONUInfo(targetDescription: string): Promise<ONUInfo | null> {
        if (!this.config.enabled) {
            oltLogger.warn({ name: this.config.name }, 'Service is disabled')
            return null
        }

        const searchDescription = targetDescription.toLowerCase()
        const cacheKey = `${this.config.name}:${searchDescription}`

        // Check cache first
        const cached = this.onuCache.get(cacheKey)
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            oltLogger.debug(
                { name: this.config.name, description: targetDescription, cacheAge: Date.now() - cached.timestamp },
                'Returning cached ONU info'
            )
            return cached.data
        }

        oltLogger.info(
            { name: this.config.name, description: targetDescription },
            'Searching for ONU'
        )

        try {
            // Use pooled connection (reuses existing if valid)
            const connected = await this.ensureConnection()
            if (!connected) {
                oltLogger.error({ name: this.config.name }, 'Failed to establish connection')
                return null
            }

            // Search each EPON port
            for (const port of EPON_PORTS) {
                oltLogger.debug({ name: this.config.name, port }, 'Searching port')

                const onus = await this.getONUsFromPort(port)

                // Find matching ONU
                const match = onus.find(
                    (onu) => onu.description.toLowerCase() === searchDescription
                )

                if (match) {
                    oltLogger.info(
                        {
                            name: this.config.name,
                            description: targetDescription,
                            onuId: match.onuId,
                            status: match.status
                        },
                        'ONU found'
                    )

                    // Re-enter interface to fetch detailed info
                    const index = this.getONUIndex(match.onuId)
                    let detailedInfo: {
                        opticalInfo?: ONUOpticalInfo
                        portInfo?: ONUPortInfo
                    } = {}

                    if (index) {
                        const reselected = await this.selectInterface(port)
                        if (reselected) {
                            detailedInfo = await this.fetchDetailedONUInfo(index)
                            await this.exitInterface()
                        }
                    }

                    const result: ONUInfo = {
                        onuId: match.onuId,
                        status: match.status,
                        macAddress: match.macAddress,
                        description: match.description,
                        rtt: match.rtt,
                        distanceMeters: match.distanceMeters,
                        aliveTime: match.aliveTime,
                        lastRegTime: match.lastRegTime,
                        lastDeregTime: match.lastDeregTime,
                        lastDeregReason: match.lastDeregReason,
                        port: port,
                        ...detailedInfo,
                    }

                    // Store in cache
                    this.onuCache.set(cacheKey, { data: result, timestamp: Date.now() })
                    oltLogger.debug(
                        { name: this.config.name, description: targetDescription, cacheKey },
                        'ONU info cached'
                    )

                    return result
                }
            }

            oltLogger.warn(
                { name: this.config.name, description: targetDescription },
                'ONU not found on any port'
            )
            return null
        } catch (error) {
            oltLogger.error(
                { err: error, name: this.config.name, description: targetDescription },
                'Failed to query OLT'
            )
            // Disconnect on error to reset state (next call will reconnect)
            this.disconnect()
            return null
        }
        // Note: No finally { disconnect() } - connection stays pooled for reuse
    }

    /**
     * Format ONU info for display (Telegram HTML)
     */
    formatONUInfo(onuInfo: ONUInfo): string {
        const statusEmoji = onuInfo.status === 'Online' ? '🟢' : '🔴'
        const linkEmoji = onuInfo.portInfo?.linkStatus === 'Up' ? '🔗' : '⛓️‍💥'

        let output = `${statusEmoji} <b>ONU Status:</b> ${onuInfo.status}`

        // Add Link Status at the top if available
        if (onuInfo.portInfo?.linkStatus) {
            output += `\n${linkEmoji} <b>Link Status:</b> ${onuInfo.portInfo.linkStatus}`
        }

        // Basic status info
        output += `\n  - <b>ONU ID:</b> <code>${onuInfo.onuId}</code>`
        output += `\n  - <b>MAC:</b> <code>${onuInfo.macAddress}</code>`
        output += `\n  - <b>Distance:</b> ${onuInfo.distanceMeters}m`
        output += `\n  - <b>Uptime:</b> ${onuInfo.aliveTime}`

        // Add registration time if available
        if (onuInfo.lastRegTime && onuInfo.lastRegTime !== 'N/A') {
            output += `\n  - <b>Last Registration:</b> ${onuInfo.lastRegTime}`
        }

        // Add deregistration info if ONU was ever offline
        if (onuInfo.lastDeregTime && onuInfo.lastDeregTime !== 'N/A') {
            output += `\n  - <b>Last Offline:</b> ${onuInfo.lastDeregTime}`
            if (onuInfo.lastDeregReason && onuInfo.lastDeregReason !== 'N/A') {
                output += ` (${onuInfo.lastDeregReason})`
            }
        }

        // Optical Module Information
        if (onuInfo.opticalInfo) {
            const o = onuInfo.opticalInfo
            output += `\n\n<b>💡 Optical Info:</b>`
            output += `\n  - <b>Temperature:</b> ${o.temperature}`
            output += `\n  - <b>Voltage:</b> ${o.supplyVoltage}`
            output += `\n  - <b>Bias Current:</b> ${o.biasCurrent}`
            output += `\n  - <b>TX Power:</b> ${o.transmitPower}`
            output += `\n  - <b>RX Power:</b> ${o.receivePower}`
        }

        return output
    }
}
