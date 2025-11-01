/**
 * Enhanced Bot State Service (v2)
 *
 * Enhanced version of BotStateService with:
 * - Additional feature flags (RAG, ISP tools, button demos)
 * - Better caching strategy
 * - State change event emitting
 * - Audit trail for state changes
 *
 * Extends existing BotStateService functionality
 */

import { botStateRepository } from '~/database/repositories/botStateRepository'
import { BOT_STATE_KEYS } from '~/database/schemas/botState'
import { createFlowLogger } from '~/core/utils/logger'
import { env } from '~/config/env'

const stateLogger = createFlowLogger('bot-state-v2')

/**
 * Maintenance mode configuration
 */
export interface MaintenanceConfig {
    enabled: boolean
    message?: string
    enabled_at?: string
    enabled_by?: string
    scheduled_end?: string
}

/**
 * Enhanced feature flags
 */
export interface FeatureFlags {
    // AI features
    ai_responses: boolean
    rag_enabled: boolean

    // Media features
    voice_transcription: boolean
    image_analysis: boolean

    // ISP features
    isp_tools: boolean

    // Development features
    button_demos: boolean
    test_flows: boolean

    // Rate limiting
    rate_limiting: boolean
}

/**
 * State change event
 */
export interface StateChangeEvent {
    type: 'maintenance' | 'feature'
    key: string
    oldValue: any
    newValue: any
    changedBy?: string
    timestamp: Date
}

/**
 * State change listener
 */
type StateChangeListener = (event: StateChangeEvent) => void | Promise<void>

/**
 * Enhanced Bot State Service
 */
export class BotStateService {
    private cache: {
        maintenance?: MaintenanceConfig
        features?: FeatureFlags
        lastUpdated?: Date
    } = {}

    private cacheTimeout = 60000 // 1 minute
    private listeners: StateChangeListener[] = []

    constructor() {
        stateLogger.info('EnhancedBotStateService initialized')
    }

    /**
     * MAINTENANCE MODE
     */

    /**
     * Get maintenance configuration
     */
    private async getMaintenanceConfig(): Promise<MaintenanceConfig> {
        if (this.isCacheValid()) {
            return this.cache.maintenance!
        }

        const state = await botStateRepository.getValue<MaintenanceConfig>(BOT_STATE_KEYS.MAINTENANCE_MODE)
        const config = state || { enabled: false }

        this.cache.maintenance = config
        this.cache.lastUpdated = new Date()

        return config
    }

    /**
     * Check if bot is in maintenance mode
     */
    async isMaintenanceMode(): Promise<boolean> {
        const config = await this.getMaintenanceConfig()
        return config.enabled
    }

    /**
     * Enable maintenance mode
     */
    async enableMaintenanceMode(options: {
        message?: string
        enabledBy?: string
        scheduledEnd?: Date
    }): Promise<void> {
        const oldConfig = await this.getMaintenanceConfig()

        const newConfig: MaintenanceConfig = {
            enabled: true,
            message: options.message || '🔧 Bot is currently under maintenance. Please try again later.',
            enabled_at: new Date().toISOString(),
            enabled_by: options.enabledBy,
            scheduled_end: options.scheduledEnd?.toISOString(),
        }

        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, newConfig)
        this.cache.maintenance = newConfig
        this.cache.lastUpdated = new Date()

        await this.emitStateChange({
            type: 'maintenance',
            key: 'enabled',
            oldValue: oldConfig.enabled,
            newValue: true,
            changedBy: options.enabledBy,
            timestamp: new Date(),
        })

