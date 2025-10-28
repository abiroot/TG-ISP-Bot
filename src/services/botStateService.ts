/**
 * Bot State Service
 *
 * Manages global bot state with PostgreSQL persistence
 * State survives server restarts
 */

import { botStateRepository } from '~/database/repositories/botStateRepository'
import { BOT_STATE_KEYS, MaintenanceModeState, FeaturesEnabledState } from '~/database/schemas/botState'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('bot-state')

class BotStateService {
    // Cache for performance (refreshed from DB on methods)
    private cache: {
        maintenanceMode?: MaintenanceModeState
        featuresEnabled?: FeaturesEnabledState
    } = {}

    /**
     * Get maintenance mode state from database
     */
    private async getMaintenanceState(): Promise<MaintenanceModeState> {
        if (this.cache.maintenanceMode) {
            return this.cache.maintenanceMode
        }

        const state = await botStateRepository.getValue<MaintenanceModeState>(BOT_STATE_KEYS.MAINTENANCE_MODE)
        this.cache.maintenanceMode = state || { enabled: false }
        return this.cache.maintenanceMode
    }

    /**
     * Check if bot is in maintenance mode
     */
    async isMaintenanceMode(): Promise<boolean> {
        const state = await this.getMaintenanceState()
        return state.enabled
    }

    /**
     * Enable maintenance mode (persists to database)
     */
    async enableMaintenanceMode(message?: string, enabledBy?: string): Promise<void> {
        const state: MaintenanceModeState = {
            enabled: true,
            message: message || '🔧 Bot is currently under maintenance. Please try again later.',
            enabled_at: new Date().toISOString(),
            enabled_by: enabledBy,
        }

        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, state)
        this.cache.maintenanceMode = state
        logger.info({ enabledBy, message }, '🔧 Maintenance mode ENABLED')
    }

    /**
     * Disable maintenance mode (persists to database)
     */
    async disableMaintenanceMode(): Promise<void> {
        const state: MaintenanceModeState = { enabled: false }

        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, state)
        this.cache.maintenanceMode = state
        logger.info('✅ Maintenance mode DISABLED')
    }

    /**
     * Get maintenance message
     */
    async getMaintenanceMessage(): Promise<string> {
        const state = await this.getMaintenanceState()
        return state.message || '🔧 Bot is currently under maintenance. Please try again later.'
    }

    /**
     * Get features state from database
     */
    private async getFeaturesState(): Promise<FeaturesEnabledState> {
        if (this.cache.featuresEnabled) {
            return this.cache.featuresEnabled
        }

        const state = await botStateRepository.getValue<FeaturesEnabledState>(BOT_STATE_KEYS.FEATURES_ENABLED)
        this.cache.featuresEnabled = state || {
            ai_responses: true,
            voice_transcription: true,
            image_analysis: true,
        }
        return this.cache.featuresEnabled
    }

    /**
     * Check if a feature is enabled
     */
    async isFeatureEnabled(feature: keyof FeaturesEnabledState): Promise<boolean> {
        const state = await this.getFeaturesState()
        return state[feature]
    }

    /**
     * Enable a feature (persists to database)
     */
    async enableFeature(feature: keyof FeaturesEnabledState): Promise<void> {
        const state = await this.getFeaturesState()
        state[feature] = true

        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, state)
        this.cache.featuresEnabled = state
        logger.info({ feature }, `✅ Feature "${feature}" enabled`)
    }

    /**
     * Disable a feature (persists to database)
     */
    async disableFeature(feature: keyof FeaturesEnabledState): Promise<void> {
        const state = await this.getFeaturesState()
        state[feature] = false

        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, state)
        this.cache.featuresEnabled = state
        logger.info({ feature }, `🚫 Feature "${feature}" disabled`)
    }

    /**
     * Get all features status
     */
    async getFeaturesStatus(): Promise<FeaturesEnabledState> {
        return await this.getFeaturesState()
    }

    /**
     * Get full bot state
     */
    async getState(): Promise<{ maintenance_mode: MaintenanceModeState; features_enabled: FeaturesEnabledState }> {
        return {
            maintenance_mode: await this.getMaintenanceState(),
            features_enabled: await this.getFeaturesState(),
        }
    }

    /**
     * Clear cache (force refresh from database)
     */
    clearCache(): void {
        this.cache = {}
        logger.debug('Cache cleared')
    }

    /**
     * Reset state to defaults (persists to database)
     */
    async reset(): Promise<void> {
        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, { enabled: false })
        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, {
            ai_responses: true,
            voice_transcription: true,
            image_analysis: true,
        })
        this.clearCache()
        logger.info('🔄 Bot state reset to defaults')
    }
}

// Export singleton instance
export const botStateService = new BotStateService()
