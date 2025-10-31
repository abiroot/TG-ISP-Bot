/**
 * Media Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MediaService } from '~/services/v2/MediaService'

// Mock AI SDK
vi.mock('ai', () => ({
    generateText: vi.fn().mockResolvedValue({
        text: 'Image description: A beautiful landscape',
        usage: { totalTokens: 100 },
    }),
}))

// Mock fetch globally
global.fetch = vi.fn()

describe('MediaService', () => {
    let mediaService: MediaService

    beforeEach(() => {
        mediaService = new MediaService()
        vi.clearAllMocks()
    })

    describe('Voice Transcription', () => {
        it('should transcribe voice note', async () => {
            vi.mocked(fetch).mockResolvedValueOnce({
                blob: async () => new Blob(),
            } as Response)

            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    text: 'This is a transcription',
                    language: 'en',
                    duration: 5.2,
                }),
            } as Response)

            const result = await mediaService.transcribeVoiceNote('https://example.com/audio.ogg')

            expect(result).toBeDefined()
            expect(result.text).toBe('This is a transcription')
            expect(result.language).toBe('en')
            expect(result.transcriptionTimeMs).toBeGreaterThan(0)
        })

        it('should handle transcription with custom options', async () => {
            vi.mocked(fetch).mockResolvedValueOnce({
                blob: async () => new Blob(),
            } as Response)

            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    text: 'Custom transcription',
                    language: 'es',
                }),
            } as Response)

            const result = await mediaService.transcribeVoiceNote('https://example.com/audio.ogg', {
                language: 'es',
                prompt: 'Medical terminology',
                temperature: 0.2,
            })

            expect(result.text).toBe('Custom transcription')
            expect(result.language).toBe('es')
        })

        it('should throw error on transcription failure', async () => {
            vi.mocked(fetch).mockResolvedValueOnce({
                blob: async () => new Blob(),
            } as Response)

            vi.mocked(fetch).mockResolvedValueOnce({
                ok: false,
                statusText: 'Bad Request',
            } as Response)

            await expect(
                mediaService.transcribeVoiceNote('https://example.com/audio.ogg')
            ).rejects.toThrow('Transcription failed')
        })
    })

    describe('Image Analysis', () => {
        it('should analyze image', async () => {
            const result = await mediaService.analyzeImage('https://example.com/image.jpg')

            expect(result).toBeDefined()
            expect(result.description).toBeDefined()
            expect(result.analysisTimeMs).toBeGreaterThan(0)
        })

        it('should analyze image with custom prompt', async () => {
            const result = await mediaService.analyzeImage(
                'https://example.com/image.jpg',
                'Identify all objects and their colors'
            )

            expect(result.description).toBeDefined()
        })

        it('should analyze image with structured output', async () => {
            const { generateText } = await import('ai')
            vi.mocked(generateText).mockResolvedValueOnce({
                text: JSON.stringify({
                    description: 'A landscape',
                    objects: ['tree', 'mountain', 'sky'],
                    text: 'No text visible',
                    sentiment: 'positive',
                }),
                usage: { totalTokens: 150 },
            } as any)

            const result = await mediaService.analyzeImageStructured('https://example.com/image.jpg')

            expect(result.description).toBeDefined()
            expect(Array.isArray(result.objects)).toBe(true)
            expect(result.sentiment).toBeDefined()
        })

        it('should handle malformed JSON in structured analysis', async () => {
            const { generateText } = await import('ai')
            vi.mocked(generateText).mockResolvedValueOnce({
                text: 'Not valid JSON response',
                usage: { totalTokens: 50 },
            } as any)

            const result = await mediaService.analyzeImageStructured('https://example.com/image.jpg')

            expect(result.description).toBe('Not valid JSON response')
            expect(result.objects).toEqual([])
            expect(result.sentiment).toBe('neutral')
        })
    })

    describe('Text Extraction (OCR)', () => {
        it('should extract text from image', async () => {
            const { generateText } = await import('ai')
            vi.mocked(generateText).mockResolvedValueOnce({
                text: 'Extracted text from image',
                usage: { totalTokens: 80 },
            } as any)

            const result = await mediaService.extractTextFromImage('https://example.com/image.jpg')

            expect(result.text).toBe('Extracted text from image')
        })

        it('should trim extracted text', async () => {
            const { generateText } = await import('ai')
            vi.mocked(generateText).mockResolvedValueOnce({
                text: '  Text with spaces  ',
                usage: { totalTokens: 30 },
            } as any)

            const result = await mediaService.extractTextFromImage('https://example.com/image.jpg')

            expect(result.text).toBe('Text with spaces')
        })
    })

    describe('Format Support', () => {
        it('should return supported audio formats', () => {
            const formats = mediaService.getSupportedAudioFormats()

            expect(Array.isArray(formats)).toBe(true)
            expect(formats).toContain('mp3')
            expect(formats).toContain('wav')
            expect(formats).toContain('ogg')
        })

        it('should return supported image formats', () => {
            const formats = mediaService.getSupportedImageFormats()

            expect(Array.isArray(formats)).toBe(true)
            expect(formats).toContain('jpg')
            expect(formats).toContain('png')
            expect(formats).toContain('webp')
        })

        it('should check if audio format is supported', () => {
            expect(mediaService.isAudioFormatSupported('mp3')).toBe(true)
            expect(mediaService.isAudioFormatSupported('MP3')).toBe(true)
            expect(mediaService.isAudioFormatSupported('xyz')).toBe(false)
        })

        it('should check if image format is supported', () => {
            expect(mediaService.isImageFormatSupported('jpg')).toBe(true)
            expect(mediaService.isImageFormatSupported('PNG')).toBe(true)
            expect(mediaService.isImageFormatSupported('xyz')).toBe(false)
        })
    })

    describe('File Management', () => {
        it('should delete media file', async () => {
            // deleteMediaFile should not throw
            await expect(mediaService.deleteMediaFile('/tmp/test.jpg')).resolves.not.toThrow()
        })

        it('should handle file deletion errors gracefully', async () => {
            // Should not throw even if file doesn't exist
            await expect(mediaService.deleteMediaFile('/nonexistent/file.jpg')).resolves.not.toThrow()
        })
    })
})
