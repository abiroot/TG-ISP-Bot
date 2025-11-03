/**
 * Location Parser Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { extractCoordinatesFromText, containsLocationUrl, parseCoordinatePair } from '~/core/utils/locationParser'
import { googleMapsService } from '~/services/googleMapsService'

// Mock Google Maps Service
vi.mock('~/services/googleMapsService', () => ({
    googleMapsService: {
        isEnabled: vi.fn(() => true),
        resolvePlaceIdToCoordinates: vi.fn(),
    },
}))

// Mock fetch for HTTP redirect resolution
global.fetch = vi.fn()

describe('locationParser', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('extractCoordinatesFromText', () => {
        describe('Standard Google Maps URLs (regex extraction)', () => {
            it('should extract coordinates from ?q= format', async () => {
                const url = 'https://maps.google.com/?q=33.954967,35.616299'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: 33.954967,
                    longitude: 35.616299,
                })
            })

            it('should extract coordinates from ?ll= format', async () => {
                const url = 'https://www.google.com/maps?ll=40.7128,-74.0060'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: 40.7128,
                    longitude: -74.006,
                })
            })

            it('should extract coordinates from @ format', async () => {
                const url = 'https://www.google.com/maps/@51.5074,-0.1278,15z'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: 51.5074,
                    longitude: -0.1278,
                })
            })

            it('should extract coordinates from /place/lat,lon format', async () => {
                const url = 'https://maps.google.com/maps/place/34.0522,-118.2437'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: 34.0522,
                    longitude: -118.2437,
                })
            })

            it('should handle negative coordinates', async () => {
                const url = 'https://maps.google.com/?q=-33.8688,151.2093'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: -33.8688,
                    longitude: 151.2093,
                })
            })
        })

        describe('OpenStreetMap URLs', () => {
            it('should extract coordinates from OSM mlat/mlon format', async () => {
                const url = 'https://www.openstreetmap.org/?mlat=48.8566&mlon=2.3522'
                const result = await extractCoordinatesFromText(url)

                expect(result).toEqual({
                    latitude: 48.8566,
                    longitude: 2.3522,
                })
            })
        })

        describe('Google Maps short URLs (HTTP redirect + DMS parsing)', () => {
            it('should resolve maps.app.goo.gl via HTTP redirect and extract DMS coordinates', async () => {
                const shortUrl = 'https://maps.app.goo.gl/abc123'
                // Mock resolved URL with DMS coordinates in place name
                const resolvedUrl = 'https://www.google.com/maps/place/33%C2%B047\'57.0%22N+35%C2%B032\'30.4%22E/@33.7991773,35.5391893,17z'

                ;(global.fetch as any).mockResolvedValueOnce({
                    url: resolvedUrl,
                })

                const result = await extractCoordinatesFromText(shortUrl)

                expect(global.fetch).toHaveBeenCalledWith(
                    shortUrl,
                    expect.objectContaining({
                        redirect: 'follow',
                    })
                )

                // Expect DMS conversion: 33°47'57.0"N = 33.799166...
                expect(result?.latitude).toBeCloseTo(33.799167, 5)
                expect(result?.longitude).toBeCloseTo(35.541778, 5)
            })

            it('should resolve goo.gl/maps via HTTP redirect and extract !3d/!4d parameters', async () => {
                const shortUrl = 'https://goo.gl/maps/xyz789'
                // Mock resolved URL with !3d and !4d parameters
                const resolvedUrl = 'https://www.google.com/maps/place/@40.7128,-74.006,17z/data=!3d40.7128!4d-74.006'

                ;(global.fetch as any).mockResolvedValueOnce({
                    url: resolvedUrl,
                })

                const result = await extractCoordinatesFromText(shortUrl)

                expect(global.fetch).toHaveBeenCalledWith(
                    shortUrl,
                    expect.objectContaining({
                        redirect: 'follow',
                    })
                )

                expect(result).toEqual({
                    latitude: 40.7128,
                    longitude: -74.006,
                })
            })

            it('should handle HTTP redirect failure', async () => {
                const shortUrl = 'https://maps.app.goo.gl/fail123'

                ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

                const result = await extractCoordinatesFromText(shortUrl)

                expect(result).toBeNull()
            })

            it('should extract Place ID and use API when no coordinates in URL', async () => {
                const shortUrl = 'https://maps.app.goo.gl/abc123'
                // Mock resolved URL with Place ID but no extractable coordinates
                const resolvedUrl = 'https://www.google.com/maps/place/ChIJN1t_tDeuEmsRUsoyG83frY4'
                const mockCoordinates = { latitude: -33.8688, longitude: 151.2093 }

                ;(global.fetch as any).mockResolvedValueOnce({
                    url: resolvedUrl,
                })

                vi.mocked(googleMapsService.resolvePlaceIdToCoordinates).mockResolvedValueOnce(mockCoordinates)

                const result = await extractCoordinatesFromText(shortUrl)

                expect(googleMapsService.resolvePlaceIdToCoordinates).toHaveBeenCalledWith(
                    'ChIJN1t_tDeuEmsRUsoyG83frY4'
                )
                expect(result).toEqual(mockCoordinates)
            })
        })

        describe('Google Maps Place ID URLs (API fallback)', () => {
            it('should extract Place ID and resolve via API for /place/ChIJ... format', async () => {
                const url = 'https://maps.google.com/place/ChIJN1t_tDeuEmsRUsoyG83frY4'
                const mockCoordinates = { latitude: -33.8688, longitude: 151.2093 }

                vi.mocked(googleMapsService.resolvePlaceIdToCoordinates).mockResolvedValueOnce(mockCoordinates)

                const result = await extractCoordinatesFromText(url)

                expect(googleMapsService.resolvePlaceIdToCoordinates).toHaveBeenCalledWith(
                    'ChIJN1t_tDeuEmsRUsoyG83frY4'
                )
                expect(result).toEqual(mockCoordinates)
            })

            it('should extract Place ID from /place/Name/ChIJ... format', async () => {
                const url = 'https://maps.google.com/maps/place/Sydney+Opera+House/ChIJN1t_tDeuEmsRUsoyG83frY4'
                const mockCoordinates = { latitude: -33.8568, longitude: 151.2153 }

                vi.mocked(googleMapsService.resolvePlaceIdToCoordinates).mockResolvedValueOnce(mockCoordinates)

                const result = await extractCoordinatesFromText(url)

                expect(googleMapsService.resolvePlaceIdToCoordinates).toHaveBeenCalledWith(
                    'ChIJN1t_tDeuEmsRUsoyG83frY4'
                )
                expect(result).toEqual(mockCoordinates)
            })

            it('should extract Place ID from ?place_id= format', async () => {
                const url = 'https://www.google.com/maps?place_id=ChIJrTLr-GyuEmsRBfy61i59si0'
                const mockCoordinates = { latitude: -33.8688, longitude: 151.2093 }

                vi.mocked(googleMapsService.resolvePlaceIdToCoordinates).mockResolvedValueOnce(mockCoordinates)

                const result = await extractCoordinatesFromText(url)

                expect(googleMapsService.resolvePlaceIdToCoordinates).toHaveBeenCalledWith(
                    'ChIJrTLr-GyuEmsRBfy61i59si0'
                )
                expect(result).toEqual(mockCoordinates)
            })

            it('should handle Google Maps API failure gracefully', async () => {
                const url = 'https://maps.google.com/place/ChIJN1t_tDeuEmsRUsoyG83frY4'

                vi.mocked(googleMapsService.resolvePlaceIdToCoordinates).mockResolvedValueOnce(null)

                const result = await extractCoordinatesFromText(url)

                expect(result).toBeNull()
            })

            it('should skip API fallback when Google Maps service is disabled', async () => {
                const url = 'https://maps.google.com/place/ChIJN1t_tDeuEmsRUsoyG83frY4'

                vi.mocked(googleMapsService.isEnabled).mockReturnValueOnce(false)

                const result = await extractCoordinatesFromText(url)

                expect(googleMapsService.resolvePlaceIdToCoordinates).not.toHaveBeenCalled()
                expect(result).toBeNull()
            })
        })

        describe('Validation', () => {
            it('should reject invalid latitude (> 90)', async () => {
                const url = 'https://maps.google.com/?q=95.0,35.0'
                const result = await extractCoordinatesFromText(url)

                expect(result).toBeNull()
            })

            it('should reject invalid latitude (< -90)', async () => {
                const url = 'https://maps.google.com/?q=-95.0,35.0'
                const result = await extractCoordinatesFromText(url)

                expect(result).toBeNull()
            })

            it('should reject invalid longitude (> 180)', async () => {
                const url = 'https://maps.google.com/?q=35.0,185.0'
                const result = await extractCoordinatesFromText(url)

                expect(result).toBeNull()
            })

            it('should reject invalid longitude (< -180)', async () => {
                const url = 'https://maps.google.com/?q=35.0,-185.0'
                const result = await extractCoordinatesFromText(url)

                expect(result).toBeNull()
            })

            it('should reject null input', async () => {
                const result = await extractCoordinatesFromText(null as any)
                expect(result).toBeNull()
            })

            it('should reject empty string', async () => {
                const result = await extractCoordinatesFromText('')
                expect(result).toBeNull()
            })

            it('should reject non-string input', async () => {
                const result = await extractCoordinatesFromText(123 as any)
                expect(result).toBeNull()
            })
        })
    })

    describe('containsLocationUrl', () => {
        it('should detect Google Maps URLs', () => {
            expect(containsLocationUrl('https://maps.google.com/?q=33.9,35.6')).toBe(true)
            expect(containsLocationUrl('Check this: https://www.google.com/maps?ll=40.7,-74.0')).toBe(true)
        })

        it('should detect Google short URLs', () => {
            expect(containsLocationUrl('https://maps.app.goo.gl/abc123')).toBe(true)
            expect(containsLocationUrl('https://goo.gl/maps/xyz789')).toBe(true)
        })

        it('should detect OpenStreetMap URLs', () => {
            expect(containsLocationUrl('https://www.openstreetmap.org/?mlat=48.8&mlon=2.3')).toBe(true)
        })

        it('should return false for non-location URLs', () => {
            expect(containsLocationUrl('https://example.com')).toBe(false)
            expect(containsLocationUrl('Just plain text')).toBe(false)
        })

        it('should handle null/undefined gracefully', () => {
            expect(containsLocationUrl(null as any)).toBe(false)
            expect(containsLocationUrl(undefined as any)).toBe(false)
        })
    })

    describe('parseCoordinatePair', () => {
        it('should parse "lat, lon" format', () => {
            const result = parseCoordinatePair('33.954967, 35.616299')
            expect(result).toEqual({
                latitude: 33.954967,
                longitude: 35.616299,
            })
        })

        it('should parse without spaces', () => {
            const result = parseCoordinatePair('40.7128,-74.0060')
            expect(result).toEqual({
                latitude: 40.7128,
                longitude: -74.006,
            })
        })

        it('should handle negative coordinates', () => {
            const result = parseCoordinatePair('-33.8688, 151.2093')
            expect(result).toEqual({
                latitude: -33.8688,
                longitude: 151.2093,
            })
        })

        it('should reject invalid coordinates', () => {
            expect(parseCoordinatePair('95.0, 35.0')).toBeNull() // Invalid latitude
            expect(parseCoordinatePair('35.0, 185.0')).toBeNull() // Invalid longitude
        })

        it('should reject invalid format', () => {
            expect(parseCoordinatePair('not coordinates')).toBeNull()
            expect(parseCoordinatePair('123')).toBeNull()
        })

        it('should handle null/undefined gracefully', () => {
            expect(parseCoordinatePair(null as any)).toBeNull()
            expect(parseCoordinatePair(undefined as any)).toBeNull()
        })
    })
})
