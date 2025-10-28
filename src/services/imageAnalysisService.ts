import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import fs from 'fs'

// Define structured output schema for image analysis
const imageAnalysisSchema = z.object({
    description: z.string().describe('Overall description of the image'),
    objects: z.array(z.string()).describe('List of main objects or items detected in the image'),
    text: z.string().optional().describe('Any text found in the image (OCR)'),
    isNetworkDiagram: z.boolean().describe('Whether this appears to be a network diagram or setup'),
    networkData: z
        .object({
            diagramType: z.string().optional().describe('Type of network diagram (e.g., topology, setup, configuration)'),
            equipment: z.array(z.string()).optional().describe('List of network equipment visible'),
            ipAddresses: z.array(z.string()).optional().describe('IP addresses found in the image'),
            connectionTypes: z.array(z.string()).optional().describe('Types of connections shown'),
            labels: z.array(z.string()).optional().describe('Text labels on network components'),
        })
        .optional()
        .describe('Extracted network data if this is a network diagram'),
    isErrorMessage: z.boolean().describe('Whether this appears to be an error message or screenshot'),
    errorData: z
        .object({
            errorType: z.string().optional().describe('Type of error (e.g., connection, authentication, configuration)'),
            errorCode: z.string().optional().describe('Error code or number if present'),
            deviceInfo: z.string().optional().describe('Device or application information shown'),
            timestamp: z.string().optional().describe('Timestamp from the error message'),
        })
        .optional()
        .describe('Extracted error data if this is an error message'),
    category: z
        .enum(['network_diagram', 'error_message', 'document', 'equipment', 'setup', 'bill', 'other'])
        .describe('General category of the image'),
    confidence: z.number().min(0).max(1).describe('Confidence level of the analysis (0-1)'),
})

export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>

export class ImageAnalysisService {
    private model = openai('gpt-4o-mini') // Cost-effective vision model

    /**
     * Analyze an image using GPT-4o-mini vision with structured output
     * @param imagePath Local path to the image file
     * @returns Structured analysis of the image
     */
    async analyzeImage(imagePath: string): Promise<ImageAnalysis> {
        try {
            console.log(`📸 Analyzing image: ${imagePath}`)

            // Read image file as base64
            const imageBuffer = fs.readFileSync(imagePath)
            const base64Image = imageBuffer.toString('base64')

            // Determine media type from file extension
            const extension = imagePath.split('.').pop()?.toLowerCase()
            const mediaType = this.getMediaType(extension || '')

            // Use generateObject for structured output with explicit JSON mode
            const { object } = await generateObject({
                model: this.model,
                schema: imageAnalysisSchema,
                mode: 'json',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analyze this image and return a JSON object with the following fields:
- description: Overall description of what you see
- objects: Array of main objects or items detected
- text: Any text visible in the image (OCR), or empty string if none
- isNetworkDiagram: true if this is a network diagram/setup, false otherwise
- networkData: If network diagram, extract diagramType, equipment array, ipAddresses array, connectionTypes array, labels array
- isErrorMessage: true if this shows an error message/screenshot, false otherwise
- errorData: If error message, extract errorType, errorCode, deviceInfo, timestamp
- category: one of: network_diagram, error_message, document, equipment, setup, bill, other
- confidence: your confidence level from 0 to 1

Be precise and thorough. Focus on ISP-related content like network equipment, error messages, bills, or technical documentation.`,
                            },
                            {
                                type: 'image',
                                image: `data:${mediaType};base64,${base64Image}`,
                            },
                        ],
                    },
                ],
                maxOutputTokens: 1000,
            })

            console.log(`✅ Image analysis complete (${object.category}, confidence: ${object.confidence})`)

            return object
        } catch (error) {
            console.error('❌ Error analyzing image:', error)
            throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Analyze image from URL
     * @param imageUrl Public URL to the image
     * @returns Structured analysis of the image
     */
    async analyzeImageFromUrl(imageUrl: string): Promise<ImageAnalysis> {
        try {
            console.log(`📸 Analyzing image from URL: ${imageUrl}`)

            const { object } = await generateObject({
                model: this.model,
                schema: imageAnalysisSchema,
                mode: 'json',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analyze this image and return a JSON object with the following fields:
- description: Overall description of what you see
- objects: Array of main objects or items detected
- text: Any text visible in the image (OCR), or empty string if none
- isNetworkDiagram: true if this is a network diagram/setup, false otherwise
- networkData: If network diagram, extract diagramType, equipment array, ipAddresses array, connectionTypes array, labels array
- isErrorMessage: true if this shows an error message/screenshot, false otherwise
- errorData: If error message, extract errorType, errorCode, deviceInfo, timestamp
- category: one of: network_diagram, error_message, document, equipment, setup, bill, other
- confidence: your confidence level from 0 to 1

Be precise and thorough. Focus on ISP-related content like network equipment, error messages, bills, or technical documentation.`,
                            },
                            {
                                type: 'image',
                                image: imageUrl,
                            },
                        ],
                    },
                ],
                maxOutputTokens: 1000,
            })

            console.log(`✅ Image analysis complete (${object.category}, confidence: ${object.confidence})`)

            return object
        } catch (error) {
            console.error('❌ Error analyzing image from URL:', error)
            throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Get media type from file extension
     */
    private getMediaType(extension: string): string {
        const mediaTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
        }

        return mediaTypes[extension] || 'image/jpeg'
    }

    /**
     * Format analysis for user-friendly display
     */
    formatAnalysis(analysis: ImageAnalysis): string {
        let message = `📸 *Image Analysis*\n\n`
        message += `📝 ${analysis.description}\n\n`

        if (analysis.objects.length > 0) {
            message += `🔍 *Detected objects:* ${analysis.objects.join(', ')}\n\n`
        }

        if (analysis.text) {
            message += `📄 *Text found:* "${analysis.text}"\n\n`
        }

        if (analysis.isNetworkDiagram && analysis.networkData) {
            message += `🌐 *Network Diagram Detected!*\n`
            if (analysis.networkData.diagramType) {
                message += `   Type: ${analysis.networkData.diagramType}\n`
            }
            if (analysis.networkData.equipment && analysis.networkData.equipment.length > 0) {
                message += `   Equipment: ${analysis.networkData.equipment.join(', ')}\n`
            }
            if (analysis.networkData.ipAddresses && analysis.networkData.ipAddresses.length > 0) {
                message += `   IP Addresses: ${analysis.networkData.ipAddresses.join(', ')}\n`
            }
            if (analysis.networkData.connectionTypes && analysis.networkData.connectionTypes.length > 0) {
                message += `   Connections: ${analysis.networkData.connectionTypes.join(', ')}\n`
            }
        }

        if (analysis.isErrorMessage && analysis.errorData) {
            message += `❌ *Error Message Detected!*\n`
            if (analysis.errorData.errorType) {
                message += `   Error Type: ${analysis.errorData.errorType}\n`
            }
            if (analysis.errorData.errorCode) {
                message += `   Error Code: ${analysis.errorData.errorCode}\n`
            }
            if (analysis.errorData.deviceInfo) {
                message += `   Device: ${analysis.errorData.deviceInfo}\n`
            }
            if (analysis.errorData.timestamp) {
                message += `   Time: ${analysis.errorData.timestamp}\n`
            }
            message += `\n💡 Would you like me to help troubleshoot this error?`
        }

        message += `\n📊 Category: ${analysis.category}`
        message += `\n✅ Confidence: ${Math.round(analysis.confidence * 100)}%`

        return message
    }
}

// Export singleton instance
export const imageAnalysisService = new ImageAnalysisService()
