import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'
import { readFile, stat } from 'fs/promises'
import path from 'path'

export class TranscriptionService {
    /**
     * Supported audio formats for transcription
     */
    private readonly SUPPORTED_FORMATS = ['.ogg', '.m4a', '.mp3', '.wav', '.webm']
    private readonly MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB (Telegram limit is 20MB, adding buffer)

    /**
     * Validate audio file before transcription
     */
    private async validateAudioFile(filePath: string): Promise<{ size: number; extension: string }> {
        try {
            // Check if file exists
            const stats = await stat(filePath)
            if (stats.size === 0) {
                throw new Error('Audio file is empty')
            }

            // Check file size
            if (stats.size > this.MAX_FILE_SIZE) {
                throw new Error(`Audio file too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: 25MB)`)
            }

            // Check file extension
            const ext = path.extname(filePath).toLowerCase()
            if (!this.SUPPORTED_FORMATS.includes(ext)) {
                throw new Error(`Unsupported audio format: ${ext}. Supported formats: ${this.SUPPORTED_FORMATS.join(', ')}`)
            }

            return { size: stats.size, extension: ext }
        } catch (error) {
            if (error instanceof Error) {
                throw error
            }
            throw new Error(`Failed to validate audio file: ${String(error)}`)
        }
    }

    /**
     * Transcribe audio file using AI SDK with OpenAI Whisper
     * Uses whisper-1 model ($0.003/min)
     */
    async transcribeAudio(filePath: string): Promise<string> {
        try {
            console.log(`🎤 Starting audio transcription for: ${filePath}`)

            // Validate audio file before processing
            const validation = await this.validateAudioFile(filePath)
            console.log(`📋 File validation passed: size=${(validation.size / 1024).toFixed(1)}KB, format=${validation.extension}`)

            // Read audio file as buffer
            console.log(`📖 Reading audio file...`)
            const audioBuffer = await readFile(filePath)
            console.log(`✅ Audio file read successfully: ${audioBuffer.length} bytes`)

            // Validate buffer is not empty
            if (audioBuffer.length === 0) {
                throw new Error('Audio buffer is empty after reading file')
            }

            console.log(`🔄 Calling OpenAI Whisper API...`)

            // Call Whisper API via AI SDK
            const result = await transcribe({
                model: openai.transcription('whisper-1'),
                audio: audioBuffer,
                providerOptions: {
                    openai: {
                        language: 'en', // Can be made dynamic based on personality settings
                    },
                },
            })

            if (!result.text || result.text.trim().length === 0) {
                console.warn('⚠️ Transcription returned empty text')
                return '[No speech detected or audio was unclear]'
            }

            console.log(`✅ Transcription completed successfully: ${result.text.substring(0, 100)}...`)
            console.log(`📊 Transcription stats: ${result.text.length} characters, language: ${result.language || 'auto-detected'}`)

            return result.text
        } catch (error) {
            console.error('❌ Error transcribing audio:', error)

            // Enhanced error handling for specific error types
            if (error instanceof Error) {
                const errorMsg = error.message.toLowerCase()

                if (errorMsg.includes('openai') || errorMsg.includes('api') || errorMsg.includes('authentication')) {
                    throw new Error(`OpenAI API Error: ${error.message}. Please check API key and service availability.`)
                } else if (errorMsg.includes('file') || errorMsg.includes('read') || errorMsg.includes('access')) {
                    throw new Error(`File Access Error: ${error.message}`)
                } else if (errorMsg.includes('format') || errorMsg.includes('unsupported') || errorMsg.includes('extension')) {
                    throw new Error(`Audio Format Error: ${error.message}`)
                } else if (errorMsg.includes('size') || errorMsg.includes('large') || errorMsg.includes('limit')) {
                    throw new Error(`File Size Error: ${error.message}`)
                } else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connection')) {
                    throw new Error(`Network Error: ${error.message}. Please check internet connection and try again.`)
                } else if (errorMsg.includes('empty') || errorMsg.includes('invalid')) {
                    throw new Error(`Invalid Audio: ${error.message}`)
                }
            }

            throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * Transcribe audio with detailed response including language detection and duration
     */
    async transcribeAudioDetailed(
        filePath: string
    ): Promise<{ text: string; language?: string; duration?: number }> {
        try {
            console.log(`🎤 Transcribing audio file (detailed): ${filePath}`)

            const audioBuffer = await readFile(filePath)

            const result = await transcribe({
                model: openai.transcription('whisper-1'),
                audio: audioBuffer,
            })

            console.log(
                `✅ Transcription complete${result.language ? ` (${result.language})` : ''}: ${result.text.substring(0, 100)}...`
            )

            return {
                text: result.text,
                language: result.language,
                duration: result.durationInSeconds,
            }
        } catch (error) {
            console.error('❌ Error transcribing audio:', error)
            throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`)
        }
    }
}

// Export singleton instance
export const transcriptionService = new TranscriptionService()
