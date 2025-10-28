import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'
import { readFile } from 'fs/promises'

export class TranscriptionService {
    /**
     * Transcribe audio file using AI SDK with OpenAI Whisper
     * Uses whisper-1 model ($0.003/min)
     */
    async transcribeAudio(filePath: string): Promise<string> {
        try {
            console.log(`🎤 Transcribing audio file: ${filePath}`)

            // Read audio file as buffer
            const audioBuffer = await readFile(filePath)
    

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

            console.log(`✅ Transcription complete: ${result.text.substring(0, 100)}...`)
         

            return result.text
        } catch (error) {
            console.error('❌ Error transcribing audio:', error)
            throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`)
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
