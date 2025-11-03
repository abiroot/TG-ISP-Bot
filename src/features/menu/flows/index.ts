/**
 * Menu System Flows
 *
 * Exports all menu-related flows for registration in app.ts
 */

// Main menu (Admin-only)
export { mainMenuFlow, menuBackFlow } from './MainMenuFlow'

// Admin submenus
export {
    adminWhitelistFlow,
    adminBotFlow,
    adminRolesFlow,
    adminUsersFlow,
    adminLocationsFlow,
    cmdWhitelistFlow,
    cmdRemoveWhitelistFlow,
    cmdListWhitelistFlow,
    cmdBotStatusFlow,
    cmdToggleMaintenanceFlow,
    confirmToggleMaintenanceFlow,
    cmdToggleAIFlow,
    cmdToggleRAGFlow,
    cmdToggleVoiceFlow,
    cmdToggleMediaFlow,
    cmdToggleISPFlow,
    cmdListRolesFlow,
    cmdShowRoleFlow,
    cmdAddRoleFlow,
    cmdSetRoleFlow,
    cmdRemoveRoleFlow,
} from './AdminMenuFlow'

// User Info submenu (kept for potential future use)
export { userInfoMenuFlow, checkCustomerFlow } from './UserInfoMenuFlow'

// Settings submenu
export { settingsMenuFlow, updatePersonalityFlow } from './SettingsMenuFlow'

// Help submenu
export { helpMenuFlow, helpStartFlow, helpCommandsFlow, helpISPFlow } from './HelpMenuFlow'

// Privacy submenu
export { privacyMenuFlow, viewDataFlow, deleteDataFlow } from './PrivacyMenuFlow'
