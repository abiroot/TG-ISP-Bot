# Telegram Interactive Buttons Guide

Complete guide to using interactive buttons in your Telegram bot built with BuilderBot and Telegraf.

## Table of Contents

- [Overview](#overview)
- [Button Types](#button-types)
- [Quick Start](#quick-start)
- [Button Utilities](#button-utilities)
- [Flow Helpers](#flow-helpers)
- [Handling Button Clicks](#handling-button-clicks)
- [Common Patterns](#common-patterns)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Telegram supports two main types of keyboards:

1. **Inline Keyboards** - Buttons that appear below messages, can trigger callbacks
2. **Reply Keyboards** - Buttons that replace the text input area

This bot uses **Telegraf's Markup API** wrapped in type-safe utility functions for easy button creation.

### Architecture

```
User clicks button
     ↓
Telegram sends callback_query event
     ↓
Global handler in app.ts (line 213)
     ↓
Parses callback data (format: "prefix:data")
     ↓
Dispatches custom event "BUTTON_PREFIX"
     ↓
Flow listens for event via addKeyword('BUTTON_PREFIX')
     ↓
Flow handles button click
```

---

## Button Types

### Inline Keyboard Buttons

Inline buttons appear directly below messages and stay attached to them.

#### **Callback Button**
Triggers a callback when clicked. Most common button type.

```typescript
import { createCallbackButton } from '~/utils/telegramButtons'

createCallbackButton('Confirm', 'action_confirm')
// Result: Button labeled "Confirm" that sends "action_confirm" as callback data
```

**Callback Data Format:**
- Simple: `'action_confirm'` → dispatches `BUTTON_ACTION_CONFIRM`
- With data: `'user:123456'` → dispatches `BUTTON_USER` with body `'123456'`
- Max 64 bytes

#### **URL Button**
Opens a URL when clicked.

```typescript
import { createUrlButton } from '~/utils/telegramButtons'

createUrlButton('Visit Website', 'https://example.com')
createUrlButton('Call Customer', 'tel:+1234567890')
createUrlButton('Open Telegram Chat', 'tg://user?id=123456789')
```

#### **Copy Text Button**
Copies text to user's clipboard.

```typescript
import { createCopyTextButton } from '~/utils/telegramButtons'

createCopyTextButton('Copy Account ID', 'ACC_123456789')
// Max 256 characters
```

#### **Web App Button**
Launches a Telegram Web App.

```typescript
import { createWebAppButton } from '~/utils/telegramButtons'

createWebAppButton('Open Dashboard', 'https://app.example.com')
// URL must be HTTPS
```

#### **Switch Inline Button**
Switches to inline mode (for inline bots).

```typescript
import { createSwitchInlineButton } from '~/utils/telegramButtons'

createSwitchInlineButton('Search', 'query terms')
createSwitchInlineButton('Search Here', 'query', true) // current chat
```

#### **Login Button**
Telegram Login Widget integration.

```typescript
import { createLoginButton } from '~/utils/telegramButtons'

createLoginButton('Login', 'https://example.com/auth', {
    requestWriteAccess: true,
    forwardText: 'Login to continue'
})
```

---

### Reply Keyboard Buttons

Reply keyboards replace the standard text input area.

#### **Text Button**
Sends the button text as a message.

```typescript
import { createTextButton } from '~/utils/telegramButtons'

createTextButton('Main Menu')
createTextButton('Settings')
```

#### **Contact Button**
Requests user's phone number.

```typescript
import { createContactButton } from '~/utils/telegramButtons'

createContactButton('📱 Share Contact')
```

#### **Location Button**
Requests user's location.

```typescript
import { createLocationButton } from '~/utils/telegramButtons'

createLocationButton('📍 Share Location')
```

#### **Poll Button**
Requests user to create a poll.

```typescript
import { createPollButton } from '~/utils/telegramButtons'

createPollButton('Create Poll')
createPollButton('Create Quiz', 'quiz')
```

---

## Quick Start

### 1. Send a Message with Inline Buttons

```typescript
import { addKeyword } from '@builderbot/bot'
import { sendWithInlineButtons } from '~/utils/flowHelpers'
import { createCallbackButton, createUrlButton } from '~/utils/telegramButtons'

export const myFlow = addKeyword<any, any>('start')
    .addAction(async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '🎮 Choose an action:',
            [
                [createCallbackButton('✅ Confirm', 'action_confirm')],
                [createCallbackButton('❌ Cancel', 'action_cancel')],
                [createUrlButton('🔗 Help', 'https://example.com/help')]
            ],
            { parseMode: 'HTML' }
        )
    })
```

### 2. Handle Button Clicks

```typescript
// Listen for callback with prefix "action_confirm"
export const confirmFlow = addKeyword<any, any>('BUTTON_ACTION_CONFIRM')
    .addAction(async (ctx, { flowDynamic }) => {
        await flowDynamic('✅ Action confirmed!')
    })

// Listen for callback with prefix "action_cancel"
export const cancelFlow = addKeyword<any, any>('BUTTON_ACTION_CANCEL')
    .addAction(async (ctx, { flowDynamic }) => {
        await flowDynamic('❌ Action cancelled')
    })
```

### 3. Register Flows in app.ts

```typescript
import { myFlow, confirmFlow, cancelFlow } from '~/flows/myFlow'

const adapterFlow = createFlow([
    myFlow,
    confirmFlow,
    cancelFlow,
    // ... other flows
])
```

---

## Button Utilities

Location: `src/utils/telegramButtons.ts`

### Button Builders

All button builders return button config objects that work with the keyboard builders.

```typescript
// Callback buttons
createCallbackButton(text, callbackData)
createUrlButton(text, url)
createWebAppButton(text, webAppUrl)
createCopyTextButton(text, copyText)
createSwitchInlineButton(text, query, currentChat?)
createLoginButton(text, url, options?)

// Reply keyboard buttons
createTextButton(text)
createContactButton(text)
createLocationButton(text)
createPollButton(text, type?)
```

### Keyboard Builders

Convert button configs into Telegram keyboard markup.

```typescript
import { createInlineKeyboard, createReplyKeyboard } from '~/utils/telegramButtons'

// Inline keyboard (2D array of buttons)
const inlineKeyboard = createInlineKeyboard([
    [button1, button2],  // Row 1
    [button3],            // Row 2
])

// Reply keyboard
const replyKeyboard = createReplyKeyboard([
    [textButton1, textButton2],
    [contactButton]
])
```

### Quick Builders

Pre-built patterns for common use cases.

```typescript
import {
    createYesNoKeyboard,
    createConfirmKeyboard,
    createBackButton,
    createCloseButton,
    createPaginationKeyboard
} from '~/utils/telegramButtons'

// Yes/No confirmation
createYesNoKeyboard('yes', 'no')
// Returns: [[Yes button, No button]]

// Confirmation with custom action
createConfirmKeyboard('Delete', 'delete_confirm', 'delete_cancel')
// Returns: [[Confirm Delete button], [Cancel button]]

// Back button
createBackButton('back_to_menu')
// Returns: [[← Back button]]

// Close button
createCloseButton('close')
// Returns: [[✖️ Close button]]

// Pagination
createPaginationKeyboard(2, 10, 'page')
// Returns: [[◀️ Prev, 2/10, Next ▶️]]
```

### Callback Data Utilities

Helper functions for managing callback data.

```typescript
import { prefixCallbackData, parseCallbackData, validateCallbackData } from '~/utils/telegramButtons'

// Create prefixed callback data
prefixCallbackData('user', '123456')
// Returns: 'user:123456'

// Parse callback data
parseCallbackData('user:123456')
// Returns: { prefix: 'user', data: '123456' }

// Validate length (max 64 bytes)
validateCallbackData('my_callback_data')
// Throws error if > 64 bytes
```

---

## Flow Helpers

Location: `src/utils/flowHelpers.ts`

### sendWithInlineButtons

Send a message with inline keyboard buttons.

```typescript
await sendWithInlineButtons(
    ctx,
    utils,
    message: string,
    buttons: InlineKeyboard,  // 2D array of button configs
    options?: {
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
        disableWebPagePreview?: boolean
        disableNotification?: boolean
        media?: string
        metadata?: Record<string, any>
    }
)
```

**Example:**

```typescript
await sendWithInlineButtons(
    ctx,
    { flowDynamic } as any,
    '<b>Customer Actions:</b>',
    [
        [createCallbackButton('🔄 Refresh', 'refresh_123')],
        [createUrlButton('📞 Call', 'tel:+1234567890')],
        [createCallbackButton('← Back', 'back_menu')]
    ],
    { parseMode: 'HTML' }
)
```

### sendWithReplyButtons

Send a message with reply keyboard buttons.

```typescript
await sendWithReplyButtons(
    ctx,
    utils,
    message: string,
    buttons: ReplyKeyboard,  // 2D array of button configs
    options?: {
        oneTime?: boolean        // Hide after use
        resize?: boolean         // Adjust keyboard size
        selective?: boolean      // Show to specific users
        placeholder?: string     // Input field placeholder
        persistent?: boolean     // Keep visible
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
        // ... other options
    }
)
```

**Example:**

```typescript
await sendWithReplyButtons(
    ctx,
    { flowDynamic } as any,
    'Choose an option:',
    [
        [createTextButton('Main Menu'), createTextButton('Settings')],
        [createContactButton('📱 Share Contact')]
    ],
    { oneTime: true, resize: true }
)
```

### removeReplyKeyboard

Remove the reply keyboard and show standard text input.

```typescript
await removeReplyKeyboard(ctx, utils, 'Keyboard removed')
```

### editButtonsOnly

Update only the buttons of an existing message (text unchanged).

```typescript
await editButtonsOnly(
    ctx,
    utils,
    messageId: number,
    buttons: InlineKeyboard
)
```

**Example:**

```typescript
// After user clicks "Confirm", update to show completed state
await editButtonsOnly(ctx, utils, messageId, [
    [createCallbackButton('✅ Confirmed', 'noop')],
    [createCallbackButton('← Back', 'back_menu')]
])
```

### editMessageAndButtons

Update both text and buttons of an existing message.

```typescript
await editMessageAndButtons(
    ctx,
    utils,
    messageId: number,
    newText: string,
    buttons: InlineKeyboard,
    options?: { parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' }
)
```

**Example:**

```typescript
await editMessageAndButtons(
    ctx,
    utils,
    messageId,
    '✅ <b>Action completed!</b>',
    [[createCallbackButton('← Back', 'back')]],
    { parseMode: 'HTML' }
)
```

### answerCallbackQuery

Respond to a button click (removes loading state).

```typescript
await answerCallbackQuery(
    callbackQueryId: string,
    utils,
    text?: string,
    showAlert?: boolean  // Show modal alert instead of notification
)
```

**Example:**

```typescript
// In callback_query handler
await answerCallbackQuery(callbackQuery.id, utils, '✅ Action confirmed!')

// Show alert dialog
await answerCallbackQuery(callbackQuery.id, utils, '⚠️ This is important!', true)

// Just remove loading state (no notification)
await answerCallbackQuery(callbackQuery.id, utils)
```

**Note:** The global handler in `app.ts` automatically calls `answerCbQuery()`, so you typically don't need this unless you want custom notifications.

---

## Handling Button Clicks

### How It Works

1. User clicks button with callback_data `'user_info:123456'`
2. Telegram sends `callback_query` event to bot
3. Global handler in `app.ts` (line 213-261):
   - Parses callback data → `prefix: 'user_info'`, `data: '123456'`
   - Dispatches custom event `BUTTON_USER_INFO`
   - Passes `'123456'` as `ctx.body`
4. Flow listens for `BUTTON_USER_INFO` via `addKeyword()`

### Creating Handler Flows

```typescript
// Button sends callback_data: 'action_confirm'
export const confirmFlow = addKeyword<any, any>('BUTTON_ACTION_CONFIRM')
    .addAction(async (ctx, { flowDynamic }) => {
        // ctx.body is empty for simple callbacks
        await flowDynamic('✅ Confirmed!')
    })

// Button sends callback_data: 'user:123456'
export const userFlow = addKeyword<any, any>('BUTTON_USER')
    .addAction(async (ctx, { flowDynamic }) => {
        const userId = ctx.body  // '123456'
        await flowDynamic(`User ID: ${userId}`)
    })
```

### Accessing Original Callback Query

The original Telegram callback query object is attached to the context:

```typescript
export const myFlow = addKeyword<any, any>('BUTTON_MY_ACTION')
    .addAction(async (ctx, { flowDynamic }) => {
        const callbackQuery = (ctx as any)._callback_query

        if (callbackQuery?.message) {
            const messageId = callbackQuery.message.message_id
            const chatId = callbackQuery.message.chat.id
            // Use messageId to edit the original message
        }
    })
```

### Event Naming Convention

Callback data is converted to event names automatically:

| Callback Data | Event Name | ctx.body |
|---------------|------------|----------|
| `'action_confirm'` | `BUTTON_ACTION_CONFIRM` | `''` |
| `'user:123'` | `BUTTON_USER` | `'123'` |
| `'delete:post:456'` | `BUTTON_DELETE` | `'post:456'` |

**Convention:** Use `prefix:data` format where:
- `prefix` = action type (converted to `BUTTON_PREFIX`)
- `data` = parameters passed to handler

---

## Common Patterns

### 1. Confirmation Dialog

```typescript
// Initial action - show confirmation
export const deleteItemFlow = addKeyword<any, any>('delete item')
    .addAction(async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '⚠️ Are you sure you want to delete this item?',
            createConfirmKeyboard('Deletion', 'delete_yes', 'delete_no')
        )
    })

// Handle confirmation
export const deleteYesFlow = addKeyword<any, any>('BUTTON_DELETE_YES')
    .addAction(async (ctx, { flowDynamic }) => {
        // Perform deletion
        await flowDynamic('✅ Item deleted successfully!')
    })

// Handle cancellation
export const deleteNoFlow = addKeyword<any, any>('BUTTON_DELETE_NO')
    .addAction(async (ctx, { flowDynamic }) => {
        await flowDynamic('❌ Deletion cancelled')
    })
```

### 2. Multi-Step Menu

```typescript
// Main menu
export const mainMenuFlow = addKeyword<any, any>('menu')
    .addAction(async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '📋 Main Menu:',
            [
                [createCallbackButton('👤 User Info', 'menu_user')],
                [createCallbackButton('⚙️ Settings', 'menu_settings')],
                [createCallbackButton('ℹ️ Help', 'menu_help')]
            ]
        )
    })

// User info submenu
export const userInfoMenuFlow = addKeyword<any, any>('BUTTON_MENU_USER')
    .addAction(async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '👤 User Information:',
            [
                [createCallbackButton('📊 View Profile', 'user_profile')],
                [createCallbackButton('✏️ Edit Profile', 'user_edit')],
                ...createBackButton('menu_back')
            ]
        )
    })

// Back to main menu
export const menuBackFlow = addKeyword<any, any>('BUTTON_MENU_BACK')
    .addAction(async (ctx, { flowDynamic }) => {
        // Redirect to main menu
        await mainMenuFlow.addAction(async (ctx2, utils2) => {
            // Show main menu again
        })
    })
```

### 3. Dynamic Counter

```typescript
export const counterFlow = addKeyword<any, any>('counter')
    .addAction(async (ctx, { provider }) => {
        const message = await provider.vendor.telegram.sendMessage(
            ctx.from,
            '🔢 Counter: <code>0</code>',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕', callback_data: 'counter_inc:0' },
                            { text: '➖', callback_data: 'counter_dec:0' }
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset' }]
                    ]
                }
            }
        )
    })

export const counterIncFlow = addKeyword<any, any>('BUTTON_COUNTER_INC')
    .addAction(async (ctx, { provider }) => {
        const callbackQuery = (ctx as any)._callback_query
        const currentValue = parseInt(ctx.body || '0', 10)
        const newValue = currentValue + 1

        await provider.vendor.telegram.editMessageText(
            callbackQuery.message.chat.id,
            callbackQuery.message.message_id,
            undefined,
            `🔢 Counter: <code>${newValue}</code>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕', callback_data: `counter_inc:${newValue}` },
                            { text: '➖', callback_data: `counter_dec:${newValue}` }
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset' }]
                    ]
                }
            }
        )
    })
```

### 4. Pagination

```typescript
export const showPageFlow = addKeyword<any, any>('BUTTON_PAGE')
    .addAction(async (ctx, { flowDynamic }) => {
        const page = parseInt(ctx.body || '1', 10)
        const totalPages = 10

        const content = `📄 Page ${page}/${totalPages}\n\nContent goes here...`

        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            content,
            createPaginationKeyboard(page, totalPages, 'page')
        )
    })
