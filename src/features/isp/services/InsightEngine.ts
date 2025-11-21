/**
 * Insight Engine for ISP Customer Data Analysis
 *
 * Generates intelligent insights across 6 categories:
 * 1. Connection Stability (session patterns)
 * 2. Signal Quality (dBm analysis)
 * 3. Infrastructure Health (AP/Station uptime, link downs)
 * 4. Account Warnings (expiry, blocked, quota)
 * 5. Capacity Issues (AP congestion)
 * 6. Hardware Recommendations
 *
 * Provides actionable recommendations for support staff
 */

import type { ISPUserInfo } from './ISPService'
import { analyzeSignal, type SignalAnalysis } from '../utils/signalAnalysis'
import {
    analyzeSessionPattern,
    getCurrentSessionDuration,
    type SessionPattern,
} from '../utils/sessionAnalysis'
import { parseUptimeToMinutes, isRecentRestart } from '../utils/uptimeParser'
import { createFlowLogger } from '~/core/utils/logger'

const insightLogger = createFlowLogger('insight-engine')

export type InsightCategory =
    | 'stability'
    | 'signal'
    | 'infrastructure'
    | 'account'
    | 'capacity'
    | 'hardware'

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'healthy'

export interface ISPInsight {
    category: InsightCategory
    severity: InsightSeverity
    icon: string
    title: string
    message: string
    recommendation: string
    affectsService: boolean
    priority: number // Lower = higher priority
}

