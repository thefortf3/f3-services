# Backblast Reminder API

## Overview

The Backblast Reminder service checks for missing backblasts and sends reminders to Site Qs and scheduled Qs via Slack.

## Endpoint

```
GET /api/check_missing_backblasts
```

## Query Parameters

- `date` (optional): Date to check in YYYY-MM-DD format. Defaults to yesterday if not provided.
- `send` (optional): Set to `true` to actually send Slack reminders. If omitted or `false`, only returns the list of missing backblasts without sending messages.

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
# Send reminders for yesterday
curl "http://localhost:3000/api/check_missing_backblasts?send=true"

# Send reminders for a specific date
curl "http://localhost:3000/api/check_missing_backblasts?date=2026-01-17&send=true"
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
  "remindersSent": false,
  "reminderResults": null,
  "missingIdNotification": null
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
- `remindersSent` (boolean): Whether reminders were sent (based on `send` query param)
- `reminderResults` (object|null): Results of reminder sending (only when `send=true`)
  - `channelMessages` (number): Number of admin channel messages sent
  - `directMessages` (number): Number of DMs sent to Site Qs and scheduled Qs
  - `errors` (array): Any errors that occurred while sending messages
- `missingIdNotification` (object|null): Results of admin notification about missing Slack IDs (only when `send=true`)
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
5. **Sends Reminders** (if `send=true`):
   - Posts admin notification to `BACKBLAST_REMINDER_CHANNEL`
   - Sends DM to all Site Qs (if they have Slack user IDs)
   - Sends DM to scheduled Q (if different from Site Qs and has Slack user ID)
   - Sends admin notification about missing Slack IDs to `SCHEDULE_ADMIN_USER_ID`

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

## Scheduling

To run this automatically, set up a cron job or scheduled task:

```bash
# Example: Check for missing backblasts every morning at 8 AM
0 8 * * * curl "http://localhost:3000/api/check_missing_backblasts?send=true"
```

## Error Handling

The endpoint will return errors in these cases:

- Invalid date format: Returns 400 with error message
- Missing `BACKBLAST_REMINDER_CHANNEL` when trying to send: Returns 500 with error message
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