```

### 5. Admin Action with Confirmation

```typescript
export const maintenanceModeFlow = addKeyword<any, any>('enable maintenance')
    .addAction(async (ctx, { flowDynamic }) => {
        // Check admin permissions first
        const { adminCheck } = await import('~/middleware/adminCheck')
        const isAdmin = await adminCheck(ctx)
        if (!isAdmin) {
            await flowDynamic('⛔ Admin access required')
            return
        }

        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '⚠️ <b>Enable Maintenance Mode?</b>\n\n' +
            'This will block all non-admin users from using the bot.',
            createConfirmKeyboard('Maintenance Mode', 'maintenance_yes', 'maintenance_no'),
            { parseMode: 'HTML' }
        )
    })

export const maintenanceYesFlow = addKeyword<any, any>('BUTTON_MAINTENANCE_YES')
    .addAction(async (ctx, { flowDynamic, extensions }) => {
        const { botStateService } = extensions
        await botStateService.enableMaintenanceMode()
        await flowDynamic('✅ Maintenance mode enabled')
    })
```

---

## Examples

### Live Demo Flow

Send `/buttons` to the bot to see a comprehensive interactive demo covering:

- Inline keyboards with various button types
- Reply keyboards with contact/location requests
- Dynamic button updates (counter example)
- Confirmation dialogs
- URL buttons, copy text buttons, and more

**Location:** `src/flows/examples/buttonExampleFlow.ts`

---

## Best Practices

### 1. Always Answer Callback Queries

The global handler automatically answers callback queries, but if you need custom notifications:

```typescript
await answerCallbackQuery(callbackQuery.id, utils, 'Processing...')
```

**Why?** Users see a loading spinner until the callback is answered.

### 2. Use Meaningful Callback Data

```typescript
// ✅ Good - descriptive and structured
createCallbackButton('View User', 'user_view:123456')
createCallbackButton('Delete Post', 'post_delete:789')

