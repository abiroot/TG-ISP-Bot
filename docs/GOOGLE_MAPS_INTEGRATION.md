# Google Maps API Integration Guide

Documentation for Google Maps API integration in TG-ISP-Bot.

**Last Updated:** 2025-11-17 | **Bot Version:** 1.0.13

---

## Overview

Google Maps integration provides accurate coordinate resolution for customer location tracking. The bot uses the official Google Maps JavaScript API (`@googlemaps/google-maps-services-js` v3.4.2).

**Service Location:** `src/services/googleMapsService.ts`

**Key Features:**
- Place ID resolution to coordinates
- Short URL expansion (maps.app.goo.gl)
- Address geocoding
- DMS (Degrees, Minutes, Seconds) parsing
- Automatic fallback strategies

---

## Configuration

**Environment Variables:**

```bash
# Same API key used for Gemini AI
GOOGLE_API_KEY=your_google_api_key

# Optional - defaults to true
GOOGLE_MAPS_ENABLED=true
```

**API Requirements:**
- Enable "Geocoding API" in Google Cloud Console
- Enable "Places API (New)" in Google Cloud Console
- API Key must have both services enabled

**API Quota:**
- Geocoding API: 40,000 free requests/month
- Place Details API: 40,000 free requests/month

---

## Supported URL Formats

The bot can parse coordinates from various Google Maps URL formats:

### 1. Place ID URLs
```
https://www.google.com/maps/place/ChIJXYZ12345678...
https://maps.google.com/?q=place_id:ChIJXYZ...
```

### 2. Short URLs
```
https://maps.app.goo.gl/ABC123def
https://goo.gl/maps/XYZ789
```

### 3. Coordinate URLs
```
https://www.google.com/maps?q=33.8886,35.4955
https://maps.google.com/@33.8886,35.4955,15z
```

### 4. DMS (Degrees, Minutes, Seconds)
```
33°47'57.0"N 35°32'30.4"E
URL-encoded: 33%C2%B047'57.0%22N+35%C2%B032'30.4%22E
```

---

## API Methods

### resolvePlace IdToCoordinates()

Resolve Google Maps Place ID to coordinates using Place Details API.

**Usage:**
```typescript
const coordinates = await googleMapsService.resolvePlaceIdToCoordinates('ChIJXYZ...')
// Returns: { latitude: 33.8886, longitude: 35.4955 } or null
```

**API Endpoint:** `Place Details API`

**Request:**
```typescript
{
    place_id: 'ChIJXYZ...',
    fields: ['geometry'],
    key: GOOGLE_API_KEY,
}
```

**Timeout:** 5 seconds

---

### resolveUrlToCoordinates()

Resolve any Google Maps URL to coordinates using Geocoding API (handles short URLs).

**Usage:**
```typescript
const coordinates = await googleMapsService.resolveUrlToCoordinates('https://maps.app.goo.gl/ABC123')
// Returns: { latitude: 33.8886, longitude: 35.4955 } or null
```

**API Endpoint:** `Geocoding API`

**Request:**
```typescript
{
    address: url,  // Google Maps URL
    key: GOOGLE_API_KEY,
}
```

**Timeout:** 10 seconds (longer for URL resolution)

---

### geocodeAddress()

Geocode address or place name to coordinates.

**Usage:**
```typescript
const coordinates = await googleMapsService.geocodeAddress('Times Square, New York')
// Returns: { latitude: 40.758, longitude: -73.9855 } or null
```

---

## Location Parser Utility

**Location:** `src/core/utils/locationParser.ts`

The location parser provides intelligent coordinate extraction with automatic fallback:

**Priority Order:**
1. Google Maps short URL? → Use `resolveUrlToCoordinates()` (API)
2. Place ID detected? → Use `resolvePlaceIdToCoordinates()` (API)
3. Try regex patterns (decimal degrees, DMS)
4. Fallback to `resolveUrlToCoordinates()` (API) for any Google Maps URL

**Supported Patterns:**
- Decimal degrees: `33.8886, 35.4955`
- Decimal with @: `@33.8886,35.4955`
- DMS: `33°47'57.0"N 35°32'30.4"E`
- Place IDs: `ChIJXYZ...`
- Google Maps URLs (all formats)

---

## Usage in Flows

### Location Webhook Flow

When external systems send location update requests via webhook:

**Flow:** `WebhookLocationRequestFlow`

```typescript
// 1. Bot receives webhook with Google Maps URL
const locationUrl = webhookData.location_url

// 2. Parse coordinates using locationParser
const coordinates = await parseLocationFromText(locationUrl)

// 3. Show acceptance buttons to user
// 4. Update customer locations via ISP API
```

**Example Webhook Payload:**
```json
{
    "request_id": "uuid-123",
    "usernames": ["customer1", "customer2"],
    "location_url": "https://maps.app.goo.gl/ABC123",
    "requestedBy": "collector_name"
}
```

---

## Error Handling

**Service Disabled:**
```typescript
if (!googleMapsService.isEnabled()) {
    // Falls back to regex-only parsing
}
```

**API Errors:**
- Network timeout (5-10s)
- Invalid API key
- Quota exceeded
- Invalid Place ID

All methods return `null` on failure and log errors with `googleMaps` logger namespace.

---

## Performance Notes

### API Quota Management

- **Free tier:** 40,000 requests/month per API
- **Cost:** $5 per 1,000 requests after free tier
- **Caching:** Place IDs are deterministic, can be cached

### Timeout Strategy

- Place Details API: 5 seconds
- Geocoding API (URLs): 10 seconds (resolves short URLs)
- Geocoding API (address): 5 seconds

### Fallback Behavior

If Google Maps API is disabled or fails:
1. Regex-based coordinate extraction (decimal, DMS)
2. No external API calls
3. Limited to patterns in text

---

## Testing

**Test Location Parsing:**

```typescript
import { parseLocationFromText } from '~/core/utils/locationParser'

// Test short URL
const coords1 = await parseLocationFromText('https://maps.app.goo.gl/ABC123')

// Test Place ID
const coords2 = await parseLocationFromText('https://www.google.com/maps/place/ChIJXYZ...')

// Test decimal coordinates
const coords3 = await parseLocationFromText('33.8886, 35.4955')

// Test DMS
const coords4 = await parseLocationFromText('33°47\'57.0"N 35°32\'30.4"E')
```

---

## Related Documentation

- [Location Service](../src/features/location/services/LocationService.ts) - Location update orchestration
- [Webhook Location Flow](../src/features/location/flows/WebhookLocationRequestFlow.ts) - Webhook handling
- [Location Parser](../src/core/utils/locationParser.ts) - Coordinate extraction utility

---

**Need Help?**
- Check Google Cloud Console for API enablement
- Verify API key has Geocoding + Places APIs enabled
- Review quota usage in Google Cloud Console
- Check logs with `googleMaps` namespace
