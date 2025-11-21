/**
 * InsightEngine Unit Tests
 *
 * Tests all 6 insight categories with boundary conditions
 */

import { describe, it, expect } from 'vitest'
import { InsightEngine } from '~/features/isp/services/InsightEngine'
import type { ISPUserInfo } from '~/features/isp/services/ISPService'

describe('InsightEngine', () => {
    const insightEngine = new InsightEngine()

    // Helper function to create mock user info
    const createMockUserInfo = (overrides?: Partial<ISPUserInfo>): ISPUserInfo => ({
        id: 1,
        userName: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        mobile: '71123456',
        phone: '',
        mailAddress: '',
        address: 'Test Address',
        comment: '',
        mof: '',
        creationDate: '2024-01-01T00:00:00.000Z',
        lastLogin: null,
        lastLogOut: null,
        userCategoryId: 1,
        financialCategoryId: 1,
        userGroupId: 1,
        linkId: 0,
        archived: false,
        online: true,
        active: true,
        activatedAccount: true,
        blocked: false,
        expiryAccount: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        accountTypeName: 'Standard',
        userUpTime: '1h30m',
        fupMode: '0',
        ipAddress: '10.0.0.1',
        staticIP: '',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        nasHost: '192.168.1.1',
        mikrotikInterface: 'test-interface',
        routerBrand: 'Mikrotik',
        stationOnline: true,
        stationName: 'Station 1',
        stationIpAddress: '10.0.1.1',
        stationUpTime: '1w2d',
        stationInterfaceStats: [],
        accessPointOnline: true,
        accessPointName: 'AP 1',
        accessPointIpAddress: '10.0.2.1',
        accessPointUpTime: '1d12h',
        accessPointSignal: '-60 / -55',
        accessPointElectrical: true,
        accessPointInterfaceStats: [
            {
                id: '*1',
                type: 'ether',
                name: 'ether1',
                defaultName: 'ether1',
                macAddress: 'AA:BB:CC:DD:EE:FF',
                lastLinkUpTime: '2024-01-01',
                rxError: 0,
                txError: 0,
                rxPacket: 1000,
                txPacket: 1000,
                rxByte: 100000,
                txByte: 100000,
                rxDrop: 0,
                txDrop: 0,
                txQueueDrop: 0,
                fpRxPacket: 1000,
                fpTxPacket: 1000,
                fpRxByte: 100000,
                fpTxByte: 100000,
                mtu: 1500,
                actualMtu: 1500,
                l2mtu: 1600,
                maxL2mtu: 4076,
                linkDowns: 0,
                running: true,
                disabled: false,
                speed: '100Mbps',
            },
        ],
        accessPointUsers: [
            { userName: 'user1', online: true },
            { userName: 'user2', online: false },
        ],
        basicSpeedUp: 50,
        basicSpeedDown: 50,
        dailyQuota: '10240',
        monthlyQuota: '307200',
        accountPrice: 25,
        discount: 0,
        realIpPrice: 0,
        iptvPrice: 0,
        collectorId: 1,
        collectorUserName: 'collector1',
        collectorFirstName: 'Collector',
        collectorLastName: 'One',
        collectorMobile: '71000000',
        userSessions: [
            {
                startSession: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0], // 2 hours ago
                endSession: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0], // 1 hour ago
                sessionTime: '0 D : 1 H : 0 M : 0 S',
            },
        ],
        pingResult: ['PING 8.8.8.8: 64 bytes from 8.8.8.8: icmp_seq=1 ttl=57 time=10.5 ms'],
        ...overrides,
    })

    describe('Connection Stability Analysis', () => {
        it('should detect critical instability with many short sessions', () => {
            const sessions = Array.from({ length: 21 }, (_, i) => ({
                startSession: new Date(Date.now() - (21 - i) * 30 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0],
                endSession: new Date(Date.now() - (21 - i) * 30 * 60 * 1000 + 60 * 1000).toISOString().replace('T', ' ').split('.')[0],
                sessionTime: '0 D : 0 H : 1 M : 0 S',
            }))

            const userInfo = createMockUserInfo({ userSessions: sessions })
            const insights = insightEngine.generateInsights(userInfo)

            const stabilityInsights = insights.filter((i) => i.category === 'stability')
            expect(stabilityInsights.length).toBeGreaterThan(0)
            expect(stabilityInsights[0].severity).toBe('critical')
        })

        it('should not flag stable connections', () => {
            const userInfo = createMockUserInfo()
            const insights = insightEngine.generateInsights(userInfo)

            const criticalStability = insights.filter(
                (i) => i.category === 'stability' && i.severity === 'critical'
            )
            expect(criticalStability.length).toBe(0)
        })
    })

    describe('Signal Quality Analysis', () => {
        it('should detect critical signal issues', () => {
            const userInfo = createMockUserInfo({ accessPointSignal: '-89 / -85' })
            const insights = insightEngine.generateInsights(userInfo)

            const signalInsights = insights.filter((i) => i.category === 'signal')
            expect(signalInsights.length).toBeGreaterThan(0)
            expect(signalInsights[0].severity).toBe('critical')
        })

        it('should detect weak signal', () => {
            const userInfo = createMockUserInfo({ accessPointSignal: '-78 / -75' })
            const insights = insightEngine.generateInsights(userInfo)

            const signalInsights = insights.filter((i) => i.category === 'signal')
            expect(signalInsights.length).toBeGreaterThan(0)
            expect(signalInsights[0].severity).toBe('warning')
        })

        it('should not flag good signal', () => {
            const userInfo = createMockUserInfo({ accessPointSignal: '-55 / -50' })
            const insights = insightEngine.generateInsights(userInfo)

            const criticalSignal = insights.filter(
                (i) => i.category === 'signal' && i.severity === 'critical'
            )
            expect(criticalSignal.length).toBe(0)
        })
    })

    describe('Infrastructure Health Analysis', () => {
        it('should detect recent AP restart', () => {
            const userInfo = createMockUserInfo({
                accessPointUpTime: '15m',
            })
            const insights = insightEngine.generateInsights(userInfo)

            const infraInsights = insights.filter((i) => i.category === 'infrastructure')
            expect(infraInsights.length).toBeGreaterThan(0)
            expect(infraInsights.some((i) => i.severity === 'warning')).toBe(true)
        })

        it('should detect excessive link downs', () => {
            const userInfo = createMockUserInfo({
                accessPointInterfaceStats: [
                    {
                        ...createMockUserInfo().accessPointInterfaceStats![0],
                        linkDowns: 75,
                    },
                ],
            })
            const insights = insightEngine.generateInsights(userInfo)

            const infraInsights = insights.filter((i) => i.category === 'infrastructure')
            const linkDownInsights = infraInsights.filter((i) =>
                i.title.includes('Link Downs')
            )
            expect(linkDownInsights.length).toBeGreaterThan(0)
            expect(linkDownInsights[0].severity).toBe('critical')
        })

        it('should not flag healthy infrastructure', () => {
            const userInfo = createMockUserInfo()
            const insights = insightEngine.generateInsights(userInfo)

            const criticalInfra = insights.filter(
                (i) => i.category === 'infrastructure' && i.severity === 'critical'
            )
            expect(criticalInfra.length).toBe(0)
        })
    })

    describe('Account Status Analysis', () => {
        it('should detect expired account', () => {
            const userInfo = createMockUserInfo({
                expiryAccount: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            })
            const insights = insightEngine.generateInsights(userInfo)

            const accountInsights = insights.filter((i) => i.category === 'account')
            expect(accountInsights.length).toBeGreaterThan(0)
            expect(accountInsights[0].severity).toBe('critical')
        })

        it('should detect expiry approaching', () => {
            const userInfo = createMockUserInfo({
                expiryAccount: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days from now
            })
            const insights = insightEngine.generateInsights(userInfo)

            const accountInsights = insights.filter((i) => i.category === 'account')
            expect(accountInsights.some((i) => i.severity === 'warning')).toBe(true)
        })

        it('should detect blocked account', () => {
            const userInfo = createMockUserInfo({ blocked: true })
            const insights = insightEngine.generateInsights(userInfo)

            const accountInsights = insights.filter((i) => i.category === 'account')
            expect(accountInsights.some((i) => i.severity === 'critical')).toBe(true)
        })
    })

    describe('Capacity Analysis', () => {
        it('should detect severe AP congestion', () => {
            // Create 55 users + current user = 56 total (55 others after excluding current)
            const users = Array.from({ length: 55 }, (_, i) => ({
                userName: `user${i}`,
                online: i % 2 === 0,
            }))
            // Add current user to the list (will be excluded from capacity count)
            users.push({ userName: 'testuser', online: true })

            const userInfo = createMockUserInfo({ accessPointUsers: users })
            const insights = insightEngine.generateInsights(userInfo)

            const capacityInsights = insights.filter((i) => i.category === 'capacity')
            expect(capacityInsights.length).toBeGreaterThan(0)
            expect(capacityInsights[0].severity).toBe('critical')
        })

        it('should detect moderate congestion', () => {
            // Create 35 users + current user = 36 total (35 others after excluding current)
            const users = Array.from({ length: 35 }, (_, i) => ({
                userName: `user${i}`,
                online: i % 2 === 0,
            }))
            // Add current user to the list (will be excluded from capacity count)
            users.push({ userName: 'testuser', online: true })

            const userInfo = createMockUserInfo({ accessPointUsers: users })
            const insights = insightEngine.generateInsights(userInfo)

            const capacityInsights = insights.filter((i) => i.category === 'capacity')
            expect(capacityInsights.length).toBeGreaterThan(0)
        })

        it('should not flag low capacity', () => {
            const userInfo = createMockUserInfo()
            const insights = insightEngine.generateInsights(userInfo)

            const criticalCapacity = insights.filter(
                (i) => i.category === 'capacity' && i.severity === 'critical'
            )
            expect(criticalCapacity.length).toBe(0)
        })

        it('should exclude current user from capacity count', () => {
            // Create 20 users + current user = 21 total, but only 20 should be counted
            const users = Array.from({ length: 20 }, (_, i) => ({
                userName: `user${i}`,
                online: i % 2 === 0,
            }))
            users.push({ userName: 'testuser', online: true }) // Current user

            const userInfo = createMockUserInfo({ accessPointUsers: users })
            const insights = insightEngine.generateInsights(userInfo)

            const capacityInsights = insights.filter((i) => i.category === 'capacity')
            // With 20 other users (16-30 range), should get moderate capacity info
            expect(capacityInsights.some((i) => i.title.includes('Moderate'))).toBe(true)
        })
    })

    describe('Hardware Recommendations', () => {
        it('should recommend signal booster for premium plan with weak signal', () => {
            const userInfo = createMockUserInfo({
                basicSpeedUp: 200,
                basicSpeedDown: 200,
                accessPointSignal: '-78 / -75', // Weak signal (-76 to -85 triggers needsAttention)
            })
            const insights = insightEngine.generateInsights(userInfo)

            const hardwareInsights = insights.filter((i) => i.category === 'hardware')
            expect(hardwareInsights.length).toBeGreaterThan(0)
        })

        it('should recommend static IP for premium account', () => {
            const userInfo = createMockUserInfo({
                accountTypeName: 'Premium Business',
                accountPrice: 75,
                staticIP: '',
            })
            const insights = insightEngine.generateInsights(userInfo)

            const hardwareInsights = insights.filter((i) => i.category === 'hardware')
            const staticIpInsights = hardwareInsights.filter((i) =>
                i.title.includes('Static IP')
            )
            expect(staticIpInsights.length).toBeGreaterThan(0)
        })
    })

    describe('Insight Sorting and Priority', () => {
        it('should sort critical issues first', () => {
            const userInfo = createMockUserInfo({
                accessPointSignal: '-89 / -85', // Critical
                blocked: true, // Critical
                expiryAccount: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // Warning
            })
            const insights = insightEngine.generateInsights(userInfo)

            expect(insights.length).toBeGreaterThan(0)
            expect(insights[0].severity).toBe('critical')
        })

        it('should return empty array for healthy customer', () => {
            const userInfo = createMockUserInfo()
            const insights = insightEngine.generateInsights(userInfo)

            // Should have some insights (healthy status or optimization opportunities)
            // but no critical or warning issues
            const criticalOrWarning = insights.filter(
                (i) => i.severity === 'critical' || i.severity === 'warning'
            )
            expect(criticalOrWarning.length).toBe(0)
        })
    })
})