        stateLogger.info(
            { enabledBy: options.enabledBy, scheduledEnd: options.scheduledEnd },
            '🔧 Maintenance mode ENABLED'
        )
    }

    /**
     * Disable maintenance mode
     */
    async disableMaintenanceMode(disabledBy?: string): Promise<void> {
        const oldConfig = await this.getMaintenanceConfig()

        const newConfig: MaintenanceConfig = { enabled: false }

        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, newConfig)
        this.cache.maintenance = newConfig
        this.cache.lastUpdated = new Date()

        await this.emitStateChange({
            type: 'maintenance',
            key: 'enabled',
            oldValue: oldConfig.enabled,
            newValue: false,
            changedBy: disabledBy,
            timestamp: new Date(),
        })

        stateLogger.info({ disabledBy }, '✅ Maintenance mode DISABLED')
    }

    /**
     * Get maintenance message
     */
    async getMaintenanceMessage(): Promise<string> {
        const config = await this.getMaintenanceConfig()
        return config.message || '🔧 Bot is currently under maintenance. Please try again later.'
    }

    /**
     * FEATURE FLAGS
     */

    /**
     * Get feature flags configuration
     */
    private async getFeatureFlags(): Promise<FeatureFlags> {
        if (this.isCacheValid()) {
            return this.cache.features!
        }

        const state = await botStateRepository.getValue<FeatureFlags>(BOT_STATE_KEYS.FEATURES_ENABLED)
        const features = state || this.getDefaultFeatures()

        this.cache.features = features
        this.cache.lastUpdated = new Date()

        return features
    }

    /**
     * Get default feature flags
     */
    private getDefaultFeatures(): FeatureFlags {
        return {
            // AI features
            ai_responses: true,
            rag_enabled: env.RAG_ENABLED ?? true,

            // Media features
            voice_transcription: true,
            image_analysis: true,

            // ISP features
            isp_tools: env.ISP_ENABLED ?? true,

            // Development features (disabled in production)
            button_demos: env.NODE_ENV === 'development',
            test_flows: env.NODE_ENV === 'development',

            // Rate limiting
            rate_limiting: true,
        }
    }

    /**
     * Check if a feature is enabled
     */
    async isFeatureEnabled(feature: keyof FeatureFlags): Promise<boolean> {
        const features = await this.getFeatureFlags()
        return features[feature] ?? false
    }

    /**
     * Enable a feature
     */
    async enableFeature(feature: keyof FeatureFlags, enabledBy?: string): Promise<void> {
        const features = await this.getFeatureFlags()
        const oldValue = features[feature]

        features[feature] = true

        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, features)
        this.cache.features = features
        this.cache.lastUpdated = new Date()

        await this.emitStateChange({
            type: 'feature',
            key: feature,
            oldValue,
            newValue: true,
            changedBy: enabledBy,
            timestamp: new Date(),
        })

        stateLogger.info({ feature, enabledBy }, `✅ Feature "${feature}" enabled`)
    }

    /**
     * Disable a feature
     */
    async disableFeature(feature: keyof FeatureFlags, disabledBy?: string): Promise<void> {
        const features = await this.getFeatureFlags()
        const oldValue = features[feature]

        features[feature] = false

        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, features)
        this.cache.features = features
        this.cache.lastUpdated = new Date()

        await this.emitStateChange({
            type: 'feature',
            key: feature,
            oldValue,
            newValue: false,
            changedBy: disabledBy,
            timestamp: new Date(),
        })

        stateLogger.info({ feature, disabledBy }, `🚫 Feature "${feature}" disabled`)
    }

    /**
     * Toggle a feature (on/off)
     */
    async toggleFeature(feature: keyof FeatureFlags, toggledBy?: string): Promise<boolean> {
        const isEnabled = await this.isFeatureEnabled(feature)

        if (isEnabled) {
            await this.disableFeature(feature, toggledBy)
            return false
        } else {
            await this.enableFeature(feature, toggledBy)
            return true
        }
    }

    /**
     * Get all feature flags status
     */
    async getAllFeatures(): Promise<FeatureFlags> {
        return await this.getFeatureFlags()
    }

    /**
     * Update multiple features at once
     */
    async updateFeatures(updates: Partial<FeatureFlags>, updatedBy?: string): Promise<void> {
        const features = await this.getFeatureFlags()

        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                features[key as keyof FeatureFlags] = value
            }
        })

        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, features)
        this.cache.features = features
        this.cache.lastUpdated = new Date()

        stateLogger.info({ updates, updatedBy }, 'Multiple features updated')
    }

    /**
     * CACHING
     */

    /**
     * Check if cache is valid
     */
    private isCacheValid(): boolean {
        if (!this.cache.lastUpdated) return false
        if (!this.cache.maintenance || !this.cache.features) return false

        const now = Date.now()
        const cacheAge = now - this.cache.lastUpdated.getTime()

        return cacheAge < this.cacheTimeout
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache = {}
        stateLogger.debug('Cache cleared')
    }

    /**
     * Set cache timeout
     */
    setCacheTimeout(ms: number): void {
        this.cacheTimeout = ms
        stateLogger.debug({ timeoutMs: ms }, 'Cache timeout updated')
    }

    /**
     * EVENT EMITTING
     */

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: StateChangeListener): () => void {
        this.listeners.push(listener)

        // Return unsubscribe function
        return () => {
            const index = this.listeners.indexOf(listener)
            if (index > -1) {
                this.listeners.splice(index, 1)
            }
        }
    }

    /**
     * Emit state change event to all listeners
     */
    private async emitStateChange(event: StateChangeEvent): Promise<void> {
        for (const listener of this.listeners) {
            try {
                await listener(event)
            } catch (error) {
                stateLogger.error({ err: error, event }, 'State change listener failed')
            }
        }
    }

    /**
     * UTILITY METHODS
     */

    /**
     * Get full bot state
     */
    async getFullState(): Promise<{
        maintenance: MaintenanceConfig
        features: FeatureFlags
    }> {
        return {
            maintenance: await this.getMaintenanceConfig(),
            features: await this.getFeatureFlags(),
        }
    }

    /**
     * Reset to default state
     */
    async resetToDefaults(resetBy?: string): Promise<void> {
        await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, { enabled: false })
        await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, this.getDefaultFeatures())

        this.clearCache()

        stateLogger.info({ resetBy }, '🔄 Bot state reset to defaults')
    }

    /**
     * Export state as JSON
     */
    async exportState(): Promise<string> {
        const state = await this.getFullState()
        return JSON.stringify(state, null, 2)
    }

    /**
     * Import state from JSON
     */
    async importState(jsonState: string, importedBy?: string): Promise<void> {
        try {
            const state = JSON.parse(jsonState)

            if (state.maintenance) {
                await botStateRepository.set(BOT_STATE_KEYS.MAINTENANCE_MODE, state.maintenance)
            }

            if (state.features) {
                await botStateRepository.set(BOT_STATE_KEYS.FEATURES_ENABLED, state.features)
            }

            this.clearCache()

            stateLogger.info({ importedBy }, 'State imported successfully')
        } catch (error) {
            stateLogger.error({ err: error }, 'Failed to import state')
            throw error
        }
    }
}

/**
 * Singleton instance
 */
export const botStateService = new BotStateService()
