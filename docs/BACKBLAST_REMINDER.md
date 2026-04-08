# Backblast Reminder API

## Overview

The Backblast Reminder service checks for missing backblasts by querying Slack channels directly and sends reminders to Site Qs and scheduled Qs via Slack.

## Endpoint

```
GET /api/check_missing_backblasts
```

## Query Parameters

- `date` (optional): Date to check in YYYY-MM-DD format. Defaults to yesterday if not provided.
- `send` (optional): **Legacy parameter.** Set to `true` to send both channel messages and DMs. Equivalent to `sendChannel=true&sendDMs=true`.
- `sendChannel` (optional): Set to `true` to send admin channel notifications only (no DMs).
- `sendDMs` (optional): Set to `true` to send direct messages to Site Qs and scheduled Qs only (no channel messages).

**Note:** You can combine `sendChannel` and `sendDMs` parameters for granular control. If none are specified, only returns data without sending messages.

## Configuration

Add to your `.env` file:

```bash
# Slack bot token with required scopes
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Channel where admin notifications about missing backblasts are sent
BACKBLAST_REMINDER_CHANNEL=your_slack_channel_id

# Admin user to notify about system issues (missing channel IDs, access errors)
SCHEDULE_ADMIN_USER_ID=U123456789

# GloomSchedule API credentials
GS_API_KEY=your_gloomschedule_api_key
GS_API_ENDPOINT=https://gloomschedule.com/api
```

### Required Slack Bot Scopes

Your Slack bot must have these OAuth scopes:
- `channels:history` - Read public channel message history
- `groups:history` - Read private channel history (if checking private AO channels)
- `chat:write` - Send messages to channels and users
- `users:read` - Get user information (for resolving Q names)

## Usage Examples

### Check for missing backblasts (no reminders sent)

```bash
# Check yesterday's workouts
curl "http://localhost:3000/api/check_missing_backblasts"

# Check a specific date
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17"
```

### Send reminders for missing backblasts

```bash
# Send both channel notifications and DMs for yesterday (legacy method)
curl "http://localhost:3000/api/check_missing_backblasts?send=true"

# Send both channel notifications and DMs for a specific date (legacy method)
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17&send=true"

# Send only channel notifications (no DMs)
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17&sendChannel=true"

# Send only DMs to Site Qs and scheduled Qs (no channel messages)
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17&sendDMs=true"

# Send both channel notifications and DMs (explicit method)
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17&sendChannel=true&sendDMs=true"
```

## Response Format

The endpoint returns JSON with both found and missing backblasts:

```json
{
  "success": true,
  "date": "2026-01-17",
  "totalScheduled": 4,
  "foundCount": 2,
  "missingCount": 2,
  "channelAccessErrorsCount": 0,
  "foundBackblasts": [
    {
      "date": "2026-01-17",
      "aoName": "Example AO",
      "channelId": "C0YYYYY",
      "channelName": "<#C0YYYYY>",
      "eventType": "1stF Workout",
      "startTime": "06:30:00",
      "scheduledQ": {
        "f3Name": "Example Q",
        "userId": "U0YYYYY",
        "status": "accepted"
      },
      "siteQs": [
        {
          "f3Name": "Example Site Q",
          "userId": "U0ZZZZZ"
        }
      ]
    }
  ],
  "missingBackblasts": [
    {
      "date": "2026-01-17",
      "aoName": "6@6",
      "channelId": "C0XXXXX",
      "channelName": "<#C0XXXXX>",
      "eventType": "1stF Workout",
      "startTime": "06:00:00",
      "scheduledQ": {
        "f3Name": "Example Q",
        "userId": null,
        "status": "accepted"
      },
      "siteQs": [
        {
          "f3Name": "Example Site Q",
          "userId": "U0XXXXX"
        }
      ]
    }
  ],
  "channelAccessErrors": [
    {
      "aoName": "The Dungeon",
      "channelId": "C0ZZZZZ",
      "errorType": "not_in_channel",
      "errorMessage": "Bot is not a member of this channel"
    }
  ],
  "missingSlackIds": {
    "aos": [
      {
        "name": "The Stockade",
        "issue": "Missing Slack channel ID"
      }
    ],
    "siteQs": [
      {
        "name": "NASA",
        "ao": "Block Party",
        "issue": "Missing Slack user ID"
      }
    ]
  },
  "remindersSent": true,
  "remindersConfig": {
    "sendChannel": true,
    "sendDMs": false
  },
  "reminderResults": {
    "channelMessages": 1,
    "directMessages": 0,
    "errors": []
  },
  "missingIdNotification": {
    "sent": false,
    "error": null
  }
}
```

### Response Fields