// ❌ Bad - unclear
createCallbackButton('OK', 'ok')
createCallbackButton('Action', 'a1')
```

### 3. Keep Callback Data Short

Max 64 bytes. Use IDs instead of full data:

```typescript
// ✅ Good - use ID
createCallbackButton('View Order', `order:${orderId}`)

// ❌ Bad - too much data
createCallbackButton('View Order', `order:${JSON.stringify(orderObject)}`)
```

### 4. Use Inline Keyboards for Actions

Inline keyboards stay with messages and work in groups.

```typescript
// ✅ Good for actions
await sendWithInlineButtons(ctx, utils, 'Confirm action?', [
    [createCallbackButton('Yes', 'confirm'), createCallbackButton('No', 'cancel')]
])
```

### 5. Use Reply Keyboards for Main Menus

Reply keyboards are good for primary navigation but hide after one use:

```typescript
await sendWithReplyButtons(ctx, utils, 'Main Menu:', [
    [createTextButton('Settings'), createTextButton('Help')]
], { oneTime: true, resize: true })
```

### 6. Provide Visual Feedback

Update buttons after actions to show state:

```typescript
// Before click: [Process]
// After click:  [✅ Processed]

await editButtonsOnly(ctx, utils, messageId, [
    [createCallbackButton('✅ Processed', 'noop')]
])
```

### 7. Handle Errors Gracefully

```typescript
export const myFlow = addKeyword<any, any>('BUTTON_MY_ACTION')
    .addAction(async (ctx, { flowDynamic }) => {
        try {
            await performAction()
            await flowDynamic('✅ Success!')
        } catch (error) {
            await flowDynamic('❌ An error occurred. Please try again.')
        }
    })
