/**
 * Menu System Flows
 *
 * Exports all menu-related flows for registration in app.ts
 */

// Main menu
export { mainMenuFlow, menuBackFlow } from './MainMenuFlow'

// User Info submenu
export {
    userInfoMenuFlow,
    checkCustomerFlow,
    accountStatusFlow,
    networkInfoFlow,
} from './UserInfoMenuFlow'

// Settings submenu
export { settingsMenuFlow, updatePersonalityFlow } from './SettingsMenuFlow'

// Help submenu
export { helpMenuFlow, helpStartFlow, helpCommandsFlow, helpISPFlow } from './HelpMenuFlow'

// Privacy submenu
export { privacyMenuFlow, viewDataFlow, deleteDataFlow } from './PrivacyMenuFlow'