- `success` (boolean): Whether the request was successful
- `date` (string): The date that was checked (YYYY-MM-DD format)
- `totalScheduled` (number): Total number of 1stF workouts scheduled for that date (excludes AOs with access errors)
- `foundCount` (number): Number of backblasts that were posted
- `missingCount` (number): Number of backblasts that are missing
- `channelAccessErrorsCount` (number): Number of AO channels that couldn't be accessed
- `foundBackblasts` (array): Details of workouts with backblasts posted
- `missingBackblasts` (array): Details of workouts missing backblasts
- `channelAccessErrors` (array): AO channels that couldn't be accessed (bot not member, channel not found, etc.)
  - `aoName` (string): Name of the AO
  - `channelId` (string): Slack channel ID that failed
  - `errorType` (string): Error code from Slack API (e.g., "not_in_channel", "channel_not_found")
  - `errorMessage` (string): Human-readable error message
- `missingSlackIds` (object): Information about missing Slack IDs in GloomSchedule
  - `aos` (array): AOs without Slack channel IDs
  - `siteQs` (array): Site Qs without Slack user IDs (includes AO context)
- `remindersSent` (boolean): Whether any reminders were sent (true if `send`, `sendChannel`, or `sendDMs` was set to true)
- `remindersConfig` (object|null): Configuration of what was sent (only when reminders were sent)
  - `sendChannel` (boolean): Whether channel messages were sent
  - `sendDMs` (boolean): Whether direct messages were sent
- `reminderResults` (object|null): Results of reminder sending (only when reminders were sent)
  - `channelMessages` (number): Number of admin channel messages sent
  - `directMessages` (number): Number of DMs sent to Site Qs and scheduled Qs
  - `errors` (array): Any errors that occurred while sending messages
- `missingIdNotification` (object|null): Results of admin notification about missing Slack IDs (only when reminders were sent)
  - `sent` (boolean): Whether the notification was sent
  - `error` (string|null): Error message if notification failed

## How It Works

1. **Fetches Schedule**: Queries GloomSchedule API for scheduled workouts on the specified date
2. **Filters Events**: 
   - Only checks 1stF Workout events (ignores 2ndF, 3rdF, etc.)
   - Skips events with no Q assigned (closed for that specific day)
   - Skips AOs with shutdown dates on or before the workout date
3. **Checks Slack Channels**: For each AO channel:
   - Queries `conversations.history` from workout date to present
   - Searches for messages with `metadata.event_type === "backblast"`
   - Matches backblast date to workout date (exact match required)
   - Handles channel access errors (not_in_channel, channel_not_found, etc.)
4. **Immediate Admin Notifications**: Sends alerts immediately when:
   - An AO is missing its Slack channel ID in GloomSchedule
   - Bot cannot access a channel (not a member, channel not found, permission denied, etc.)
5. **Tracks Missing Slack IDs**: Identifies AOs without channel IDs and Site Qs without user IDs (only for active, scheduled workouts)
6. **Sends Reminders** (based on query parameters):
   - **Channel Messages** (when `sendChannel=true` or `send=true`):
     - Posts admin notification to `BACKBLAST_REMINDER_CHANNEL` for each missing backblast
   - **Direct Messages** (when `sendDMs=true` or `send=true`):
     - Sends DM to all Site Qs (if they have Slack user IDs)
     - Sends DM to scheduled Q (if different from Site Qs and has Slack user ID)
   - **Admin Notifications**:
     - Sends admin DM about missing Slack IDs to `SCHEDULE_ADMIN_USER_ID` (if any found)

## Backblast Detection

The system uses Slack message metadata to detect backblasts:

**Detection Criteria:**
- Message must have `metadata.event_type === "backblast"`
- Message must have `metadata.event_payload.date` matching the workout date (YYYY-MM-DD)
- Search starts from workout date (midnight UTC) to present time

**Time Window:**
- Searches from workout date to present (no upper time limit)
- Allows backblasts to be posted late and still be counted
- Only exact date matches are counted (prevents wrong-date backblasts from being counted)

**Example Backblast Metadata:**
```json
{
  "event_type": "backblast",
  "event_payload": {
    "date": "2026-01-17",
    "title": "Morning Beatdown",
    "the_q": "U123456",
    "The_AO": "C789012"
  }
}
```

## Slack Message Types

### Admin Channel Notification (Missing Backblasts)

Posts to the configured `BACKBLAST_REMINDER_CHANNEL` with:
- AO name and channel link
- Date and time of workout
- Scheduled Q information
- Site Q information

### Admin DM Notification (Missing Slack Channel ID)

Sends immediate DM to `SCHEDULE_ADMIN_USER_ID` when an AO is missing its Slack channel ID:
- AO name
- Explanation of the issue
- Request to update GloomSchedule

### Admin DM Notification (Channel Access Error)

Sends immediate DM to `SCHEDULE_ADMIN_USER_ID` when bot cannot access a channel:
- AO name and channel ID
- Error type (not_in_channel, channel_not_found, etc.)
- User-friendly explanation
- Note that AO was skipped (not counted as missing)

