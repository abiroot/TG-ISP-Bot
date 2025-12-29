/**
 * OLT2 Service
 *
 * Queries the OLT2 system to get ONU (Optical Network Unit) status information.
 * Used when a customer's Mikrotik Interface contains "OLT2" to show fiber connection status.
 *
 * OLT2 API: https://185.170.131.28/action/onuauthinfo.html
 */

import { env } from '~/config/env'
import { createFlowLogger } from '~/core/utils/logger'
import { Agent, fetch as undiciFetch } from 'undici'

const olt2Logger = createFlowLogger('olt2-service')

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
 * OLT2 Service Configuration
 */
interface OLT2Config {
    baseUrl: string
    enabled: boolean
}


/**
 * OLT2 Service
 *
 * Handles ONU status lookups from the OLT2 fiber system.
 */
export class OLT2Service {
    private config: OLT2Config
    private sessionKey: string = 'gzxuh' // Default session key

    constructor() {
        this.config = {
            baseUrl: env.OLT2_BASE_URL,
            enabled: env.OLT2_ENABLED,
        }

        olt2Logger.info(
            { enabled: this.config.enabled, baseUrl: this.config.baseUrl },
            'OLT2Service initialized'
        )
    }

    /**
     * Check if OLT2 service is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled
    }

    /**
     * Extract ONU username from Mikrotik Interface
     *
     * For interfaces like "(VM-PPPoe4)-vlan1502-OLT2-PON1-SAIIDKHOUDARJE"
     * Returns the last segment after the last "-": "SAIIDKHOUDARJE"
     */
    extractONUUsername(mikrotikInterface: string): string | null {
        if (!mikrotikInterface) return null

        // Check if interface contains OLT2 (case-insensitive)
        if (!mikrotikInterface.toUpperCase().includes('OLT2')) {
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
     * Query OLT2 system for ONU information by description
     *
     * @param description - ONU description/username to search for
     * @returns ONU info if found, null otherwise
     */
    async getONUInfo(description: string): Promise<ONUInfo | null> {
        if (!this.config.enabled) {
            olt2Logger.warn('OLT2 service is disabled')
            return null
        }

        try {
            olt2Logger.info({ description }, 'Querying OLT2 for ONU info')

            const formData = new URLSearchParams({
                select: '255', // All ports
                onutype: '0', // Authentication
                searchMac: '',
                searchDescription: description,
                onuid: '0/',
                select2: '1/',
                who: '300', // Search by description
                SessionKey: this.sessionKey,
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
                olt2Logger.error(
                    { status: response.status, statusText: response.statusText },
                    'OLT2 request failed'
                )
                return null
            }

            const html = await response.text()
            return this.parseONUInfoFromHTML(html, description)
        } catch (error) {
            olt2Logger.error({ err: error, description }, 'Failed to query OLT2')
            return null
        }
    }

    /**
     * Parse ONU information from OLT2 HTML response
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

                // Cell indices based on OLT2 table structure:
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

                    olt2Logger.info(
                        { description, onuId: onuInfo.onuId, status: onuInfo.status },
                        'ONU info found'
                    )

                    return onuInfo
                }
            }

            olt2Logger.warn({ description: targetDescription }, 'ONU not found in OLT2 response')
            return null
        } catch (error) {
            olt2Logger.error({ err: error }, 'Failed to parse OLT2 HTML response')
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
export const olt2Service = new OLT2Service()
