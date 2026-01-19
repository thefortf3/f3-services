# Google Apps Script Integration

## Backblast Reminder API Functions

Use these functions in Google Apps Script to call the backblast reminder API from Google Sheets, Docs, or standalone scripts.

## Setup

1. In your Google Apps Script project, go to **Project Settings** (gear icon)
2. Add a Script Property named `BB_REMINDER_API_URL` with your API endpoint URL (e.g., `https://your-server.com`)
3. Alternatively, hardcode the URL in the functions below

## Functions

### Basic Usage

```javascript
/**
 * Check for missing backblasts without sending reminders
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to yesterday)
 * @returns {Object} Response with found and missing backblasts
 */
function checkMissingBackblasts(date) {
  const apiUrl = PropertiesService.getScriptProperties().getProperty('BB_REMINDER_API_URL');
  
  if (!apiUrl) {
    throw new Error('BB_REMINDER_API_URL not configured in Script Properties');
  }
  
  // Build URL with optional date parameter
  let url = apiUrl + '/api/check_missing_backblasts';
  if (date) {
    url += '?date=' + encodeURIComponent(date);
  }
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error response: ' + responseText);
      throw new Error('API returned status ' + responseCode + ': ' + responseText);
    }
    
    return JSON.parse(responseText);
    
  } catch (error) {
    Logger.log('Error calling API: ' + error.toString());
    throw error;
  }
}

/**
 * Send backblast reminders (both channel and DMs)
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to yesterday)
 * @returns {Object} Response with reminder results
 */
function sendBackblastReminders(date) {
  const apiUrl = PropertiesService.getScriptProperties().getProperty('BB_REMINDER_API_URL');
  
  if (!apiUrl) {
    throw new Error('BB_REMINDER_API_URL not configured in Script Properties');
  }
  
  // Build URL with send=true parameter
  let url = apiUrl + '/api/check_missing_backblasts?send=true';
  if (date) {
    url += '&date=' + encodeURIComponent(date);
  }
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error response: ' + responseText);
      throw new Error('API returned status ' + responseCode + ': ' + responseText);
    }
    
    const result = JSON.parse(responseText);
    
    // Log results
    Logger.log('Reminders sent for ' + result.date);
    Logger.log('Missing backblasts: ' + result.missingCount);
    Logger.log('Channel messages sent: ' + result.reminderResults.channelMessages);
    Logger.log('Direct messages sent: ' + result.reminderResults.directMessages);
    
    return result;
    
  } catch (error) {
    Logger.log('Error sending reminders: ' + error.toString());
    throw error;
  }
}

/**
 * Send backblast reminders with granular control
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to yesterday)
 * @param {boolean} sendChannel - Send channel notifications (default: true)
 * @param {boolean} sendDMs - Send direct messages (default: true)
 * @returns {Object} Response with reminder results
 */
function sendBackblastRemindersAdvanced(date, sendChannel, sendDMs) {
  const apiUrl = PropertiesService.getScriptProperties().getProperty('BB_REMINDER_API_URL');
  
  if (!apiUrl) {
    throw new Error('BB_REMINDER_API_URL not configured in Script Properties');
  }
  
  // Default to both channel and DMs if not specified
  if (sendChannel === undefined) sendChannel = true;
  if (sendDMs === undefined) sendDMs = true;
  
  // Build URL with parameters
  let url = apiUrl + '/api/check_missing_backblasts?';
  const params = [];
  
  if (date) {
    params.push('date=' + encodeURIComponent(date));
  }
  
  if (sendChannel) {
    params.push('sendChannel=true');
  }
  
  if (sendDMs) {
    params.push('sendDMs=true');
  }
  
  url += params.join('&');
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      Logger.log('Error response: ' + responseText);
      throw new Error('API returned status ' + responseCode + ': ' + responseText);
    }
    
    const result = JSON.parse(responseText);
    
    // Log results
    Logger.log('Date checked: ' + result.date);
    Logger.log('Missing backblasts: ' + result.missingCount);
    if (result.remindersSent) {
      Logger.log('Reminders config: ' + JSON.stringify(result.remindersConfig));
      Logger.log('Channel messages sent: ' + result.reminderResults.channelMessages);
      Logger.log('Direct messages sent: ' + result.reminderResults.directMessages);
      if (result.reminderResults.errors.length > 0) {
        Logger.log('Errors: ' + JSON.stringify(result.reminderResults.errors));
      }
    }
    
    return result;
    
  } catch (error) {
    Logger.log('Error calling API: ' + error.toString());
    throw error;
  }
}

/**
 * Send channel notifications only (no DMs)
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to yesterday)
 * @returns {Object} Response with reminder results
 */
function sendChannelNotificationsOnly(date) {
  return sendBackblastRemindersAdvanced(date, true, false);
}

/**
 * Send direct messages only (no channel notifications)
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to yesterday)
 * @returns {Object} Response with reminder results
 */
function sendDirectMessagesOnly(date) {
  return sendBackblastRemindersAdvanced(date, false, true);
}
```

