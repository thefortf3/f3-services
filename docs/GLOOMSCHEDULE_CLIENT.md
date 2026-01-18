# GloomSchedule API Client Library

A Node.js client library for interacting with the GloomSchedule API. This library handles authentication, token management, and provides easy-to-use methods for accessing F3 data.

## Features

- Automatic token management and refresh
- Clean, promise-based API
- Comprehensive error handling
- Support for all GloomSchedule API endpoints
- TypeScript-friendly JSDoc annotations

## Installation

This library is part of the f3-services project. To use it in your code:

```javascript
const GloomScheduleClient = require('./lib/gloomschedule-client');
```

## Quick Start

```javascript
const GloomScheduleClient = require('./lib/gloomschedule-client');

// Initialize the client
const client = new GloomScheduleClient({
  apiKey: 'your_api_key_here',
  baseUrl: 'your_api_base_url_here'
});

// Get active AOs
const aoData = await client.getAODetails({ activeOnly: true });
console.log(`Found ${aoData.aos.length} active AOs`);

// Get scheduled Qs for a specific date
const schedule = await client.getScheduledQs('2026-01-19');
console.log(`Found ${schedule.scheduled_events.length} scheduled events`);
```

## API Reference

### Constructor

#### `new GloomScheduleClient(config)`

Creates a new GloomSchedule API client instance.

**Parameters:**
- `config` (Object)
  - `apiKey` (string, required) - Your GloomSchedule API key
  - `baseUrl` (string, required) - Base URL for the GloomSchedule API

**Example:**
```javascript
const client = new GloomScheduleClient({
  apiKey: 'your_gloomschedule_api_key',
  baseUrl: 'your_gloomschedule_api_base_url'
});
```

### Methods

#### `requestToken()`

Manually request a new authentication token. Note: The client automatically handles token requests, so you typically don't need to call this directly.

**Returns:** `Promise<Object>`
- `token` (string) - The authentication token
- `expires_at` (string) - ISO timestamp when token expires
- `expires_in_seconds` (number) - Seconds until expiration
- `region_id` (number) - Region ID
- `region_name` (string) - Region name

**Example:**
```javascript
const tokenData = await client.requestToken();
console.log(`Token expires at: ${tokenData.expires_at}`);
```

---

#### `getAODetails(options)`

Get Area of Operation (AO) details for the region.

**Parameters:**
- `options` (Object, optional)
  - `activeOnly` (boolean, default: true) - Whether to return only active AOs

**Returns:** `Promise<Object>`
- `region` (Object) - Region information
  - `id` (number) - Region ID
  - `name` (string) - Region name
- `aos` (Array) - Array of AO objects with details

**Example:**
```javascript
// Get only active AOs
const activeAOs = await client.getAODetails({ activeOnly: true });

// Get all AOs (including inactive)
const allAOs = await client.getAODetails({ activeOnly: false });

// Iterate through AOs
activeAOs.aos.forEach(ao => {
  console.log(`${ao.name} at ${ao.location}`);
  console.log(`Days: ${ao.days_of_week.join(', ')}`);
  console.log(`Time: ${ao.start_time}`);
});
```

---

#### `getScheduledQs(date)`

Get scheduled Qs (leaders) for a specific date.

**Parameters:**
- `date` (string|Date) - Date to query (YYYY-MM-DD format string or Date object)

**Returns:** `Promise<Object>`
- `region` (Object) - Region information
- `date` (string) - Date in YYYY-MM-DD format
- `scheduled_events` (Array) - Array of scheduled event objects

**Example:**
```javascript
// Using a date string
const schedule = await client.getScheduledQs('2026-01-19');

// Using a Date object
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowSchedule = await client.getScheduledQs(tomorrow);

// Display events
schedule.scheduled_events.forEach(event => {
  console.log(`${event.ao_name} at ${event.start_time}`);
  event.qs.forEach(q => {
    console.log(`  Q: ${q.f3_name} (${q.status})`);
  });
});
```

---

#### `getRegionInfo()`

Get the current region information from the last authentication.

**Returns:** `Object|null`
- `id` (number) - Region ID
- `name` (string) - Region name

Returns `null` if not authenticated yet.

**Example:**
```javascript
const region = client.getRegionInfo();
if (region) {
  console.log(`Region: ${region.name} (ID: ${region.id})`);
}
```

---

#### `getTokenInfo()`

Get information about the current authentication token.

**Returns:** `Object|null`
- `token` (string) - The current token
- `expiresAt` (Date) - Token expiration date
- `isValid` (boolean) - Whether the token is still valid

Returns `null` if no token exists.

**Example:**
```javascript
const tokenInfo = client.getTokenInfo();
if (tokenInfo) {
  console.log(`Token valid: ${tokenInfo.isValid}`);
  console.log(`Expires: ${tokenInfo.expiresAt}`);
}
```

---

#### `clearToken()`

Clear the current token and force re-authentication on the next request.

**Example:**
```javascript
client.clearToken();
// Next API call will request a new token
```

---

#### `isTokenValid()`

Check if the current token is valid and not expired.

**Returns:** `boolean` - True if token is valid

**Example:**
```javascript
if (!client.isTokenValid()) {
  console.log('Token has expired or does not exist');
}
```

## Error Handling

The client throws descriptive errors that you should catch and handle:

```javascript
try {
  const schedule = await client.getScheduledQs('2026-01-19');
  // Process schedule...
} catch (error) {
  console.error('Failed to get schedule:', error.message);
}
```

Common errors:
- Invalid API key
- Network failures
- Invalid date formats
- Expired tokens (automatically handled by the client)

## Token Management

The client automatically manages authentication tokens:

1. Tokens are automatically requested on first API call
2. Tokens are cached and reused until they expire
3. Tokens are automatically refreshed when expired (with 60-second safety buffer)
4. You don't need to manually manage tokens in most cases

## Example Usage

See `examples/gloomschedule-example.js` for comprehensive examples of all client features.

To run the examples:

```bash
node examples/gloomschedule-example.js
```

## Response Data Structures

### AO Object
```javascript
{
  id: "uuid",
  name: "AO Name",
  location: "Location Name",
  latitude: null,
  longitude: null,
  start_time: "06:00:00",
  days_of_week: ["Monday", "Wednesday"],
  event_type: "1stF Workout",
  workout_types: [{ type: "Bootcamp" }],
  launch_date: null,
  shutdown_date: null,
  allow_self_signup: true,
  no_q_required: false,
  reminder_days_before: 2,
  notify_site_q_acceptance: true,
  notify_site_q_decline: true,
  additional_assignment_text: null,
  slack_channel_id: "C0XXXXX",
  site_qs: [
    {
      id: "uuid",
      f3_name: "F3 Name",
      slack_member_id: "U0XXXXX"
    }
  ]
}
```

### Scheduled Event Object
```javascript
{
  event_id: "uuid",
  ao_name: "AO Name",
  event_type: "1stF Workout",
  start_time: "05:00:00",
  workout_types: ["Bootcamp"],
  slack_channel_id: null,
  is_single_event: false,
  qs: [
    {
      user_id: "uuid",
      f3_name: "F3 Name",
      slack_member_id: "SLACK_ID",
      status: "accepted",
      is_vq: false
    }
  ]
}
```

## License

ISC
