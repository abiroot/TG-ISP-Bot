/**
 * OLT1 Service
 *
 * Queries the OLT1 system to get ONU (Optical Network Unit) status information.
 * Used when a customer's Mikrotik Interface contains "OLT1" to show fiber connection status.
 *
 * OLT1 API: https://185.170.131.29/action/onuauthinfo.html
 */

import { env } from '~/config/env'
import { createFlowLogger } from '~/core/utils/logger'
import { Agent, fetch as undiciFetch } from 'undici'

const olt1Logger = createFlowLogger('olt1-service')

/**
 * Custom dispatcher that allows self-signed/expired certificates
 */
const insecureDispatcher = new Agent({
    connect: {
        rejectUnauthorized: false,
    },
})

/**
 * ONU (Optical Network Unit) Information
 */
export interface ONUInfo {
    onuId: string // e.g., "EPON0/2:3"
    status: 'Online' | 'Offline'
    macAddress: string
    description: string
    rtt: number // Round Trip Time in TQ
    type: string // e.g., "1GE"
    authFlag: string // e.g., "Auth" or "Unauth"
    exchange: string // e.g., "Finish" or "MPCP DEREG"
    authMode: string
    loid: string
}

/**
 * OLT1 Service Configuration
 */
interface OLT1Config {
    baseUrl: string
    username: string
    password: string
    enabled: boolean
}


/**
 * OLT1 Service
 *
 * Handles ONU status lookups from the OLT1 fiber system.
 * Manages authentication and session keys for API access.
 */
export class OLT1Service {
    private config: OLT1Config
    private sessionKey: string | null = null
    private sessionExpiry: number = 0 // Timestamp when session expires
    private static readonly SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutes

    constructor() {
        this.config = {
            baseUrl: env.OLT1_BASE_URL,
            username: env.OLT1_USERNAME,
            password: env.OLT1_PASSWORD,
            enabled: env.OLT1_ENABLED,
        }

        olt1Logger.info(
            { enabled: this.config.enabled, baseUrl: this.config.baseUrl },
            'OLT1Service initialized'
        )
    }

    /**
     * Login to OLT1 and get a session key
     *
     * The OLT1 system uses session keys embedded in URL query strings.
     * After login, we fetch a page that contains links with SessionKey=xxxxx
     *
     * @returns Session key if successful, null otherwise
     */
    private async login(): Promise<string | null> {
        try {
            olt1Logger.info('Logging in to OLT1 system')

            // Step 1: Authenticate
            const formData = new URLSearchParams({
                user: this.config.username,
                pass: this.config.password,
                button: 'Login',
                who: '100',
            })

            const loginResponse = await undiciFetch(`${this.config.baseUrl}/action/main.html`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                },
                body: formData.toString(),
                dispatcher: insecureDispatcher,
            })

            if (!loginResponse.ok) {
                olt1Logger.error(
                    { status: loginResponse.status, statusText: loginResponse.statusText },
                    'OLT1 login request failed'
                )
                return null
            }

            // Check for login redirect (means credentials are wrong)
            const loginHtml = await loginResponse.text()
            if (loginHtml.includes('login.html') || loginHtml.includes('Login failed')) {
                olt1Logger.error('OLT1 login failed - invalid credentials')
                return null
            }

