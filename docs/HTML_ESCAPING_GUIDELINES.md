# HTML Escaping Guidelines

## Overview

This bot uses Telegram's HTML parse mode for message formatting. All user-generated content MUST be escaped to prevent:
- XSS vulnerabilities
- Message rendering issues
- Telegram API errors

## Escaping Utility

**Location:** `src/utils/telegramFormatting.ts`

### Available Functions

#### 1. `escapeHtml(text: string): string`
Basic HTML escaping for user-generated content.

```typescript
import { escapeHtml } from '~/utils/telegramFormatting'

const userInput = "<script>alert('xss')</script>"
const safe = escapeHtml(userInput) // "&lt;script&gt;alert('xss')&lt;/script&gt;"
```

#### 2. `html` object - Convenience helpers

All helpers automatically escape input:

```typescript
import { html } from '~/utils/telegramFormatting'

// Bold
html.bold("User's Name")  // <b>User's Name</b>

// Italic
html.italic("emphasis")   // <i>emphasis</i>

// Code
html.code("192.168.1.1")  // <code>192.168.1.1</code>

// Link
html.link("Click here", "https://example.com")  // <a href="...">Click here</a>

// Just escape
html.escape("<dangerous>")  // &lt;dangerous&gt;
```

## When to Escape

### ✅ ALWAYS Escape

1. **User Input**
   - Names, usernames, phone numbers
   - Addresses, comments, notes
   - Any text from BuilderBot ctx (ctx.body, ctx.name, etc.)

2. **Database Data**
   - ISP API responses (usernames, addresses, etc.)
   - Stored messages and personality data
   - Any data that could contain user input

3. **Dynamic Data**
   - Timestamps, formatted dates
   - Generated IDs or codes
   - API responses from external services

### ❌ NEVER Escape

1. **Static HTML Templates**
   - Your own HTML tags (`<b>`, `<code>`, etc.)
   - Emoji (✅ 🟢 🔴 etc.)
   - Static text you control

2. **Already Escaped Data**
   - Don't double-escape (escaping twice breaks formatting)

## Examples

### ❌ BAD (Vulnerable to XSS)

```typescript
// Direct interpolation without escaping
const message = `<b>User:</b> ${userInfo.userName}`

// Using HTML tags on unescaped user data
await flowDynamic(`<code>${ctx.body}</code>`)

// Concatenating user input directly
const text = "<b>Phone:</b> " + userPhone
```

### ✅ GOOD (Secure)

```typescript
import { html } from '~/utils/telegramFormatting'

// Using html helpers (auto-escapes)
const message = `<b>User:</b> ${html.escape(userInfo.userName)}`

// Safe code blocks
await flowDynamic(html.code(ctx.body))

// Using helper wrapper function
const formatUserInfo = (name: string, phone: string) => {
    return `
👤 ${html.bold('User Details')}
- Name: ${html.escape(name)}
- Phone: ${html.code(phone)}
`.trim()
}
```

## Current Implementation Status

### ✅ Properly Escaped

- **ISPService.formatUserInfo()** - Uses local `esc()` helper that calls `html.escape()`
- **All numeric/boolean values** - No escaping needed (not strings)

### ⚠️ Needs Review

When adding new flows or services:
1. Import `html` from `~/utils/telegramFormatting`
2. Use `html.escape()` for all user-generated content
3. Use helper methods (`html.bold()`, `html.code()`, etc.) when applying formatting

## Testing Checklist

When adding new message formatting:

- [ ] All user input is escaped
- [ ] Database values are escaped
- [ ] API responses are escaped
- [ ] Static HTML tags are NOT escaped
- [ ] No double-escaping
- [ ] Test with: `<script>alert('test')</script>`
- [ ] Test with: Special chars `&`, `<`, `>`, `"`, `'`

## Migration Guide

If you find unescaped user data:

### Before
```typescript
await flowDynamic(`User: ${ctx.name}`)
```

### After
```typescript
import { html } from '~/utils/telegramFormatting'

await flowDynamic(`User: ${html.escape(ctx.name)}`)
```

## References

- [Telegram Bot API - Formatting Options](https://core.telegram.org/bots/api#formatting-options)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
