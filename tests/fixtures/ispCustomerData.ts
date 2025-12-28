/**
 * ISP Customer Data Fixtures
 *
 * Realistic test data matching the exact ISPUserInfo interface (51 fields)
 * Used for testing ISP flows without making real API calls
 */

import type { ISPUserInfo, MikrotikUser } from '~/features/isp/services/ISPService'

/**
 * Online customer with full data
 * Username: josianeyoussef
 * Phone: +961 71 534 710
 */
export const onlineCustomer: ISPUserInfo = {
    // Personal info
    id: 1,
    userName: 'josianeyoussef',
    firstName: 'Josiane',
    lastName: 'Youssef',
    mobile: '+961 71 534 710',
    phone: '+961 71 534 710',
    mailAddress: 'josiane.youssef@example.com',
    address: 'Beirut, Lebanon',
    comment: 'Premium customer - priority support',
    mof: 'MOF12345',

    // Account info
    creationDate: '2024-01-15T10:30:00Z',
    lastLogin: '2025-11-02T08:15:00Z',
    lastLogOut: '2025-11-01T22:45:00Z',
    userCategoryId: 1,
    financialCategoryId: 2,
    userGroupId: 10,
    linkId: 100,
    archived: false,

    // Account status
    online: true,
    active: true,
    activatedAccount: true,
    blocked: false,
    expiryAccount: '2025-12-31T23:59:59Z',
    accountTypeName: 'Premium Fiber',
    userUpTime: '9h 45m 23s',
    fupMode: 'Normal',

    // Technical details
    ipAddress: '10.50.1.45',
    staticIP: '203.0.113.25',
    macAddress: '00:1A:2B:3C:4D:5E',
    nasHost: 'nas-beirut-01.example.com',
    mikrotikInterface: 'ether1-gateway',
    routerBrand: 'Mikrotik',

    // Station info
    stationOnline: true,
    stationName: 'Station-Beirut-Central',
    stationIpAddress: '10.50.1.1',
    stationUpTime: '45d 12h 30m',
    stationInterfaceStats: [
        { interface: 'ether1', rxBytes: 1024000000, txBytes: 512000000 },
    ],

    // Access point info
    accessPointOnline: true,
    accessPointName: 'AP-Beirut-Tower-A',
    accessPointBoardName: 'RB750Gr3',
    accessPointIpAddress: '10.50.1.10',
    accessPointUpTime: '30d 8h 15m',
    accessPointSignal: '-65 dBm',
    accessPointElectrical: true,
    accessPointInterfaceStats: [
        { interface: 'wlan1', rxBytes: 512000000, txBytes: 256000000 },
    ],
    accessPointUsers: [
        { userName: 'josianeyoussef', online: true },
        { userName: 'customer2', online: true },
        { userName: 'customer3', online: false },
    ],

    // Network speeds & quotas
    basicSpeedUp: 100, // 100 Mbps
    basicSpeedDown: 100, // 100 Mbps
    dailyQuota: '50 GB',
    monthlyQuota: 'Unlimited',

    // Billing
    accountPrice: 75.0, // $75/month
    discount: 10.0, // $10 discount
    realIpPrice: 5.0, // $5/month for static IP
    iptvPrice: 15.0, // $15/month for IPTV

    // Collector info
    collectorId: 500,
    collectorUserName: 'collector_beirut',
    collectorFirstName: 'Ahmed',
    collectorLastName: 'Hassan',
    collectorMobile: '+961 70 123 456',

    // Session history
    userSessions: [
        {
            startSession: '2025-11-02T08:15:00Z',
            endSession: null, // Current session
            sessionTime: null,
        },
        {
            startSession: '2025-11-01T09:00:00Z',
            endSession: '2025-11-01T22:45:00Z',
            sessionTime: '13h 45m',
        },
        {
            startSession: '2025-10-31T10:30:00Z',
            endSession: '2025-10-31T23:00:00Z',
            sessionTime: '12h 30m',
        },
    ],

    // Ping results
    pingResult: [
        'PING 10.50.1.45: 56 data bytes',
        '64 bytes from 10.50.1.45: icmp_seq=0 ttl=64 time=2.5 ms',
        '64 bytes from 10.50.1.45: icmp_seq=1 ttl=64 time=2.3 ms',
        '64 bytes from 10.50.1.45: icmp_seq=2 ttl=64 time=2.4 ms',
        '--- 10.50.1.45 ping statistics ---',
        '3 packets transmitted, 3 packets received, 0.0% packet loss',
    ],

    // Location
    latitude: 33.8886,
    longitude: 35.4955,
}