            // Step 2: Fetch ONU page to get session key from embedded URLs
            // The session key is in URL query strings like: SessionKey=xxxxx
            const onuResponse = await undiciFetch(`${this.config.baseUrl}/action/onuauthinfo.html`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                },
                dispatcher: insecureDispatcher,
            })

            if (!onuResponse.ok) {
                olt1Logger.error(
                    { status: onuResponse.status },
                    'Failed to fetch ONU page after login'
                )
                return null
            }

            const onuHtml = await onuResponse.text()

            // Extract SessionKey from URL patterns like: SessionKey=fgzki
            const sessionKeyMatch = onuHtml.match(/SessionKey=([a-zA-Z0-9]+)/i)
            if (sessionKeyMatch && sessionKeyMatch[1]) {
                const newSessionKey = sessionKeyMatch[1]
                this.sessionKey = newSessionKey
                this.sessionExpiry = Date.now() + OLT1Service.SESSION_TTL_MS

                olt1Logger.info(
                    { sessionKey: newSessionKey },
                    'OLT1 login successful, session key obtained from URL'
                )

                return newSessionKey
            }

            olt1Logger.error(
                { htmlPreview: onuHtml.substring(0, 300) },
                'Could not extract session key from OLT1 ONU page'
            )
            return null
        } catch (error) {
            olt1Logger.error({ err: error }, 'OLT1 login failed with exception')
            return null
        }
    }

    /**
     * Ensure we have a valid session key, login if needed
     */
    private async ensureSession(): Promise<boolean> {
        // Check if we have a valid session
        if (this.sessionKey && Date.now() < this.sessionExpiry) {
            return true
        }

        // Need to login
        const sessionKey = await this.login()
        return sessionKey !== null
    }

    /**
     * Check if a response indicates we need to re-authenticate
     */
    private needsReauth(html: string): boolean {
        // Check for login redirect patterns
        return html.includes('login.html') ||
               html.includes('window.top.location.href') ||
               html.includes('Please login') ||
               html.includes('Session expired')
    }

    /**
     * Check if OLT1 service is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled
    }

    /**
     * Extract ONU username from Mikrotik Interface
     *
     * For interfaces like "(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1"
     * Returns the last segment after the last "-": "eliehajjarb1"
     */
    extractONUUsername(mikrotikInterface: string): string | null {
        if (!mikrotikInterface) return null

        // Check if interface contains OLT1 (case-insensitive)
        if (!mikrotikInterface.toUpperCase().includes('OLT1')) {
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
     * Query OLT1 system for ONU information by description
     *
     * @param description - ONU description/username to search for
     * @returns ONU info if found, null otherwise
     */
    async getONUInfo(description: string): Promise<ONUInfo | null> {
        if (!this.config.enabled) {
            olt1Logger.warn('OLT1 service is disabled')
            return null
        }

        // Try up to 2 times (initial + 1 retry after re-auth)
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                // Ensure we have a valid session
                const hasSession = await this.ensureSession()
                if (!hasSession) {
                    olt1Logger.error('Failed to obtain OLT1 session')
                    return null
                }

                olt1Logger.info({ description, attempt }, 'Querying OLT1 for ONU info')

                // OLT1 search is case-sensitive, descriptions are typically lowercase
                const searchDescription = description.toLowerCase()

                const formData = new URLSearchParams({
                    select: '255', // All ports
                    onutype: '0', // Authentication
                    searchMac: '',
                    searchDescription: searchDescription,
                    onuid: '0/',
                    select2: '1/',
                    who: '300', // Search by description
                    SessionKey: this.sessionKey!,
                })

                const response = await undiciFetch(`${this.config.baseUrl}/action/onuauthinfo.html`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Referer': `${this.config.baseUrl}/action/onuauthinfo.html`,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    },
                    body: formData.toString(),
                    dispatcher: insecureDispatcher,
                })

                if (!response.ok) {
                    olt1Logger.error(
                        { status: response.status, statusText: response.statusText },
                        'OLT1 request failed'
                    )
                    return null
                }

                const html = await response.text()

                // Check if we got redirected to login (session expired)
                if (this.needsReauth(html)) {
                    olt1Logger.warn({ attempt }, 'OLT1 session expired, re-authenticating')
                    // Invalidate session and retry
                    this.sessionKey = null
                    this.sessionExpiry = 0
                    continue
                }

                return this.parseONUInfoFromHTML(html, description)
            } catch (error) {
                olt1Logger.error({ err: error, description, attempt }, 'Failed to query OLT1')
                if (attempt === 0) {
                    // Invalidate session and try once more
                    this.sessionKey = null
                    this.sessionExpiry = 0
                    continue
                }
                return null
            }
        }

        olt1Logger.error({ description }, 'Failed to query OLT1 after retries')
        return null
    }

    /**
     * Parse ONU information from OLT1 HTML response
     *
     * The HTML contains a table with ONU information. We need to find the row
     * that matches our description and extract the relevant fields.
     */
    private parseONUInfoFromHTML(html: string, targetDescription: string): ONUInfo | null {
        try {
            // Look for table rows with ONU data
            // Pattern: <tr><td class='hd'>EPON0/2:3</td>...<td>deirkyeme</td>...
            const targetLower = targetDescription.toLowerCase()

            // Find all table rows
            const rowMatches = html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)

            for (const rowMatch of rowMatches) {
                const row = rowMatch[0]

                // Extract all TD contents
                const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
                if (tdMatches.length < 10) continue

                // Extract text from each cell
                const cells = tdMatches.map((m) => this.stripHtml(m[1]))

                // Cell indices based on OLT1 table structure:
                // 0: ONU ID (EPON0/2:3)
                // 1: Status (Online/Offline)
                // 2: MAC Address
                // 3: Description
                // 4: RTT
                // 5: Type
                // 6: Auth Flag
                // 7: Exchange
                // 8: Auth Mode
                // 9: Loid/pwd
                // 10: Action

                const description = cells[3]?.trim()
                if (!description) continue

                // Check if this row matches our target description (case-insensitive)
                if (description.toLowerCase() === targetLower) {
                    const onuInfo: ONUInfo = {
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

                    olt1Logger.info(
                        { description, onuId: onuInfo.onuId, status: onuInfo.status },
                        'ONU info found'
                    )

                    return onuInfo
                }
            }

            olt1Logger.warn({ description: targetDescription }, 'ONU not found in OLT1 response')
            return null
        } catch (error) {
            olt1Logger.error({ err: error }, 'Failed to parse OLT1 HTML response')
            return null
        }
    }

    /**
     * Strip HTML tags and decode entities
     */
    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ') // Decode common entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
    }

    /**
     * Format ONU info for display
     */
    formatONUInfo(onuInfo: ONUInfo): string {
        const statusEmoji = onuInfo.status === 'Online' ? '🟢' : '🔴'

        return `${statusEmoji} <b>ONU Status:</b> ${onuInfo.status}
  - <b>ONU ID:</b> <code>${onuInfo.onuId}</code>
  - <b>MAC:</b> <code>${onuInfo.macAddress}</code>
  - <b>Type:</b> ${onuInfo.type}
  - <b>RTT:</b> ${onuInfo.rtt} TQ`
    }
}

/**
 * Singleton instance
 */
export const olt1Service = new OLT1Service()
