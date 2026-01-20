# Schedule Posting API - GloomSchedule Version

## Overview

The Schedule Posting API posts tomorrow's workout schedule to a Slack channel. This version uses the **GloomSchedule API** as the data source instead of ICS calendar feeds.

## Endpoint

```
POST /api/post_schedule_v2
```

## Migration from ICS-based Endpoint

The original `/api/post_schedule` endpoint uses ICS calendar parsing. The new `/api/post_schedule_v2` endpoint uses the GloomSchedule API directly, which provides:

- ✅ Better data structure with Q information and status
- ✅ VQ indicators (Virgin Q - first time Q'ing)
- ✅ Event types (1stF, 2ndF, 3rdF) for filtering
- ✅ Real-time schedule updates without calendar sync delays
- ✅ Direct access to Site Q and AO metadata
- ✅ No need to parse complex ICS format

## Configuration

Add to your `.env` file:

```bash
# GloomSchedule API
GS_API_KEY=your_api_key
GS_API_ENDPOINT=https://your-gloomschedule-api.com

# Schedule Configuration
SCHEDULE_CHANNEL_ID=C0XXXXX # Slack channel to post schedule
SCHEDULE_ADMIN_USER_ID=U0XXXXX # Admin user for error notifications
SCHEDULE_GOOGLE_LINK=https://calendar.google.com/... # Google Calendar link
SCHEDULE_ICAL_LINK=https://calendar.google.com/ical/... # iCal subscription link
CALENDAR_TIMEZONE=America/New_York # Timezone for date calculations
```

## Request

### Using Environment Variables (Recommended)

When all configuration is in `.env`:

```bash
curl -X POST "http://localhost:3000/api/post_schedule_v2" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Overriding Configuration

```bash
curl -X POST "http://localhost:3000/api/post_schedule_v2" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "C0XXXXX",
    "adminUser": "U0XXXXX",
    "googleLink": "https://calendar.google.com/...",
    "icalLink": "https://calendar.google.com/ical/...",
    "timezone": "America/New_York",
    "include2ndF": false,
    "include3rdF": false
  }'
```

### Request Parameters

All parameters are optional if configured in environment variables:

- `channel` (string): Slack channel ID to post to (default: `SCHEDULE_CHANNEL_ID`)
- `adminUser` (string): Admin user ID for error notifications (default: `SCHEDULE_ADMIN_USER_ID`)
- `googleLink` (string): Google Calendar link (default: `SCHEDULE_GOOGLE_LINK`)
- `icalLink` (string): iCal subscription link (default: `SCHEDULE_ICAL_LINK`)
- `timezone` (string): Timezone for calculations (default: `CALENDAR_TIMEZONE` or `America/New_York`)
- `include2ndF` (boolean): Include 2ndF events in schedule (default: `false`)
- `include3rdF` (boolean): Include 3rdF events in schedule (default: `false`)

## Response

### Success Response

```json
{
  "success": true,
  "count": 6,
  "messages": 8,
  "unknownTypes": 0
}
```

**Fields:**
- `success` (boolean): Whether the operation succeeded
- `count` (number): Number of workouts found
- `messages` (number): Number of Slack messages posted (includes header and footer)
- `unknownTypes` (number): Number of unknown workout types detected

### No Workouts Response

```json
{
  "success": true,
  "count": 0,
  "message": "No workouts scheduled"
}
```

When no workouts are scheduled, the endpoint **silently succeeds** without posting anything to Slack.

### Error Response

```json
{
  "success": false,
  "error": "Error message"
}
```

## Posted Message Format

The endpoint posts a series of messages to the configured Slack channel:

### 1. Header Message
```
Tomorrow's Schedule:
```

### 2. Workout Messages (one per workout)

**Regular Workout:**
```
05:30: The Armory [🥾] - Boogie Nights
Committed: None yet
[HC Button]
```

**Closed Workout:**
```
The Stockade [❌] - CLOSED
```

**VQ (Virgin Q):**
```
05:15: The Forge [🥾] - NASA 🌟
Committed: None yet
[HC Button]
```

### 3. Footer Message
```
Subscribe to the calendar: Google | iCal
```

## Workout Type Emoji Mapping

The system maps workout types to emojis with intelligent parsing:

| Workout Type | Emoji |
|--------------|-------|
| Running / Run | 🏃 |
| Running with Pain Stations | 🏃 |
| Running w/ Pain Stations | 🏃 |
| Rucking / Ruck | 🎒 |
| Bootcamp | 🥾 |
| Kettlebell | 🫖 |
| Heavy Lifting / Heavy | 💪 |
| Swimming | 🏊 |
| Cycling | 🚴 |
| Yoga | 🧘 |
| Gear Workout / Gear | ⚙️ |
| Q School | 🏫 |
| Bible Study | 📖 |
| Topical Discussion | 💬 |
| Running Bootcamp | 🏃🥾 |
| Moderate | (no emoji) |

### Day-Specific Workout Types

The scheduler intelligently handles day-specific workout types for AOs that vary by day. For example:

```
"Tu: Bootcamp, Th: Running with Pain Stations"
```

**On Tuesday:** Shows Bootcamp emoji (🥾)  
**On Thursday:** Shows Running emoji (🏃)  
**On other days:** No emoji (workout type doesn't apply)

The system will **not** report day-specific types as "unknown" when they don't apply to the current day. Only truly unrecognized workout types are reported to the admin.

## Event Type Filtering

By default, only **1stF Workout** events are posted. You can include additional event types:

```bash
# Include 2ndF events (social/fellowship)
curl -X POST "http://localhost:3000/api/post_schedule_v2" \
  -H "Content-Type: application/json" \
  -d '{"include2ndF": true}'