/**
 * Offline customer (disconnected)
 * Username: customer_offline
 * Phone: +961 70 999 888
 */
export const offlineCustomer: ISPUserInfo = {
    // Personal info
    id: 2,
    userName: 'customer_offline',
    firstName: 'Karim',
    lastName: 'Abdallah',
    mobile: '+961 70 999 888',
    phone: '+961 70 999 888',
    mailAddress: 'karim.abdallah@example.com',
    address: 'Tripoli, Lebanon',
    comment: 'Standard customer',
    mof: 'MOF67890',

    // Account info
    creationDate: '2023-06-20T14:00:00Z',
    lastLogin: '2025-10-30T18:00:00Z',
    lastLogOut: '2025-10-30T23:30:00Z',
    userCategoryId: 2,
    financialCategoryId: 1,
    userGroupId: 20,
    linkId: 200,
    archived: false,

    // Account status
    online: false,
    active: true,
    activatedAccount: true,
    blocked: false,
    expiryAccount: '2025-11-30T23:59:59Z',
    accountTypeName: 'Standard DSL',
    userUpTime: '0h 0m 0s',
    fupMode: 'Normal',

    // Technical details
    ipAddress: '',
    staticIP: '',
    macAddress: '00:9A:8B:7C:6D:5E',
    nasHost: 'nas-tripoli-02.example.com',
    mikrotikInterface: 'ether2-dsl',
    routerBrand: 'TP-Link',

    // Station info
    stationOnline: true,
    stationName: 'Station-Tripoli-North',
    stationIpAddress: '10.60.1.1',
    stationUpTime: '20d 5h 10m',
    stationInterfaceStats: [
        { interface: 'ether1', rxBytes: 512000000, txBytes: 256000000 },
    ],

    // Access point info
    accessPointOnline: false,
    accessPointName: 'AP-Tripoli-Building-B',
    accessPointBoardName: 'hAP ac2',
    accessPointIpAddress: '10.60.1.20',
    accessPointUpTime: '0h 0m 0s',
    accessPointSignal: 'N/A',
    accessPointElectrical: false,
    accessPointInterfaceStats: null,
    accessPointUsers: [],

    // Network speeds & quotas
    basicSpeedUp: 20, // 20 Mbps
    basicSpeedDown: 50, // 50 Mbps
    dailyQuota: '10 GB',
    monthlyQuota: '200 GB',

    // Billing
    accountPrice: 35.0, // $35/month
    discount: 0.0,
    realIpPrice: 0.0,
    iptvPrice: 0.0,

    // Collector info
    collectorId: 501,
    collectorUserName: 'collector_tripoli',
    collectorFirstName: 'Fatima',
    collectorLastName: 'Khalil',
    collectorMobile: '+961 71 987 654',

    // Session history
    userSessions: [
        {
            startSession: '2025-10-30T18:00:00Z',
            endSession: '2025-10-30T23:30:00Z',
            sessionTime: '5h 30m',
        },
        {
            startSession: '2025-10-29T19:15:00Z',
            endSession: '2025-10-30T01:00:00Z',
            sessionTime: '5h 45m',
        },
    ],

    // Ping results
    pingResult: [
        'PING 10.60.1.45: Host unreachable',
    ],

    // Location (offline customer may not have location)
    latitude: null,
    longitude: null,
}

/**
 * Expired account customer
 * Username: expired_account
 * Phone: +961 76 111 222
 */