export class InsightEngine {
    /**
     * Generate all insights for a customer
     */
    generateInsights(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        try {
            // 1. Connection Stability Analysis
            insights.push(...this.analyzeConnectionStability(userInfo))

            // 2. Signal Quality Analysis
            insights.push(...this.analyzeSignalQuality(userInfo))

            // 3. Infrastructure Health Analysis
            insights.push(...this.analyzeInfrastructureHealth(userInfo))

            // 4. Account Status Analysis
            insights.push(...this.analyzeAccountStatus(userInfo))

            // 5. Capacity Analysis
            insights.push(...this.analyzeCapacity(userInfo))

            // 6. Hardware Recommendations
            insights.push(...this.generateHardwareRecommendations(userInfo))

            // Sort by priority (critical first, then by priority number)
            const sorted = insights.sort((a, b) => {
                const severityOrder = { critical: 0, warning: 1, info: 2, healthy: 3 }
                if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                    return severityOrder[a.severity] - severityOrder[b.severity]
                }
                return a.priority - b.priority
            })

            insightLogger.info(
                {
                    userName: userInfo.userName,
                    totalInsights: sorted.length,
                    critical: sorted.filter((i) => i.severity === 'critical').length,
                    warnings: sorted.filter((i) => i.severity === 'warning').length,
                },
                'Insights generated'
            )

            return sorted
        } catch (error) {
            insightLogger.error({ err: error, userName: userInfo.userName }, 'Insight generation failed')
            return []
        }
    }

    /**
     * 1. Connection Stability Analysis
     */
    private analyzeConnectionStability(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        if (!userInfo.userSessions || userInfo.userSessions.length === 0) {
            return insights
        }

        // Analyze last 24 hours of sessions
        const pattern = analyzeSessionPattern(userInfo.userSessions, 24)

        // Critical: Too many sessions with very short average duration
        if (pattern.instabilitySeverity === 'critical') {
            insights.push({
                category: 'stability',
                severity: 'critical',
                icon: '🔴',
                title: 'Connection Instability',
                message: `${pattern.totalSessions} sessions in last 24 hours (avg ${Math.round(pattern.averageDurationMinutes || 0)}min)`,
                recommendation: pattern.recommendation || 'Check signal strength and AP link downs immediately.',
                affectsService: true,
                priority: 1,
            })
        }

        // Severe: Frequent reconnections
        if (pattern.instabilitySeverity === 'severe') {
            insights.push({
                category: 'stability',
                severity: 'warning',
                icon: '🟡',
                title: 'Frequent Reconnections',
                message: `${pattern.totalSessions} sessions in last 24 hours with ${pattern.veryShortSessions} very short sessions`,
                recommendation: pattern.recommendation || 'Monitor signal strength and equipment health.',
                affectsService: true,
                priority: 2,
            })
        }

        // Moderate: Elevated session count
        if (pattern.instabilitySeverity === 'moderate') {
            insights.push({
                category: 'stability',
                severity: 'info',
                icon: '🔵',
                title: 'Elevated Session Count',
                message: `${pattern.totalSessions} sessions in last 24 hours`,
                recommendation: pattern.recommendation || 'Monitor for stability trends.',
                affectsService: false,
                priority: 10,
            })
        }

        // Info: Long stable session
        const currentSessionMinutes = getCurrentSessionDuration(userInfo.userSessions)
        if (currentSessionMinutes && currentSessionMinutes > 720) {
            // > 12 hours
            insights.push({
                category: 'stability',
                severity: 'healthy',
                icon: '🟢',
                title: 'Stable Connection',
                message: `Current session ${Math.floor(currentSessionMinutes / 60)}h ${currentSessionMinutes % 60}m uptime`,
                recommendation: 'Connection is stable.',
                affectsService: false,
                priority: 20,
            })
        }

        return insights
    }

    /**
     * 2. Signal Quality Analysis
     */
    private analyzeSignalQuality(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        const signalAnalysis = analyzeSignal(userInfo.accessPointSignal)

        // Critical: Very poor or poor signal
        if (signalAnalysis.quality === 'very-poor' || signalAnalysis.quality === 'poor') {
            insights.push({
                category: 'signal',
                severity: 'critical',
                icon: '🔴',
                title: 'Very Poor Signal',
                message: `Signal strength ${signalAnalysis.dBm} dBm - ${signalAnalysis.description}`,
                recommendation: signalAnalysis.recommendation || 'Signal booster required immediately.',
                affectsService: true,
                priority: 2,
            })
        }

        // Warning: Weak signal
        if (signalAnalysis.quality === 'weak') {
            insights.push({
                category: 'signal',
                severity: 'warning',
                icon: '🟡',
                title: 'Weak Signal',
                message: `Signal strength ${signalAnalysis.dBm} dBm - below recommended threshold`,
                recommendation: signalAnalysis.recommendation || 'Signal booster recommended.',
                affectsService: true,
                priority: 3,
            })
        }

        // Info: Fair signal
        if (signalAnalysis.quality === 'fair') {
            insights.push({
                category: 'signal',
                severity: 'info',
                icon: '🔵',
                title: 'Fair Signal',
                message: `Signal strength ${signalAnalysis.dBm} dBm - acceptable but not optimal`,
                recommendation:
                    signalAnalysis.recommendation || 'Monitor for performance issues.',
                affectsService: false,
                priority: 11,
            })
        }

        return insights
    }

    /**
     * 3. Infrastructure Health Analysis
     */
    private analyzeInfrastructureHealth(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        // Recent AP restart
        const apUptimeMinutes = parseUptimeToMinutes(userInfo.accessPointUpTime)
        if (isRecentRestart(userInfo.accessPointUpTime, 60)) {
            insights.push({
                category: 'infrastructure',
                severity: 'warning',
                icon: '🟡',
                title: 'Recent AP Restart',
                message: `Access point restarted ${apUptimeMinutes}min ago`,
                recommendation: 'Monitor for stability. May be maintenance or power event.',
                affectsService: true,
                priority: 4,
            })
        }

        // Note: accessPointElectrical indicates power source (client vs rig), not a problem
        // No insight generated for this field

        // Link downs analysis (AP interface)
        const apLinkDowns = userInfo.accessPointInterfaceStats?.[0]?.linkDowns || 0
        if (apLinkDowns >= 50) {
            insights.push({
                category: 'infrastructure',
                severity: 'critical',
                icon: '🔴',
                title: 'Excessive Link Downs',
                message: `${apLinkDowns} link downs detected on AP interface`,
                recommendation:
                    'Cable/hardware failure likely. Inspect physical connections and replace faulty equipment.',
                affectsService: true,
                priority: 3,
            })
        } else if (apLinkDowns >= 11) {
            insights.push({
                category: 'infrastructure',
                severity: 'warning',
                icon: '🟡',
                title: 'Elevated Link Downs',
                message: `${apLinkDowns} link downs detected on AP interface`,
                recommendation:
                    'Monitor interface stability. May indicate cable degradation or environmental issues.',
                affectsService: false,
                priority: 6,
            })
        }

        // Station link downs analysis
        const stationLinkDowns = userInfo.stationInterfaceStats?.[0]?.linkDowns || 0
        if (stationLinkDowns >= 50) {
            insights.push({
                category: 'infrastructure',
                severity: 'critical',
                icon: '🔴',
                title: 'Excessive Station Link Downs',
                message: `${stationLinkDowns} link downs detected on station interface`,
                recommendation: 'Inspect station equipment and cables immediately.',
                affectsService: true,
                priority: 3,
            })
        }

        // Interface down/disabled
        const apInterface = userInfo.accessPointInterfaceStats?.[0]
        if (apInterface && (!apInterface.running || apInterface.disabled)) {
            insights.push({
                category: 'infrastructure',
                severity: 'critical',
                icon: '🔴',
                title: 'Interface Issue',
                message: `AP interface is ${apInterface.disabled ? 'disabled' : 'down'}`,
                recommendation: 'Enable and troubleshoot interface immediately.',
                affectsService: true,
                priority: 1,
            })
        }

        return insights
    }

    /**
     * 4. Account Status Analysis
     */
    private analyzeAccountStatus(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        // Account expiry
        const expiryDate = new Date(userInfo.expiryAccount)
        const now = new Date()
        const daysUntilExpiry = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysUntilExpiry <= 0) {
            insights.push({
                category: 'account',
                severity: 'critical',
                icon: '🔴',
                title: 'Account Expired',
                message: `Account expired ${Math.abs(daysUntilExpiry)} days ago`,
                recommendation: 'Account renewal required. Service may be blocked.',
                affectsService: true,
                priority: 1,
            })
        } else if (daysUntilExpiry <= 7) {
            insights.push({
                category: 'account',
                severity: 'warning',
                icon: '🟡',
                title: 'Expiry Approaching',
                message: `Account expires in ${daysUntilExpiry} days`,
                recommendation: 'Contact customer for renewal.',
                affectsService: false,
                priority: 7,
            })
        }

        // Blocked account
        if (userInfo.blocked) {
            insights.push({
                category: 'account',
                severity: 'critical',
                icon: '🔴',
                title: 'Account Blocked',
                message: userInfo.online
                    ? 'Account is blocked but still online'
                    : 'Account is blocked',
                recommendation: 'Verify billing status and payment. Check policy violations.',
                affectsService: true,
                priority: 1,
            })
        }

        // Inactive account
        if (!userInfo.active && !userInfo.blocked) {
            insights.push({
                category: 'account',
                severity: 'warning',
                icon: '🟡',
                title: 'Account Inactive',
                message: 'Account is marked as inactive',
                recommendation: 'Check customer status. May be suspended or pending activation.',
                affectsService: true,
                priority: 5,
            })
        }

        // Note: activatedAccount field is not operationally important
        // No insight generated for this field

        // Quota warnings (daily)
        const dailyQuotaMB = parseFloat(userInfo.dailyQuota || '0')
        if (dailyQuotaMB >= 1024) {
            const dailyQuotaGB = dailyQuotaMB / 1024
            if (dailyQuotaGB >= 50) {
                // Assuming typical daily quota is ~50-100GB
                insights.push({
                    category: 'account',
                    severity: 'warning',
                    icon: '🟡',
                    title: 'High Daily Quota Usage',
                    message: `Daily quota: ${dailyQuotaGB.toFixed(2)} GB consumed`,
                    recommendation: 'Customer may experience FUP throttling soon. Consider quota upgrade.',
                    affectsService: false,
                    priority: 8,
                })
            }
        }

        return insights
    }

    /**
     * 5. Capacity Analysis
     */
    private analyzeCapacity(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        // Exclude current user from AP user count (we want OTHER users on same AP)
        const otherUsers = userInfo.accessPointUsers?.filter((u) => u.userName !== userInfo.userName) || []
        const totalUsers = otherUsers.length
        if (totalUsers === 0) return insights

        const onlineUsers = otherUsers.filter((u) => u.online).length
        const onlinePercentage = (onlineUsers / totalUsers) * 100

        // Critical: Severe AP congestion
        if (totalUsers >= 50) {
            insights.push({
                category: 'capacity',
                severity: 'critical',
                icon: '🔴',
                title: 'AP Severely Congested',
                message: `${totalUsers} users on AP (${onlineUsers} online - ${Math.round(onlinePercentage)}%)`,
                recommendation:
                    'URGENT: Load balancing required. Add additional APs or migrate users to reduce congestion.',
                affectsService: true,
                priority: 2,
            })
        }
        // Warning: AP congestion
        else if (totalUsers >= 31) {
            insights.push({
                category: 'capacity',
                severity: 'warning',
                icon: '🟡',
                title: 'AP Congestion',
                message: `${totalUsers} users on AP (${onlineUsers} online - ${Math.round(onlinePercentage)}%)`,
                recommendation:
                    'Performance degradation likely. Consider load balancing or AP capacity upgrade.',
                affectsService: true,
                priority: 4,
            })
        }
        // Info: Moderate capacity
        else if (totalUsers >= 16) {
            insights.push({
                category: 'capacity',
                severity: 'info',
                icon: '🔵',
                title: 'Moderate AP Capacity',
                message: `${totalUsers} users on AP (${onlineUsers} online - ${Math.round(onlinePercentage)}%)`,
                recommendation:
                    'Monitor during peak hours. May need additional capacity if WiFi 5 or older.',
                affectsService: false,
                priority: 13,
            })
        }

        // Peak hour warning
        if (onlinePercentage > 75 && totalUsers > 20) {
            insights.push({
                category: 'capacity',
                severity: 'warning',
                icon: '🟡',
                title: 'High Concurrent Usage',
                message: `${onlineUsers}/${totalUsers} users online (${Math.round(onlinePercentage)}%)`,
                recommendation:
                    'Peak hour congestion likely. Monitor bandwidth and consider capacity expansion.',
                affectsService: false,
                priority: 9,
            })
        }

        return insights
    }

    /**
     * 6. Hardware Recommendations
     */
    private generateHardwareRecommendations(userInfo: ISPUserInfo): ISPInsight[] {
        const insights: ISPInsight[] = []

        const signalAnalysis = analyzeSignal(userInfo.accessPointSignal)

        // Weak signal + high-speed plan
        if (
            signalAnalysis.needsAttention &&
            (userInfo.basicSpeedUp >= 100 || userInfo.basicSpeedDown >= 100)
        ) {
            insights.push({
                category: 'hardware',
                severity: 'warning',
                icon: '🔧',
                title: 'Signal Bottleneck',
                message: `Premium speed plan (${userInfo.basicSpeedUp}/${userInfo.basicSpeedDown} Mbps) but weak signal (${signalAnalysis.dBm} dBm)`,
                recommendation:
                    'Customer not getting full speed potential. Signal booster or AP relocation recommended.',
                affectsService: false,
                priority: 10,
            })
        }

        // No static IP for premium customer
        if (
            (userInfo.accountTypeName.toLowerCase().includes('premium') ||
                userInfo.accountPrice >= 50) &&
            !userInfo.staticIP
        ) {
            insights.push({
                category: 'hardware',
                severity: 'info',
                icon: '🔵',
                title: 'Static IP Opportunity',
                message: 'Premium account without static IP',
                recommendation:
                    'Offer static IP upgrade for business services (hosting, remote access).',
                affectsService: false,
                priority: 14,
            })
        }

        // Old equipment with issues
        if (
            signalAnalysis.needsAttention &&
            userInfo.routerBrand &&
            !userInfo.routerBrand.toLowerCase().includes('mikrotik')
        ) {
            insights.push({
                category: 'hardware',
                severity: 'info',
                icon: '🔵',
                title: 'Equipment Upgrade',
                message: `Weak signal with ${userInfo.routerBrand} router`,
                recommendation:
                    'Consider upgrading to enterprise-grade equipment (Mikrotik) for better range and stability.',
                affectsService: false,
                priority: 15,
            })
        }

        return insights
    }
}
