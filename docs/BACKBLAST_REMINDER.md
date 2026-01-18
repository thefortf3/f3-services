# Backblast Reminder API

## Overview

The Backblast Reminder service checks for missing backblasts and sends reminders to Site Qs and scheduled Qs via Slack.

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
# Channel where admin notifications about missing backblasts are sent
BACKBLAST_REMINDER_CHANNEL=your_slack_channel_id
```

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
- `totalScheduled` (number): Total number of 1stF workouts scheduled for that date
- `foundCount` (number): Number of backblasts that were posted
- `missingCount` (number): Number of backblasts that are missing
- `foundBackblasts` (array): Details of workouts with backblasts posted
- `missingBackblasts` (array): Details of workouts missing backblasts
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
3. **Checks Database**: Queries PAXMiner `beatdowns` table to see if backblast was posted
4. **Tracks Missing Slack IDs**: Identifies AOs without channel IDs and Site Qs without user IDs (only for active, scheduled workouts)
5. **Sends Reminders** (based on query parameters):
   - **Channel Messages** (when `sendChannel=true` or `send=true`):
     - Posts admin notification to `BACKBLAST_REMINDER_CHANNEL` for each missing backblast
   - **Direct Messages** (when `sendDMs=true` or `send=true`):
     - Sends DM to all Site Qs (if they have Slack user IDs)
     - Sends DM to scheduled Q (if different from Site Qs and has Slack user ID)
   - **Admin Notifications**:
     - Sends admin DM about missing Slack IDs to `SCHEDULE_ADMIN_USER_ID` (if any found)

## Slack Message Types

### Admin Channel Notification (Missing Backblasts)

Posts to the configured `BACKBLAST_REMINDER_CHANNEL` with:
- AO name and channel link
- Date and time of workout
- Scheduled Q information
- Site Q information

### Admin DM Notification (Missing Slack IDs)

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
- Database connection errors: Returns 500 with error message

Individual Slack message failures (e.g., user has DMs disabled) are caught and reported in `reminderResults.errors` without failing the entire request.

## Data Sources

- **Schedule**: GloomSchedule API (`getScheduledQs()`)
- **AO Details**: GloomSchedule API (`getAODetails()`) for channel IDs and Site Q information
- **Backblast Status**: PAXMiner database `beatdowns` table
- **Slack Integration**: F3 Slack workspace via Slack Bolt app

## Limitations

- Only checks 1stF Workout events (by design)
- Events with no Q assigned are skipped (indicates AO was closed for that day)
- Requires Slack user IDs to be configured in GloomSchedule for DMs to work
- Requires Slack channel IDs to be configured in GloomSchedule
- AOs without channel IDs are skipped with a warning
- AOs with shutdown dates on or before the workout date are automatically skipped
- Does not track reminder history (will resend if called multiple times for the same date)

## Future Improvements

Potential enhancements:
- Add reminder history tracking to avoid duplicate reminders
- Add exclude list for specific AOs
- Add configurable delay (e.g., only remind if backblast missing after 24 hours)
- Add summary report option (daily digest of all missing backblasts)
- Add ability to exclude 2ndF/3rdF events by configuration