## Time-Triggered Functions

### Daily Automated Check

```javascript
/**
 * Daily trigger to check yesterday's backblasts and send reminders
 * Set up a time-driven trigger to run this daily at 8 AM
 */
function dailyBackblastCheck() {
  try {
    Logger.log('Starting daily backblast check...');
    
    // Check yesterday (default behavior)
    const result = sendBackblastReminders();
    
    // Log summary
    Logger.log('=== Daily Backblast Check Complete ===');
    Logger.log('Date: ' + result.date);
    Logger.log('Total scheduled: ' + result.totalScheduled);
    Logger.log('Found: ' + result.foundCount);
    Logger.log('Missing: ' + result.missingCount);
    
    if (result.missingCount > 0) {
      Logger.log('Sent ' + result.reminderResults.channelMessages + ' channel messages');
      Logger.log('Sent ' + result.reminderResults.directMessages + ' direct messages');
      
      // List missing backblasts
      result.missingBackblasts.forEach(function(missing) {
        Logger.log('  - ' + missing.aoName + ' at ' + missing.startTime);
      });
    } else {
      Logger.log('All backblasts posted!');
    }
    
    return result;
    
  } catch (error) {
    Logger.log('ERROR in daily check: ' + error.toString());
    // Optionally send an alert email
    // MailApp.sendEmail('admin@example.com', 'Backblast Check Failed', error.toString());
    throw error;
  }
}
```

### Backfill Historical Data

```javascript
/**
 * Send reminders for a date range (channel only, to avoid spamming DMs)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 */
function backfillBackblastReminders(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const results = [];
  
  Logger.log('Backfilling reminders from ' + startDate + ' to ' + endDate);
  
  // Loop through each date
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = Utilities.formatDate(date, 'GMT', 'yyyy-MM-dd');
    
    Logger.log('Checking ' + dateStr + '...');
    
    try {
      // Send channel notifications only (no DMs for backfill)
      const result = sendChannelNotificationsOnly(dateStr);
      
      results.push({
        date: dateStr,
        missing: result.missingCount,
        channelMessages: result.reminderResults ? result.reminderResults.channelMessages : 0
      });
      
      Logger.log('  Found ' + result.missingCount + ' missing backblasts');
      
      // Add a small delay to avoid rate limits
      Utilities.sleep(1000);
      
    } catch (error) {
      Logger.log('  ERROR: ' + error.toString());
      results.push({
        date: dateStr,
        error: error.toString()
      });
    }
  }
  
  // Log summary
  Logger.log('=== Backfill Complete ===');
  let totalMissing = 0;
  let totalMessages = 0;
  results.forEach(function(r) {
    if (!r.error) {
      totalMissing += r.missing;
      totalMessages += r.channelMessages;
    }
  });
  Logger.log('Total missing: ' + totalMissing);
  Logger.log('Total channel messages sent: ' + totalMessages);
  
  return results;
}
```

## Usage Examples

### From Script Editor

