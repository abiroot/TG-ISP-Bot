/**
 * OLT1 Service
 *
 * Queries the OLT1 system via Telnet to get ONU (Optical Network Unit) status.
 * Used when a customer's Mikrotik Interface contains "OLT1" to show fiber connection status.
 *
 * OLT1: 185.170.131.29 (Telnet port 23)
 */

import { env } from '~/config/env'
import { OLTTelnetService, type ONUInfo } from './OLTTelnetService'

/**
 * OLT1 Service instance
 *
 * Configured specifically for OLT1 at 185.170.131.29
 */
class OLT1ServiceImpl extends OLTTelnetService {
    constructor() {
        super({
            name: 'OLT1',
            host: env.OLT1_BASE_URL.replace(/^https?:\/\//, ''), // Remove protocol if present
            port: 23,
            username: env.OLT1_USERNAME,
            password: env.OLT1_PASSWORD,
            enablePassword: env.OLT1_PASSWORD, // Same as login password
            enabled: env.OLT1_ENABLED,
        })
    }

    /**
     * Extract ONU username from Mikrotik Interface for OLT1
     *
     * For interfaces like "(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1"
     * Returns the last segment after the last "-": "eliehajjarb1"
     */
    extractONUUsername(mikrotikInterface: string): string | null {
        return super.extractONUUsername(mikrotikInterface, 'OLT1')
    }
}

/**
 * Singleton instance
 */
export const olt1Service = new OLT1ServiceImpl()

// Re-export types for convenience
export type { ONUInfo }
