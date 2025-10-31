/**
 * Media Service (v2)
 *
 * Consolidated service that merges:
 * - transcriptionService.ts
 * - imageAnalysisService.ts
 *
 * Handles:
 * - Voice note transcription (Whisper API)
 * - Image analysis (GPT-4 Vision)
 * - Media file management
 *
 * Benefits:
 * - Single service for all media operations
 * - Consistent error handling
 * - Shared configuration
 */

import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { env } from '~/config/env'
import { createFlowLogger } from '~/utils/logger'
import { createReadStream } from 'fs'
import { unlink } from 'fs/promises'

const mediaLogger = createFlowLogger('media-service')

/**
 * Transcription result
 */
export interface TranscriptionResult {
    text: string
    language?: string
    duration?: number
    transcriptionTimeMs: number
}

/**
 * Image analysis result
 */
export interface ImageAnalysisResult {
    description: string
    objects?: string[]
    text?: string
    sentiment?: 'positive' | 'negative' | 'neutral'
    analysisTimeMs: number
}

/**
 * Media Service
 *
 * Handles all media processing operations
 */
export class MediaService {
    private whisperModel = 'whisper-1'
    private visionModel = google('gemini-2.0-flash')

    constructor() {
        mediaLogger.info(
            { whisperModel: this.whisperModel, visionModel: 'gemini-2.0-flash' },
            'MediaService initialized with Gemini 2.0 Flash for vision'
        )
    }

    /**
     * Transcribe voice note using OpenAI Whisper
     *
     * @param audioPath - Path to audio file
     * @param options - Transcription options
     * @returns Transcription result
     */
    async transcribeVoiceNote(
        audioPath: string,
        options?: {
            language?: string
            prompt?: string
            temperature?: number
        }
    ): Promise<TranscriptionResult> {
        const startTime = Date.now()

        try {
            mediaLogger.debug({ audioPath, options }, 'Starting voice transcription')

            // Create form data for OpenAI API
            const formData = new FormData()
            const audioFile = await fetch(audioPath).then((r) => r.blob())
            formData.append('file', audioFile, 'audio.ogg')
            formData.append('model', this.whisperModel)

            if (options?.language) {
                formData.append('language', options.language)
            }
            if (options?.prompt) {
                formData.append('prompt', options.prompt)
            }
            if (options?.temperature) {
                formData.append('temperature', options.temperature.toString())
            }

            // Call OpenAI Whisper API
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: formData,
            })

            if (!response.ok) {
                throw new Error(`Transcription failed: ${response.statusText}`)
            }

            const result = await response.json()
            const transcriptionTimeMs = Date.now() - startTime

            mediaLogger.info(
                {
                    audioPath,
                    textLength: result.text.length,
                    language: result.language,
                    duration: result.duration,
                    transcriptionTimeMs,
                },
                'Voice transcription completed'
            )