```javascript
// Check today without sending
function testCheck() {
  const result = checkMissingBackblasts('2026-01-17');
  Logger.log(result);
}

// Send reminders for yesterday
function testSendYesterday() {
  const result = sendBackblastReminders();
  Logger.log(result);
}

// Send reminders for a specific date
function testSendSpecificDate() {
  const result = sendBackblastReminders('2026-01-17');
  Logger.log(result);
}

// Send only channel notifications
function testChannelOnly() {
  const result = sendChannelNotificationsOnly('2026-01-17');
  Logger.log(result);
}

// Send only DMs
function testDMsOnly() {
  const result = sendDirectMessagesOnly('2026-01-17');
  Logger.log(result);
}

// Backfill last week
function testBackfill() {
  const result = backfillBackblastReminders('2026-01-10', '2026-01-17');
  Logger.log(result);
}
```

## Setting Up Time-Driven Triggers

1. In the Apps Script editor, click on the clock icon (Triggers) in the left sidebar
2. Click "+ Add Trigger" in the bottom right
3. Configure:
   - **Choose which function to run:** `dailyBackblastCheck`
   - **Choose which deployment should run:** Head
   - **Select event source:** Time-driven
   - **Select type of time based trigger:** Day timer
   - **Select time of day:** 8am to 9am (or your preferred time)
4. Click "Save"

## Writing to Google Sheets

```javascript
/**
 * Write missing backblasts to a Google Sheet
 * @param {string} date - Date to check (optional)
 * @param {string} sheetId - Google Sheet ID (optional, uses active sheet if not provided)
 */
function writeMissingBackblastsToSheet(date, sheetId) {
  // Get the data
  const result = checkMissingBackblasts(date);
  
  // Get or create sheet
  let sheet;
  if (sheetId) {
    sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  } else {
    sheet = SpreadsheetApp.getActiveSheet();
  }
  
  // Clear existing data
  sheet.clear();
  
  // Write headers
  sheet.getRange(1, 1, 1, 6).setValues([[
    'Date', 'AO Name', 'Start Time', 'Scheduled Q', 'Site Qs', 'Status'
  ]]);
  
  // Format headers
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  
  // Write summary
  sheet.getRange(2, 1, 1, 2).setValues([[
    'Total Scheduled:', result.totalScheduled
  ]]);
  sheet.getRange(3, 1, 1, 2).setValues([[
    'Found:', result.foundCount
  ]]);
  sheet.getRange(4, 1, 1, 2).setValues([[
    'Missing:', result.missingCount
  ]]);
  
  // Write missing backblasts
  if (result.missingCount > 0) {
    const startRow = 6;
    const data = result.missingBackblasts.map(function(missing) {
      const qName = missing.scheduledQ ? missing.scheduledQ.f3Name : 'Not assigned';
      const siteQNames = missing.siteQs.map(function(sq) { return sq.f3Name; }).join(', ');
      
      return [
        missing.date,
        missing.aoName,
        missing.startTime,
        qName,
        siteQNames,
        'MISSING'
      ];
    });
    
    sheet.getRange(startRow, 1, data.length, 6).setValues(data);
    
    // Highlight missing rows in red
    sheet.getRange(startRow, 6, data.length, 1)
      .setBackground('#ffcccc')
      .setFontWeight('bold');
  }
  
  // Auto-resize columns
  sheet.autoResizeColumns(1, 6);
  
  Logger.log('Data written to sheet successfully');
  return result;
}
```

## Error Handling

All functions include basic error handling and logging. Check the Apps Script execution log for details:
- In the Apps Script editor, go to **View** > **Logs** or **View** > **Executions**

## Rate Limiting

When backfilling multiple dates, the script includes a 1-second delay between requests to avoid overwhelming the API. Adjust `Utilities.sleep(1000)` if needed.

## Security Notes

- Store your API URL in Script Properties rather than hardcoding it
- If your API requires authentication, add headers to the `UrlFetchApp.fetch()` calls
- Be careful with Script Properties - they can be accessed by anyone with edit access to the script
