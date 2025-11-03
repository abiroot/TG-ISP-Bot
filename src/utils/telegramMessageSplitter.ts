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

    // Build sections in exact order specified
    // Order: header, userDetails, accountStatus, networkDetails, stationInfo,
    //        accessPointInfo, apUsers, billing, collector, timeline, sessionHistory, pingDiagnostics
    const orderedSections = [
        sections.header,
        sections.userDetails,
        sections.accountStatus,
        sections.networkDetails,
        sections.stationInfo,
        sections.accessPointInfo,
        sections.apUsers,
        sections.billing,
        sections.collector,
        sections.timeline,
        sections.sessionHistory,
        sections.pingDiagnostics,
    ]
        .filter(Boolean)
        .join('\n\n')

    // Split the full message if it exceeds Telegram's limit
    if (orderedSections.trim()) {
        messages.push(...splitLongMessage(orderedSections))
    }

    return messages
}