            return {
                text: result.text,
                language: result.language,
                duration: result.duration,
                transcriptionTimeMs,
            }
        } catch (error) {
            mediaLogger.error({ err: error, audioPath }, 'Voice transcription failed')
            throw error
        }
    }

    /**
     * Analyze image using GPT-4 Vision
     *
     * @param imageUrl - URL or path to image
     * @param prompt - Analysis prompt
     * @returns Image analysis result
     */
    async analyzeImage(
        imageUrl: string,
        prompt: string = 'Describe this image in detail. What objects do you see? Is there any text?'
    ): Promise<ImageAnalysisResult> {
        const startTime = Date.now()

        try {
            mediaLogger.debug({ imageUrl, prompt }, 'Starting image analysis')

            const result = await generateText({
                model: this.visionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image', image: imageUrl },
                        ],
                    },
                ],
                maxOutputTokens: 500, // AI SDK v5: Replace maxTokens with maxOutputTokens
            })

            const analysisTimeMs = Date.now() - startTime

            mediaLogger.info(
                {
                    imageUrl,
                    descriptionLength: result.text.length,
                    analysisTimeMs,
                    tokensUsed: result.usage?.totalTokens,
                },
                'Image analysis completed'
            )

            return {
                description: result.text,
                analysisTimeMs,
            }
        } catch (error) {
            mediaLogger.error({ err: error, imageUrl }, 'Image analysis failed')
            throw error
        }
    }

    /**
     * Analyze image with structured output using AI SDK v5 experimental_output
     *
     * @param imageUrl - URL or path to image
     * @returns Structured image analysis with guaranteed schema validation
     */
    async analyzeImageStructured(imageUrl: string): Promise<{
        description: string
        objects: string[]
        text: string
        sentiment: 'positive' | 'negative' | 'neutral'
        analysisTimeMs: number
    }> {
        const startTime = Date.now()

        try {
            // Define zod schema for structured output
            const imageAnalysisSchema = z.object({
                description: z.string().describe('Detailed description of the image'),
                objects: z.array(z.string()).describe('List of objects visible in the image'),
                text: z.string().describe('Any text visible in the image (empty string if none)'),
                sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment of the image'),
            })

            const result = await generateText({
                model: this.visionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this image and provide a detailed description, list all objects you see, extract any visible text, and determine the overall sentiment.',
                            },
                            { type: 'image', image: imageUrl },
                        ],
                    },
                ],
                maxOutputTokens: 1000,
                // AI SDK v5: Use experimental_output for guaranteed structured generation
                experimental_output: Output.object({
                    schema: imageAnalysisSchema,
                }),
            })

            const analysisTimeMs = Date.now() - startTime

            // AI SDK v5 guarantees type-safe output matching schema
            const output = result.experimental_output as z.infer<typeof imageAnalysisSchema>

            mediaLogger.info(
                {
                    imageUrl,
                    objectsFound: output.objects.length,
                    hasText: output.text.length > 0,
                    sentiment: output.sentiment,
                    analysisTimeMs,
                    tokensUsed: result.usage?.totalTokens,
                },
                'Structured image analysis completed (AI SDK v5)'
            )

            return {
                description: output.description,
                objects: output.objects,
                text: output.text,
                sentiment: output.sentiment,
                analysisTimeMs,
            }
        } catch (error) {
            mediaLogger.error({ err: error, imageUrl }, 'Structured image analysis failed')
            throw error
        }
    }

    /**
     * Extract text from image (OCR)
     *
     * @param imageUrl - URL or path to image
     * @returns Extracted text
     */
    async extractTextFromImage(imageUrl: string): Promise<{ text: string; confidence?: number }> {
        try {
            mediaLogger.debug({ imageUrl }, 'Extracting text from image')

            const result = await generateText({
                model: this.visionModel,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Extract all text from this image. Return ONLY the text, nothing else.',
                            },
                            { type: 'image', image: imageUrl },
                        ],
                    },
                ],
                maxOutputTokens: 1000, // AI SDK v5: Replace maxTokens with maxOutputTokens
            })

            mediaLogger.info({ imageUrl, textLength: result.text.length }, 'Text extraction completed')

            return {
                text: result.text.trim(),
            }
        } catch (error) {
            mediaLogger.error({ err: error, imageUrl }, 'Text extraction failed')
            throw error
        }
    }

    /**
     * Delete temporary media file
     *
     * @param filePath - Path to file
     */
    async deleteMediaFile(filePath: string): Promise<void> {
        try {
            await unlink(filePath)
            mediaLogger.debug({ filePath }, 'Media file deleted')
        } catch (error) {
            mediaLogger.error({ err: error, filePath }, 'Failed to delete media file')
            // Don't throw - cleanup failures shouldn't break the flow
        }
    }

    /**
     * Get supported audio formats
     */
    getSupportedAudioFormats(): string[] {
        return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg']
    }

    /**
     * Get supported image formats
     */
    getSupportedImageFormats(): string[] {
        return ['jpg', 'jpeg', 'png', 'gif', 'webp']
    }

    /**
     * Check if audio format is supported
     */
    isAudioFormatSupported(format: string): boolean {
        return this.getSupportedAudioFormats().includes(format.toLowerCase())
    }

    /**
     * Check if image format is supported
     */
    isImageFormatSupported(format: string): boolean {
        return this.getSupportedImageFormats().includes(format.toLowerCase())
    }
}

/**
 * Singleton instance
 */
export const mediaService = new MediaService()