export const expiredCustomer: ISPUserInfo = {
    // Personal info
    id: 3,
    userName: 'expired_account',
    firstName: 'Rami',
    lastName: 'Mansour',
    mobile: '+961 76 111 222',
    phone: '+961 76 111 222',
    mailAddress: 'rami.mansour@example.com',
    address: 'Saida, Lebanon',
    comment: 'Account expired - payment overdue',
    mof: 'MOF11122',

    // Account info
    creationDate: '2022-03-10T09:00:00Z',
    lastLogin: '2025-09-15T10:30:00Z',
    lastLogOut: '2025-09-15T22:00:00Z',
    userCategoryId: 3,
    financialCategoryId: 1,
    userGroupId: 30,
    linkId: 300,
    archived: false,

    // Account status
    online: false,
    active: false,
    activatedAccount: false,
    blocked: true,
    expiryAccount: '2025-09-30T23:59:59Z', // Expired
    accountTypeName: 'Basic',
    userUpTime: '0h 0m 0s',
    fupMode: 'Disabled',

    // Technical details
    ipAddress: '',
    staticIP: '',
    macAddress: '00:5A:4B:3C:2D:1E',
    nasHost: 'nas-saida-01.example.com',
    mikrotikInterface: 'ether3-basic',
    routerBrand: 'Mikrotik',

    // Station info
    stationOnline: true,
    stationName: 'Station-Saida-East',
    stationIpAddress: '10.70.1.1',
    stationUpTime: '60d 10h 20m',
    stationInterfaceStats: [
        { interface: 'ether1', rxBytes: 256000000, txBytes: 128000000 },
    ],

    // Access point info
    accessPointOnline: true,
    accessPointName: 'AP-Saida-Zone-C',
    accessPointBoardName: 'RB4011iGS+',
    accessPointIpAddress: '10.70.1.30',
    accessPointUpTime: '15d 3h 45m',
    accessPointSignal: 'N/A',
    accessPointElectrical: true,
    accessPointInterfaceStats: [
        { interface: 'wlan1', rxBytes: 128000000, txBytes: 64000000 },
    ],
    accessPointUsers: [],

    // Network speeds & quotas
    basicSpeedUp: 10, // 10 Mbps
    basicSpeedDown: 20, // 20 Mbps
    dailyQuota: '5 GB',
    monthlyQuota: '100 GB',

    // Billing
    accountPrice: 25.0, // $25/month
    discount: 0.0,
    realIpPrice: 0.0,
    iptvPrice: 0.0,

    // Collector info
    collectorId: 502,
    collectorUserName: 'collector_saida',
    collectorFirstName: 'Omar',
    collectorLastName: 'Saleh',
    collectorMobile: '+961 70 222 333',

    // Session history
    userSessions: [
        {
            startSession: '2025-09-15T10:30:00Z',
            endSession: '2025-09-15T22:00:00Z',
            sessionTime: '11h 30m',
        },
    ],

    // Ping results
    pingResult: [
        'PING 10.70.1.45: Request timeout',
    ],

    // Location
    latitude: 33.9000,
    longitude: 35.5000,
}

/**
 * Mikrotik users on interface
 */
export const mikrotikUsers: MikrotikUser[] = [
    { userName: 'josianeyoussef', online: true },
    { userName: 'customer_offline', online: false },
    { userName: 'customer2', online: true },
    { userName: 'customer3', online: false },
    { userName: 'customer4', online: true },
]

/**
 * All test customers (for search operations)
 */
export const allCustomers: ISPUserInfo[] = [
    onlineCustomer,
    offlineCustomer,
    expiredCustomer,
]

/**
 * Helper: Find customer by phone or username
 */
export function findCustomer(identifier: string): ISPUserInfo | undefined {
    const normalized = identifier.toLowerCase().trim()
    return allCustomers.find(
        (customer) =>
            customer.userName.toLowerCase() === normalized ||
            customer.mobile === identifier ||
            customer.phone === identifier
    )
}

/**
 * Helper: Find customers matching partial search
 */
export function searchCustomers(query: string): ISPUserInfo[] {
    const normalized = query.toLowerCase().trim()
    return allCustomers.filter(
        (customer) =>
            customer.userName.toLowerCase().includes(normalized) ||
            customer.firstName.toLowerCase().includes(normalized) ||
            customer.lastName.toLowerCase().includes(normalized) ||
            customer.mobile.includes(query) ||
            customer.phone.includes(query)
    )
}