```

### 8. Test Button Layouts

- Max 8 buttons per row (Telegram recommends 2-3)
- Max 100 total buttons per keyboard
- Test on mobile and desktop

```typescript
// ✅ Good - 2-3 buttons per row
[
    [btn1, btn2],
    [btn3, btn4],
    [btn5]
]

// ⚠️ Avoid - too many per row
[
    [btn1, btn2, btn3, btn4, btn5, btn6]
]
```

---

## Troubleshooting

### Button Click Not Working

**Symptom:** Clicking button does nothing or shows loading spinner forever.

**Causes:**
1. No flow listening for the event
2. Flow not registered in `app.ts`
3. Callback data format incorrect

**Solution:**

```typescript
// 1. Create handler flow with correct event name
export const myFlow = addKeyword<any, any>('BUTTON_MY_ACTION')  // Must match callback data
    .addAction(async (ctx, { flowDynamic }) => {
        await flowDynamic('Button clicked!')
    })

// 2. Register in app.ts
import { myFlow } from '~/flows/myFlow'

const adapterFlow = createFlow([
    // ...
    myFlow,  // Add here
    // ...
])

// 3. Use correct callback data format
createCallbackButton('My Action', 'my_action')  // Dispatches BUTTON_MY_ACTION
```

### Callback Query Expired Error

**Symptom:** Error "query is too old and response timeout expired"

**Cause:** Callback queries expire after ~30 seconds.

**Solution:** Answer callback queries quickly. The global handler does this automatically, but avoid long-running operations before answering.

### Buttons Not Showing

**Symptom:** Message sent but no buttons appear.

**Causes:**
1. Empty button array
2. Invalid button configuration
3. Reply keyboard hidden

**Solution:**

```typescript
// Check button array
console.log(buttons)  // Should not be []

