/**
 * JSON Utilities
 *
 * Helper functions for JSON operations including circular reference handling,
 * safe parsing, and formatting
 */

/**
 * Get a replacer function that handles circular references in JSON.stringify
 *
 * This prevents "Converting circular structure to JSON" errors when
 * stringifying objects with circular references.
 *
 * @returns Replacer function for JSON.stringify
 *
 * @example
 * ```ts
 * const obj = { a: 1 }
 * obj.self = obj // circular reference
 *
 * JSON.stringify(obj, getCircularReplacer())
 * // Output: {"a":1,"self":"[Circular Reference]"}
 * ```
 */
export function getCircularReplacer(): (key: any, value: any) => any {
    const seen = new WeakSet()
    return (key: any, value: any) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular Reference]'
            }
            seen.add(value)
        }
        return value
    }
}

/**
 * Safely stringify JSON with circular reference handling
 *
 * @param obj - Object to stringify
 * @param space - Number of spaces for indentation (optional)
 * @returns JSON string
 *
 * @example
 * ```ts
 * const obj = { a: 1, b: { c: 2 } }
 * obj.b.parent = obj // circular reference
 *
 * const json = safeStringify(obj, 2)
 * ```
 */
export function safeStringify(obj: any, space?: number): string {
    try {
        return JSON.stringify(obj, getCircularReplacer(), space)
    } catch (error) {
        return JSON.stringify({ error: 'Failed to stringify object', message: String(error) })
    }
}

/**
 * Safely parse JSON with error handling
 *
 * @param json - JSON string to parse
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed object or default value
 *
 * @example
 * ```ts
 * const data = safeParse('{"name":"John"}', {})
 * const invalid = safeParse('invalid json', { default: true })
 * ```
 */
export function safeParse<T = any>(json: string, defaultValue: T): T {
    try {
        return JSON.parse(json)
    } catch (error) {
        return defaultValue
    }
}

/**
 * Deep clone an object using JSON serialization
 *
 * Note: This method has limitations:
 * - Functions are not cloned
 * - Dates become strings
 * - undefined values are removed
 * - Circular references are replaced with "[Circular Reference]"
 *
 * For complex objects with functions or special types, consider using
 * structuredClone() or a deep clone library.
 *
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(safeStringify(obj))
}

/**
 * Check if a string is valid JSON
 *
 * @param str - String to validate
 * @returns true if valid JSON, false otherwise
 */
export function isValidJSON(str: string): boolean {
    try {
        JSON.parse(str)
        return true
    } catch (error) {
        return false
    }
}

/**
 * Pretty print JSON with syntax highlighting for console
 *
 * @param obj - Object to print
 * @param indent - Number of spaces for indentation (default: 2)
 */
export function prettyPrint(obj: any, indent = 2): void {
    console.log(safeStringify(obj, indent))
}

/**
 * Merge multiple objects deeply
 *
 * Later objects override earlier ones. Arrays are replaced, not merged.
 *
 * @param objects - Objects to merge
 * @returns Merged object
 */
export function deepMerge<T extends Record<string, any>>(...objects: Partial<T>[]): T {
    const result: any = {}

    for (const obj of objects) {
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key]

                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    result[key] = deepMerge(result[key] || {}, value)
                } else {
                    result[key] = value
                }
            }
        }
    }

    return result as T
}
