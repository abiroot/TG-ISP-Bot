/**
 * Telegram Message Splitter Utility
 *
 * Splits long messages into chunks that fit within Telegram's 4096 character limit
 * while preserving HTML formatting and semantic boundaries.
 */

/**
 * Maximum message length for Telegram
 * Using 4000 as safe limit to account for formatting overhead
 */
const TELEGRAM_MAX_LENGTH = 4000

/**
 * Split a long message into multiple messages at semantic boundaries
 *
 * @param message - The message to split
 * @param maxLength - Maximum length per message (default: 4000)
 * @returns Array of message chunks
 */
export function splitLongMessage(
    message: string,
    maxLength: number = TELEGRAM_MAX_LENGTH
): string[] {
    // If message fits within limit, return as-is
    if (message.length <= maxLength) {
        return [message]
    }

    const chunks: string[] = []
    const lines = message.split('\n')
    let currentChunk = ''

    for (const line of lines) {
        const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line

        // If adding this line exceeds the limit, save current chunk and start new one
        if (potentialChunk.length > maxLength) {
            // Save current chunk if it has content
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim())
            }

            // If single line is too long, split it at word boundaries
            if (line.length > maxLength) {
                const wordChunks = splitLongLine(line, maxLength)
                chunks.push(...wordChunks.slice(0, -1))
                currentChunk = wordChunks[wordChunks.length - 1]
            } else {
                currentChunk = line
            }
        } else {
            currentChunk = potentialChunk
        }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
    }

    return chunks
}

/**
 * Split a single long line into chunks at word boundaries
 *
 * @param line - The line to split
 * @param maxLength - Maximum length per chunk
 * @returns Array of line chunks
 */
function splitLongLine(line: string, maxLength: number): string[] {
    const chunks: string[] = []
    let currentChunk = ''

    // Try to split at word boundaries
    const words = line.split(' ')

    for (const word of words) {
        const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + word

        if (potentialChunk.length > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk)
            }

            // If single word is too long, force split
            if (word.length > maxLength) {
                const forceSplit = word.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [word]
                chunks.push(...forceSplit.slice(0, -1))
                currentChunk = forceSplit[forceSplit.length - 1]
            } else {
                currentChunk = word
            }
        } else {
            currentChunk = potentialChunk
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk)
    }

    return chunks
}

/**
 * Split ISP customer information into logical message sections
 *
 * @param sections - Object containing different information sections
 * @returns Array of formatted messages ready to send
 */
export interface ISPMessageSections {
    header?: string
    userDetails?: string
    accountMetadata?: string
    accountStatus?: string
    networkDetails?: string
    stationInfo?: string
    accessPointInfo?: string
    apUsers?: string
    billing?: string
    collector?: string
    timeline?: string
    sessionHistory?: string
    pingDiagnostics?: string
}

export function splitISPMessage(sections: ISPMessageSections): string[] {
    const messages: string[] = []

    // Message 1: Essential User & Account Information
    const essentialInfo = [
        sections.header,
        sections.userDetails,
        sections.accountMetadata,
        sections.accountStatus,
        sections.billing,
    ]
        .filter(Boolean)
        .join('\n\n')

    if (essentialInfo.trim()) {
        messages.push(...splitLongMessage(essentialInfo))
    }

    // Message 2: Network & Infrastructure Information
    const networkInfo = [
        sections.networkDetails,
        sections.stationInfo,
        sections.accessPointInfo,
    ]
        .filter(Boolean)
        .join('\n\n')

    if (networkInfo.trim()) {
        messages.push(...splitLongMessage(networkInfo))
    }

    // Message 3: Activity & Users
    const activityInfo = [sections.collector, sections.timeline, sections.apUsers, sections.sessionHistory]
        .filter(Boolean)
        .join('\n\n')

    if (activityInfo.trim()) {
        messages.push(...splitLongMessage(activityInfo))
    }

    // Message 4: Diagnostics (often the longest section)
    if (sections.pingDiagnostics?.trim()) {
        messages.push(...splitLongMessage(sections.pingDiagnostics))
    }

    return messages
}