// Validate button config
const buttons = [
    [createCallbackButton('Valid', 'valid')]  // Must have text and data
]

// For reply keyboards, they might be hidden
await sendWithReplyButtons(ctx, utils, 'Text', buttons, {
    resize: true,  // Make visible
    persistent: true  // Keep visible
})
```

### Message Too Long Error

**Symptom:** Error "message is too long"

**Cause:** Telegram messages are limited to 4096 characters.

**Solution:** Split long messages or use pagination:

```typescript
if (message.length > 4000) {
    await flowDynamic(message.slice(0, 4000))
    await flowDynamic(message.slice(4000))
} else {
    await flowDynamic(message)
}
```

### Buttons Overlap on Mobile

**Symptom:** Buttons look cramped or overlap on mobile devices.

**Solution:** Limit buttons per row (2-3 recommended):

```typescript
// ✅ Good for mobile
[
    [btn1, btn2],
    [btn3, btn4]
]

// ❌ Bad for mobile
[
    [btn1, btn2, btn3, btn4, btn5]
]
```

### TypeScript Type Errors

**Symptom:** TypeScript complains about types in flow helpers.

**Solution:** Cast `utils` when using flow helpers:

```typescript
await sendWithInlineButtons(
    ctx,
    { flowDynamic } as any,  // Cast to any
    'Message',
    buttons
)
```

---

## Advanced Topics

### Custom Callback Query Handler

If you need to handle callback queries differently, you can access the Telegraf vendor directly:

```typescript
// In app.ts (already implemented)
adapterProvider.vendor.on('callback_query', async (callbackCtx) => {
    // Custom handling here
})
```

### Inline Queries vs Callback Queries

- **Callback Query** = User clicks inline button
- **Inline Query** = User types `@yourbot query` in any chat

Callback queries are handled automatically. For inline queries, see Telegraf documentation.

### Button Security

**Validate user permissions before actions:**

```typescript
export const deleteFlow = addKeyword<any, any>('BUTTON_DELETE')
    .addAction(async (ctx, { flowDynamic, extensions }) => {
        // Check admin
        const { adminCheck } = await import('~/middleware/adminCheck')
        if (!await adminCheck(ctx)) {
            await flowDynamic('⛔ Admin only')
            return
        }

        // Perform deletion
        await performDelete(ctx.body)
        await flowDynamic('✅ Deleted')
    })
