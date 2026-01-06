/**
 * OLT2 Service
 *
 * Queries the OLT2 system via Telnet to get ONU (Optical Network Unit) status.
 * Used when a customer's Mikrotik Interface contains "OLT2" to show fiber connection status.
 *
 * OLT2: 185.170.131.28 (Telnet port 23)
 */

import { env } from '~/config/env'
import { OLTTelnetService, type ONUInfo } from './OLTTelnetService'

/**
 * OLT2 Service instance
 *
 * Configured specifically for OLT2 at 185.170.131.28
 */
class OLT2ServiceImpl extends OLTTelnetService {
    constructor() {
        super({
            name: 'OLT2',
            host: env.OLT2_BASE_URL.replace(/^https?:\/\//, ''), // Remove protocol if present
            port: 23,
            username: env.OLT2_USERNAME,
            password: env.OLT2_PASSWORD,
            enablePassword: env.OLT2_PASSWORD, // Same as login password
            enabled: env.OLT2_ENABLED,
        })
    }

    /**
     * Extract ONU username from Mikrotik Interface for OLT2
     *
     * For interfaces like "(VM-PPPoe4)-vlan1502-OLT2-PON1-SAIIDKHOUDARJE"
     * Returns the last segment after the last "-": "SAIIDKHOUDARJE"
     */
    extractONUUsername(mikrotikInterface: string): string | null {
        return super.extractONUUsername(mikrotikInterface, 'OLT2')
    }
}

/**
 * Singleton instance
 */
export const olt2Service = new OLT2ServiceImpl()

// Re-export types for convenience
export type { ONUInfo }
