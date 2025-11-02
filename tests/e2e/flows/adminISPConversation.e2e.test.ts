import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { createMockISPService } from '../../utils/MockISPService.js'
import { onlineCustomer, offlineCustomer, expiredCustomer } from '../../fixtures/ispCustomerData.js'
import { testPersonality } from '../../fixtures/personalities.js'
import { ispQueryFlow } from '~/features/isp/flows/ISPQueryFlow.js'
import { welcomeFlow } from '~/features/conversation/flows/WelcomeFlow.js'
import { userListingFlow } from '~/features/admin/flows/UserListingFlow.js'
import { CoreAIService } from '~/features/conversation/services/CoreAIService.js'

describe('Admin ISP Conversation with AI Follow-ups', () => {
  let harness: FlowTestHarness
  let mockISPService: ReturnType<typeof createMockISPService>
  let mockTelegramUserService: any
  let mockUserManagementService: any
  let mockBotStateService: any
  let mockMessageService: any

  const ADMIN_ID = '+admin123'
  const ADMIN_2_ID = '+admin456'
  const USER_ID = '+user789'

  beforeEach(async () => {
    // Create mock ISP service
    mockISPService = createMockISPService()

    // Create REAL CoreAIService with mock ISP tools
    const coreAIService = new CoreAIService()

    // Create mock Telegram user service
    mockTelegramUserService = {
      getAllUsers: vi.fn(async () => [
        {
          telegram_id: ADMIN_ID,
          first_name: 'Admin',
          telegram_handle: '@admin',
          worker_username: 'admin',
          last_interaction: new Date()
        }
      ]),
      getUserById: vi.fn()
    }

    // Create mock user management service
    mockUserManagementService = {
      getPersonality: vi.fn(async () => testPersonality),
      isWhitelisted: vi.fn(async () => true),
      isAdmin: vi.fn((userId: string) => [ADMIN_ID, ADMIN_2_ID].includes(userId)),
    }

    // Mock bot state service
    mockBotStateService = {
      isMaintenanceMode: vi.fn(async () => false),
      isFeatureEnabled: vi.fn(async () => true),
    }

    // Mock message service with conversation history
    mockMessageService = {
      getConversationHistory: vi.fn(async () => []),
      logIncoming: vi.fn(async () => {}),
      logOutgoing: vi.fn(async () => {}),
    }

    // Create test harness with all flows
    const allFlows = [ispQueryFlow, welcomeFlow, userListingFlow]

    harness = createFlowTestHarness(
      allFlows,
      {
        coreAIService, // REAL AI service for authentic conversation behavior
        ispService: mockISPService, // Mock ISP with realistic data
        telegramUserService: mockTelegramUserService,
        userManagementService: mockUserManagementService,
        botStateService: mockBotStateService,
        messageService: mockMessageService,
      },
      false // Debug mode
    )
  })

  afterEach(() => {
    harness.reset()
    vi.clearAllMocks()
  })

  describe('Basic ISP Query Flows', () => {
    it('should allow admin to check customer by username', async () => {
      const response = await harness.sendMessage(ADMIN_ID, 'check josianeyoussef')

      // Verify ISP service was called
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)
      expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

      // Verify response contains customer data
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toContain('Josiane')
      expect(response.lastMessage!.text).toContain('Youssef')
      expect(response.lastMessage!.options?.parse_mode).toBe('HTML')
    })

    it('should extract phone number from natural language query', async () => {
      const response = await harness.sendMessage(
        ADMIN_ID,
        'Can you find the customer with phone +961 71 534 710?'
      )

      // Verify ISP service was called with extracted phone
      expect(mockISPService.searchCustomerCalls.length).toBeGreaterThan(0)
      const callIdentifier = mockISPService.searchCustomerCalls[0].identifier
      expect(callIdentifier).toMatch(/71.*534.*710/)

      // Verify response contains customer data
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toContain('Josiane')
    })

    it('should handle customer lookup by phone number directly', async () => {
      const response = await harness.sendMessage(ADMIN_ID, 'check 71534710')

      // Verify ISP service was called
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify response contains customer data
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toContain('Josiane')
      expect(response.lastMessage!.options?.parse_mode).toBe('HTML')
    })
  })

  describe('Multi-Turn Conversations with AI Follow-ups', () => {
    it('should maintain conversation context for follow-up technical questions', async () => {
      // Turn 1: Admin requests customer info
      const turn1 = await harness.sendMessage(ADMIN_ID, 'check josianeyoussef')

      expect(turn1.lastMessage).toBeDefined()
      expect(turn1.lastMessage!.text).toContain('Josiane')
      const initialISPCalls = mockISPService.searchCustomerCalls.length

      // Turn 2: Admin asks follow-up technical question (should use AI with context)
      const turn2 = await harness.sendMessage(ADMIN_ID, 'what is the IP address?')

      // Verify no additional ISP API calls (AI uses previous context)
      expect(mockISPService.searchCustomerCalls.length).toBe(initialISPCalls)

      // Verify AI response references the IP from previous query
      expect(turn2.lastMessage).toBeDefined()
      expect(turn2.lastMessage!.text).toMatch(/10\.50\.1\.45|IP/)
    })

    it('should handle multiple follow-up questions maintaining context', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'check josianeyoussef' },
        { from: ADMIN_ID, body: 'what is the access point?' },
        { from: ADMIN_ID, body: 'is the customer online?' },
        { from: ADMIN_ID, body: 'what is the account price?' },
      ])

      // Verify only one ISP API call (first message)
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify responses are contextually relevant
      expect(conversation[0].lastMessage).toBeDefined()
      expect(conversation[0].lastMessage!.text).toContain('Josiane')
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toMatch(/access.*point|AP/i)
      expect(conversation[2].lastMessage).toBeDefined()
      expect(conversation[2].lastMessage!.text).toMatch(/online|status/i)
      expect(conversation[3].lastMessage).toBeDefined()
      expect(conversation[3].lastMessage!.text).toMatch(/price|250|account/i)
    })

    it('should handle complex technical follow-up about network infrastructure', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'lookup 71534710' },
        { from: ADMIN_ID, body: 'what NAS host is this customer connected to?' },
        { from: ADMIN_ID, body: 'explain the network topology for this user' },
      ])

      // Only one ISP call
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify AI references actual customer data
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toMatch(/NAS|host|network/i)
      expect(conversation[2].lastMessage).toBeDefined()
      expect(conversation[2].lastMessage!.text).toMatch(/topology|network|infrastructure/i)
    })
  })

  describe('Edge Cases', () => {
    it('should handle customer not found gracefully', async () => {
      const response = await harness.sendMessage(ADMIN_ID, 'check nonexistent_user_12345')

      // Verify ISP service was called
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify helpful error message
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toMatch(/not found|no customer|couldn't find/i)
    })

    it('should handle offline customer status correctly', async () => {
      // Mock ISP service to return offline customer
      mockISPService.searchCustomer = vi.fn().mockResolvedValue([offlineCustomer])

      const response = await harness.sendMessage(ADMIN_ID, 'check karimabdallah')

      // Verify response indicates offline status
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toMatch(/offline|not online|disconnected/i)
      expect(response.lastMessage!.text).toContain('Karim')
    })

    it('should handle expired customer account', async () => {
      // Mock ISP service to return expired customer
      mockISPService.searchCustomer = vi.fn().mockResolvedValue([expiredCustomer])

      const response = await harness.sendMessage(ADMIN_ID, 'check ramimansour')

      // Verify response indicates expired status
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toMatch(/expired|inactive/i)
      expect(response.lastMessage!.text).toContain('Rami')
    })

    it('should handle invalid phone format gracefully', async () => {
      const response = await harness.sendMessage(ADMIN_ID, 'check abc-def-ghij')

      // Should still attempt to search (ISP API handles validation)
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)
    })

    it('should handle multiple matching customers', async () => {
      // Mock ISP service to return multiple matches
      mockISPService.searchCustomer = vi.fn().mockResolvedValue([
        onlineCustomer,
        offlineCustomer
      ])

      const response = await harness.sendMessage(ADMIN_ID, 'check 71')

      // Verify response presents multiple options
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toContain('Josiane')
      expect(response.lastMessage!.text).toContain('Karim')
    })
  })

  describe('Complex Admin Workflow Scenarios', () => {
    it('should maintain state isolation when switching between user management and ISP queries', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: '/users' }, // Admin command
        { from: ADMIN_ID, body: 'check josianeyoussef' }, // ISP query
        { from: ADMIN_ID, body: 'what is the IP?' }, // Follow-up
        { from: ADMIN_ID, body: '/users' }, // Back to admin command
      ])

      // Verify correct command routing
      expect(conversation[0].lastMessage).toBeDefined()
      expect(conversation[0].lastMessage!.text).toMatch(/telegram.*users|user.*list/i)
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toContain('Josiane')
      expect(conversation[2].lastMessage).toBeDefined()
      expect(conversation[2].lastMessage!.text).toMatch(/10\.50\.1\.45|IP/i)
      expect(conversation[3].lastMessage).toBeDefined()
      expect(conversation[3].lastMessage!.text).toMatch(/telegram.*users|user.*list/i)
    })

    it('should handle multiple admins querying different customers concurrently', async () => {
      // Admin 1 queries Josiane
      const admin1Response = await harness.sendMessage(ADMIN_ID, 'check josianeyoussef')

      // Admin 2 queries Karim
      mockISPService.searchCustomer = vi.fn().mockResolvedValue([offlineCustomer])
      const admin2Response = await harness.sendMessage(ADMIN_2_ID, 'check karimabdallah')

      // Verify independent contexts
      expect(admin1Response.lastMessage).toBeDefined()
      expect(admin1Response.lastMessage!.text).toContain('Josiane')
      expect(admin2Response.lastMessage).toBeDefined()
      expect(admin2Response.lastMessage!.text).toContain('Karim')
      expect(mockISPService.searchCustomerCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('should allow admin to check customer then ask about network details', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'info 71534710' },
        { from: ADMIN_ID, body: 'show me the MAC address' },
        { from: ADMIN_ID, body: 'what upload/download speeds is this user getting?' },
      ])

      // Only one ISP call
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify contextual responses
      expect(conversation[0].lastMessage).toBeDefined()
      expect(conversation[0].lastMessage!.text).toContain('Josiane')
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toMatch(/MAC|address/i)
      expect(conversation[2].lastMessage).toBeDefined()
      expect(conversation[2].lastMessage!.text).toMatch(/speed|download|upload|Mbps/i)
    })

    it('should handle admin asking about customer billing details', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'lookup josianeyoussef' },
        { from: ADMIN_ID, body: 'when does the account expire?' },
        { from: ADMIN_ID, body: 'what is the account price?' },
        { from: ADMIN_ID, body: 'is there any balance?' },
      ])

      // Only one ISP call
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)

      // Verify billing-related responses
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toMatch(/expire|expiry|date/i)
      expect(conversation[2].lastMessage).toBeDefined()
      expect(conversation[2].lastMessage!.text).toMatch(/price|250|cost/i)
      expect(conversation[3].lastMessage).toBeDefined()
      expect(conversation[3].lastMessage!.text).toMatch(/balance/i)
    })
  })

  describe('Response Validation', () => {
    it('should always use HTML parse_mode for formatted responses', async () => {
      const response = await harness.sendMessage(ADMIN_ID, 'check josianeyoussef')

      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.options?.parse_mode).toBe('HTML')
    })

    it('should not make duplicate ISP API calls for cached data', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'check josianeyoussef' },
        { from: ADMIN_ID, body: 'show me the details again' },
        { from: ADMIN_ID, body: 'what was the IP address?' },
      ])

      // Should only call ISP API once (first query)
      expect(mockISPService.searchCustomerCalls).toHaveLength(1)
    })

    it('should generate contextually relevant AI responses', async () => {
      const conversation = await harness.simulateConversation([
        { from: ADMIN_ID, body: 'lookup 71534710' },
        { from: ADMIN_ID, body: 'is this a fiber or wireless connection?' },
      ])

      // Verify AI references actual customer data
      expect(conversation[1].lastMessage).toBeDefined()
      expect(conversation[1].lastMessage!.text).toMatch(/fiber|wireless|connection|type/i)
    })
  })

  describe('Admin Privilege Verification', () => {
    it('should allow admin to bypass rate limits for ISP queries', async () => {
      // Simulate rapid ISP queries (would trigger rate limit for normal users)
      const responses = await Promise.all([
        harness.sendMessage(ADMIN_ID, 'check josianeyoussef'),
        harness.sendMessage(ADMIN_ID, 'check karimabdallah'),
        harness.sendMessage(ADMIN_ID, 'check ramimansour'),
      ])

      // All queries should succeed (no rate limit errors)
      responses.forEach(response => {
        expect(response.lastMessage).toBeDefined()
        expect(response.lastMessage!.text).not.toMatch(/rate limit|too many requests/i)
      })
    })

    it('should allow admin to query during maintenance mode', async () => {
      // Enable maintenance mode
      const mockBotStateService = harness['extensions'].botStateService as any
      mockBotStateService.isMaintenanceMode = vi.fn().mockResolvedValue(true)

      const response = await harness.sendMessage(ADMIN_ID, 'check josianeyoussef')

      // Admin query should succeed even in maintenance mode
      expect(response.lastMessage).toBeDefined()
      expect(response.lastMessage!.text).toContain('Josiane')
      expect(response.lastMessage!.text).not.toMatch(/maintenance/i)
    })
  })
})