```

**Don't trust callback data - always validate:**

```typescript
export const userFlow = addKeyword<any, any>('BUTTON_USER')
    .addAction(async (ctx, { flowDynamic }) => {
        const userId = ctx.body

        // Validate user ID format
        if (!/^\d+$/.test(userId)) {
            await flowDynamic('Invalid user ID')
            return
        }

        // Check user exists
        const user = await getUserById(userId)
        if (!user) {
            await flowDynamic('User not found')
            return
        }

        // Show user info
        await flowDynamic(`User: ${user.name}`)
    })
```

---

## Migration Guide

### From Numbered Menus to Buttons

**Before:**

```typescript
await flowDynamic([
    '📋 Quick Actions:',
    '1️⃣ Check Status',
    '2️⃣ View Help',
    '3️⃣ Contact Support',
    '',
    'Reply with a number to continue...'
])
```

**After:**

```typescript
await sendWithInlineButtons(
    ctx,
    { flowDynamic } as any,
    '📋 Quick Actions:',
    [
        [createCallbackButton('1️⃣ Check Status', 'action_status')],
        [createCallbackButton('2️⃣ View Help', 'action_help')],
        [createCallbackButton('3️⃣ Contact Support', 'action_support')]
    ]
)
```

**Benefits:**
- ✅ No parsing user input
- ✅ Faster user experience
- ✅ Works in any language
- ✅ Cleaner UI

---

## Resources

- **Telegram Bot API Docs:** https://core.telegram.org/bots/api
- **Telegraf.js Docs:** https://telegraf.js.org
- **BuilderBot Docs:** https://builderbot.vercel.app
- **Example Flow:** `/buttons` command in this bot

---

## Support

For questions or issues with buttons:

1. Check this guide first
2. Try the `/buttons` demo flow
3. Review `src/flows/examples/buttonExampleFlow.ts`
4. Check logs for errors: `logger.debug()`

**Common Log Locations:**
- Callback query events: `loggers.telegram.debug()` in app.ts:223
- Button sending: `logger.debug()` in flowHelpers.ts:231

---

## Changelog

### v1.0.0 (Current)
- Initial button system implementation
- Inline keyboard support
- Reply keyboard support
- Global callback query handler
- Button utilities and flow helpers
- Example flows and documentation