**Common Error Types:**
- `not_in_channel`: Bot needs to be invited to the channel
- `channel_not_found`: Channel may be deleted or archived
- `missing_scope`: Bot lacks required permissions
- `access_denied`: Permission denied for other reasons

### Admin DM Notification (Missing Slack IDs Summary)

Sends DM to `SCHEDULE_ADMIN_USER_ID` when AOs or Site Qs are missing Slack IDs in GloomSchedule:
- List of AOs without Slack channel IDs
- List of Site Qs without Slack user IDs
- Includes AO context for each missing Site Q

This helps keep GloomSchedule data current and ensures reminders can be sent effectively.

### Site Q Direct Message

Sends DM to each Site Q with:
- Missing backblast details
- Scheduled Q information
- Button to navigate to AO channel

### Scheduled Q Direct Message

Sends DM to the scheduled Q (if not also a Site Q) with:
- Reminder that they were scheduled to Q
- Request to post backblast
- Button to navigate to AO channel

**Note:** The scheduled Q status (e.g., "accepted", "assigned") is NOT included in reminder messages - only the Q's name is shown.

## Message Configuration Options

The system provides flexible control over reminder delivery:

| Parameter | Channel Messages | Direct Messages | Use Case |
|-----------|------------------|-----------------|----------|
| None | No | No | Check only (reporting) |
| `send=true` | Yes | Yes | Full reminders (legacy) |
| `sendChannel=true` | Yes | No | Admin notifications only |
| `sendDMs=true` | No | Yes | Direct to Q/Site Qs only |
| Both `sendChannel=true&sendDMs=true` | Yes | Yes | Full reminders (explicit) |

**Example Use Cases:**
- **Initial backfill**: Use `sendChannel=true` to notify admin channel without spamming Site Qs with old reminders
- **Daily automation**: Use `send=true` or both parameters for complete reminder workflow
- **Targeted follow-up**: Use `sendDMs=true` to send DMs only after admin has been notified

## Scheduling

To run this automatically, set up a cron job or scheduled task:

```bash
# Example: Check for missing backblasts every morning at 8 AM
0 8 * * * curl "http://localhost:3000/api/check_missing_backblasts?send=true"
```

## Error Handling

The endpoint will return errors in these cases:

- Invalid date format: Returns 400 with error message
- Missing `BACKBLAST_REMINDER_CHANNEL` when `sendChannel=true` (or `send=true`): Returns 500 with error message
- GloomSchedule API errors: Returns 500 with error message
- Missing `slackApp` parameter: Returns 500 with error message

Individual Slack message failures (e.g., user has DMs disabled) are caught and reported in `reminderResults.errors` without failing the entire request.

**Channel Access Errors:**
- AOs with channel access errors are tracked separately in `channelAccessErrors`
- These AOs are NOT counted as missing backblasts
- Admin is immediately notified via DM about each access error
- Common causes: bot not invited to channel, channel deleted, permission issues

## Data Sources

- **Schedule**: GloomSchedule API (`getScheduledQs()`)
- **AO Details**: GloomSchedule API (`getAODetails()`) for channel IDs and Site Q information
- **Backblast Status**: Slack channel history via `conversations.history` API
- **Slack Integration**: F3 Slack workspace via Slack Bolt app

## Rate Limits

**Slack API Limits:**
- `conversations.history` is a Tier 3 method: 50+ requests per minute
- Burst behavior is tolerated
- Since checks run once daily with typically <50 AOs, rate limits should not be an issue

**For Non-Marketplace Apps (as of May 29, 2025):**
- New commercially distributed apps: Limited to 1 request/minute (with limit=15 messages)
- Marketplace & internal apps: Standard Tier 3 limits apply
- Existing installations: Not affected by new limits

## Limitations

- Only checks 1stF Workout events (by design)
- Events with no Q assigned are skipped (indicates AO was closed for that day)
- Requires Slack user IDs to be configured in GloomSchedule for DMs to work
- Requires Slack channel IDs to be configured in GloomSchedule
- AOs without channel IDs are skipped with immediate admin notification
- AOs where bot cannot access the channel are skipped with immediate admin notification
- Only detects backblasts with proper metadata (`event_type: "backblast"`)
- Requires exact date match in backblast metadata (prevents wrong-date matches)
- AOs with shutdown dates on or before the workout date are automatically skipped
- Does not track reminder history (will resend if called multiple times for the same date)

## Future Improvements

Potential enhancements:
- Add reminder history tracking to avoid duplicate reminders
- Add exclude list for specific AOs
- Add configurable delay (e.g., only remind if backblast missing after 24 hours)
- Add summary report option (daily digest of all missing backblasts)
- Add ability to exclude 2ndF/3rdF events by configuration
- Add retry logic with exponential backoff for rate limit errors