# Include 3rdF events (faith/service)
curl -X POST "http://localhost:3000/api/post_schedule_v2" \
  -H "Content-Type: application/json" \
  -d '{"include3rdF": true}'

# Include all event types
curl -X POST "http://localhost:3000/api/post_schedule_v2" \
  -H "Content-Type: application/json" \
  -d '{"include2ndF": true, "include3rdF": true}'
```

## Schedule Features

### Closed Workouts
Workouts with no Q assigned are displayed as "CLOSED" without an HC button.

### Virgin Q Indicators
First-time Qs are marked with a 🌟 star emoji.

### Q Status
Qs who haven't accepted their Q assignment are marked with "(unconfirmed)". The system prefers showing accepted Qs when multiple Qs are assigned to the same workout.

### Time Sorting
Workouts are sorted by start time (earliest to latest), then alphabetically by AO name.

### AO Shutdown Date Filtering
**The AO shutdown date overrides all scheduled events.** If an AO has a shutdown date, any scheduled workouts on or after that date will be automatically filtered out and not posted to Slack. This ensures that only active AOs appear in the schedule, even if orphaned events exist in the schedule system.

## Admin Notifications

### Unknown Workout Types
When unknown workout types are detected, the admin receives a DM:

```
⚠️ Unknown Workout Types Detected

• New Type 1
• New Type 2

Please add these types to the emoji mapping in lib/scheduler-gloomschedule.js
```

### Posting Failures
If the schedule post fails, the admin receives a DM with error details:

```
❌ Schedule Post Failed

Error: [error message]
Time: [timestamp]

Check server logs for details.
```

## Scheduling with Cron

Set up a daily cron job to automatically post the schedule:

```bash
# Post tomorrow's schedule every day at 6 PM
0 18 * * * curl -X POST "http://localhost:3000/api/post_schedule_v2" -H "Content-Type: application/json" -d '{}'
```

## Google Apps Script Integration

```javascript
function postTomorrowsSchedule() {
  const apiUrl = PropertiesService.getScriptProperties().getProperty('F3_API_URL');
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      include2ndF: false,
      include3rdF: false
    }),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(apiUrl + '/api/post_schedule_v2', options);
    const result = JSON.parse(response.getContentText());
    
    Logger.log('Schedule posted successfully');
    Logger.log('Workouts: ' + result.count);
    Logger.log('Messages: ' + result.messages);
    
    return result;
  } catch (error) {
    Logger.log('Error posting schedule: ' + error.toString());
    throw error;
  }
}

// Set up a time-driven trigger to run this daily at 6 PM
```

## Comparison: ICS vs GloomSchedule

| Feature | ICS Parser (`/api/post_schedule`) | GloomSchedule (`/api/post_schedule_v2`) |
|---------|-----------------------------------|----------------------------------------|
| Data Source | Google Calendar ICS feed | GloomSchedule API |
| Q Information | Parsed from title | Structured from API |
| VQ Indicators | ❌ Not available | ✅ Included |
| Event Types | Manual parsing | ✅ Structured (1stF/2ndF/3rdF) |
| Closed Workouts | Manual detection | ✅ API provides |
| Site Q Data | ❌ Not available | ✅ Available (not used yet) |
| Sync Delay | Calendar sync lag | Real-time |
| Format Dependency | ICS format changes break | API versioned |

## Migration Path

1. **Test the new endpoint** alongside the old one
2. **Update your automation** (cron, Apps Script) to use `/api/post_schedule_v2`
3. **Keep the old endpoint** for backup during transition
4. **Monitor for unknown workout types** and update emoji mapping as needed

## Error Handling

The endpoint handles errors gracefully:

- **Missing GloomSchedule Config:** Returns 500 with clear error message
- **Missing Required Params:** Returns 400 with validation error
- **API Failures:** Returns 500 and sends admin DM
- **Slack Posting Failures:** Returns 500 and sends admin DM

All errors are logged to the server console for debugging.

## Troubleshooting

### "GloomSchedule API not configured"
Add `GS_API_KEY` and `GS_API_ENDPOINT` to your `.env` file.

### "No workouts scheduled"
This is normal - the endpoint silently succeeds when there are no workouts for tomorrow.

### Unknown workout types reported
Add the new types to the emoji mapping in `/home/user/f3-services/lib/scheduler-gloomschedule.js` in the `getWorkoutTypeEmojis()` function.

### Workouts not showing up
- Check if the AO is marked as active in GloomSchedule
- Check if the event type is 1stF (or enable 2ndF/3rdF if needed)
- Check server logs for filtering messages

## Future Enhancements

Potential improvements:
- Add Site Q information to workout cards
- Support custom emoji mappings via config
- Add workout description/notes to cards
- Support posting to multiple channels
- Add date override parameter (post schedule for any date)
- Cache AO details to reduce API calls
