/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const GloomScheduleClient = require('./gloomschedule-client');
const config = require('./config');

/**
 * Backblast Reminder Service
 * 
 * Checks for missing backblasts and sends reminders to Site Qs
 */

/**
 * Check if backblast exists in Slack channel for a specific date
 * @param {Object} slackClient - Slack Web API client
 * @param {string} channelId - Slack channel ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Object with { exists: boolean, error: null/object }
 */
async function checkBackblastExistsInSlack(slackClient, channelId, date) {
  try {
    // Convert date (YYYY-MM-DD) to Unix timestamp (start of day UTC)
    const workoutDate = new Date(date + 'T00:00:00Z');
    const oldest = (workoutDate.getTime() / 1000).toString();
    
    // Search from workout date to present (no 'latest' parameter = now)
    let hasMore = true;
    let cursor = null;
    
    while (hasMore) {
      const response = await slackClient.conversations.history({
        channel: channelId,
        oldest: oldest,
        limit: 100,
        cursor: cursor,
        include_all_metadata: true
      });
      
      // Check each message for backblast metadata with matching date
      for (const message of response.messages) {
        if (message.metadata && 
            message.metadata.event_type === "backblast" &&
            message.metadata.event_payload?.date === date) {
          return { exists: true, error: null };
        }
      }
      
      // Check for more pages
      cursor = response.response_metadata?.next_cursor;
      hasMore = !!cursor;
    }
    
    return { exists: false, error: null };
    
  } catch (error) {
    // Return error info for handling
    return { 
      exists: false, 
      error: {
        code: error.data?.error || 'unknown_error',
        message: error.message
      }
    };
  }
}

/**
 * Get schedule from GloomSchedule API for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Schedule data
 */
async function getSchedule(date) {
  const apiKey = process.env.GS_API_KEY;
  const baseUrl = process.env.GS_API_ENDPOINT;
  
  if (!apiKey) {
    throw new Error('GS_API_KEY not configured');
  }
  if (!baseUrl) {
    throw new Error('GS_API_ENDPOINT not configured');
  }
  
  const client = new GloomScheduleClient({ apiKey, baseUrl });
  return await client.getScheduledQs(date);
}

/**
 * Get AO details to match channel IDs and Site Qs
 * @returns {Promise<Object>} AO data
 */
async function getAODetails() {
  const apiKey = process.env.GS_API_KEY;
  const baseUrl = process.env.GS_API_ENDPOINT;
  
  if (!apiKey) {
    throw new Error('GS_API_KEY not configured');
  }
  if (!baseUrl) {
    throw new Error('GS_API_ENDPOINT not configured');
  }
  
  const client = new GloomScheduleClient({ apiKey, baseUrl });
  return await client.getAODetails({ activeOnly: false });
}

/**
 * Send notification to admin about channel access error
 * @param {Object} slackApp - Slack app instance
 * @param {string} adminUserId - Admin user ID to notify
 * @param {string} aoName - AO name
 * @param {string} channelId - Channel ID
 * @param {Object} error - Error object with code and message
 * @returns {Promise<void>}
 */
async function sendChannelAccessErrorNotification(slackApp, adminUserId, aoName, channelId, error) {
  if (!adminUserId) {
    adminUserId = process.env.SCHEDULE_ADMIN_USER_ID;
  }
  
  if (!adminUserId) {
    console.warn('No admin user ID configured for channel access error notification');
    return;
  }
  
  // Map error codes to user-friendly messages
  const errorMessages = {
    'not_in_channel': 'The bot is not a member of this channel. Please invite the bot to the channel.',
    'channel_not_found': 'The channel could not be found. It may have been deleted or archived.',
    'missing_scope': 'The bot lacks required permissions to read this channel history.',
    'access_denied': 'Access to this channel is denied.',
    'invalid_auth': 'Authentication failed when accessing this channel.'
  };
  
  const userMessage = errorMessages[error.code] || `Error: ${error.message}`;
  
  try {
    await slackApp.client.chat.postMessage({
      channel: adminUserId,
      text: `⚠️ Channel Access Error for ${aoName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Channel Access Error',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Unable to check backblasts for *${aoName}* (<#${channelId}>)\n\n*Error:* ${userMessage}\n*Error Code:* \`${error.code}\``
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'This AO was skipped and not counted as a missing backblast.'
            }
          ]
        }
      ]
    });
    console.log(`Sent channel access error notification for ${aoName}`);
  } catch (notificationError) {
    console.error(`Failed to send channel access error notification:`, notificationError.message);
  }
}

/**
 * Send notification to admin about missing channel ID
 * @param {Object} slackApp - Slack app instance
 * @param {string} adminUserId - Admin user ID to notify
 * @param {string} aoName - AO name
 * @returns {Promise<void>}
 */
async function sendMissingChannelIdNotification(slackApp, adminUserId, aoName) {
  if (!adminUserId) {
    adminUserId = process.env.SCHEDULE_ADMIN_USER_ID;
  }
  
  if (!adminUserId) {
    console.warn('No admin user ID configured for missing channel ID notification');
    return;
  }
  
  try {
    await slackApp.client.chat.postMessage({
      channel: adminUserId,
      text: `⚠️ Missing Channel ID for ${aoName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Missing Slack Channel ID',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `The AO *${aoName}* is missing its Slack channel ID in GloomSchedule.\n\nThis prevents the backblast reminder system from checking if backblasts were posted.`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'Please update the channel ID in GloomSchedule for this AO.'
            }
          ]
        }
      ]
    });
    console.log(`Sent missing channel ID notification for ${aoName}`);
  } catch (notificationError) {
    console.error(`Failed to send missing channel ID notification:`, notificationError.message);
  }
}

/**
 * Get backblast status for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (defaults to yesterday)
 * @param {Object} slackApp - Slack app instance (required)
 * @returns {Promise<Object>} Object with found, missing, missingSlackIds, and channelAccessErrors arrays
 */
async function getBackblastStatus(date = null, slackApp = null) {
  try {
    // Validate slackApp parameter
    if (!slackApp || !slackApp.client) {
      throw new Error('slackApp parameter is required');
    }
    
    // Default to yesterday if no date provided
    if (!date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = yesterday.toISOString().split('T')[0];
    }
    
    // Get schedule for the date
    console.log(`Fetching schedule for ${date}...`);
    const schedule = await getSchedule(date);
    
    // Get AO details for channel ID mapping
    console.log('Fetching AO details...');
    const aoDetails = await getAODetails();
    
    // Create a map of AO names to full AO info (including channel IDs)
    const aoMap = {};
    aoDetails.aos.forEach(ao => {
      aoMap[ao.name] = ao;
    });
    
    // Check each scheduled event
    const missingBackblasts = [];
    const foundBackblasts = [];
    const channelAccessErrors = [];
    const missingSlackIds = {
      aos: [],
      siteQs: []
    };
    
    for (const event of schedule.scheduled_events) {
      // Only check 1stF Workout events (skip 2ndF, 3rdF, etc.)
      if (event.event_type !== '1stF Workout') {
        continue;
      }
      
      // Skip events with no Q assigned (closed for the day)
      if (!event.qs || event.qs.length === 0) {
        console.log(`Skipping ${event.ao_name} - no Q assigned (closed)`);
        continue;
      }
      
      // Get the full AO details
      const ao = aoMap[event.ao_name];
      if (!ao) {
        console.warn(`Warning: AO '${event.ao_name}' not found in AO details`);
        continue;
      }
      
      // Skip AOs that have been shut down before the workout date
      if (ao.shutdown_date) {
        const shutdownDate = new Date(ao.shutdown_date);
        const workoutDate = new Date(date);
        if (shutdownDate <= workoutDate) {
          console.log(`Skipping ${event.ao_name} - shut down on ${ao.shutdown_date}`);
          continue;
        }
      }
      
      // Use channel ID from the AO details (preferred) or from event
      const channelId = ao.slack_channel_id || event.slack_channel_id;
      
      if (!channelId) {
        console.warn(`Warning: No channel ID for AO '${event.ao_name}'`);
        
        // Immediate admin notification for missing channel ID
        await sendMissingChannelIdNotification(
          slackApp,
          process.env.SCHEDULE_ADMIN_USER_ID,
          event.ao_name
        );
        
        // Track AO with missing channel ID
        if (!missingSlackIds.aos.find(a => a.name === event.ao_name)) {
          missingSlackIds.aos.push({
            name: event.ao_name,
            issue: 'Missing Slack channel ID'
          });
        }
        continue;
      }
      
      // Check if backblast exists in Slack
      const result = await checkBackblastExistsInSlack(slackApp.client, channelId, date);
      
      // Handle channel access errors
      if (result.error) {
        // Immediate admin notification for channel access error
        await sendChannelAccessErrorNotification(
          slackApp,
          process.env.SCHEDULE_ADMIN_USER_ID,
          event.ao_name,
          channelId,
          result.error
        );
        
        channelAccessErrors.push({
          aoName: event.ao_name,
          channelId: channelId,
          errorType: result.error.code,
          errorMessage: result.error.message
        });
        
        continue; // Skip this AO, don't count as missing
      }
      
      // Get Q information - use the first Q if multiple
      const qInfo = event.qs && event.qs.length > 0 ? event.qs[0] : null;
      
      // Get Site Q information from AO details
      const siteQs = ao.site_qs || [];
      
      // Track Site Qs with missing Slack user IDs
      siteQs.forEach(sq => {
        if (!sq.slack_member_id) {
          if (!missingSlackIds.siteQs.find(s => s.name === sq.f3_name && s.ao === event.ao_name)) {
            missingSlackIds.siteQs.push({
              name: sq.f3_name,
              ao: event.ao_name,
              issue: 'Missing Slack user ID'
            });
          }
        }
      });
      
      const backblastInfo = {
        date: date,
        aoName: event.ao_name,
        channelId: channelId,
        channelName: event.slack_channel_id ? `<#${channelId}>` : `#${event.ao_name}`,
        eventType: event.event_type,
        startTime: event.start_time,
        scheduledQ: qInfo ? {
          f3Name: qInfo.f3_name,
          userId: qInfo.slack_member_id,
          status: qInfo.status
        } : null,
        siteQs: siteQs.map(sq => ({
          f3Name: sq.f3_name,
          userId: sq.slack_member_id
        }))
      };
      
      if (result.exists) {
        foundBackblasts.push(backblastInfo);
      } else {
        missingBackblasts.push(backblastInfo);
      }
    }
    
    return {
      found: foundBackblasts,
      missing: missingBackblasts,
      missingSlackIds: missingSlackIds,
      channelAccessErrors: channelAccessErrors
    };
    
  } catch (error) {
    console.error('Error in getBackblastStatus:', error);
    throw error;
  }
}

/**
 * Get missing backblasts for a specific date (legacy wrapper)
 * @param {string} date - Date in YYYY-MM-DD format (defaults to yesterday)
 * @param {Object} slackApp - Slack app instance (required)
 * @returns {Promise<Array>} Array of missing backblast info
 */
async function getMissingBackblasts(date = null, slackApp = null) {
  const result = await getBackblastStatus(date, slackApp);
  return result.missing;
}

/**
 * Send reminder messages for missing backblasts
 * @param {Array} missingBackblasts - Array of missing backblast info
 * @param {Object} slackApp - Slack app instance
 * @param {string} reminderChannel - Channel ID to send reminders to
 * @param {Object} options - Options for what to send { sendChannel, sendDMs }
 * @returns {Promise<Object>} Results of reminder sending
 */
async function sendReminders(missingBackblasts, slackApp, reminderChannel, options = {}) {
  const results = {
    channelMessages: 0,
    directMessages: 0,
    errors: []
  };
  
  // Default to sending both if not specified
  const { sendChannel = true, sendDMs = true } = options;
  
  if (!reminderChannel) {
    reminderChannel = process.env.BACKBLAST_REMINDER_CHANNEL || process.env.SCHEDULE_ADMIN_USER_ID;
  }
  
  for (const missing of missingBackblasts) {
    try {
      // Format the reminder message
      const dateFormatted = new Date(missing.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      const qInfo = missing.scheduledQ 
        ? (missing.scheduledQ.userId 
            ? `\n*Scheduled Q:* <@${missing.scheduledQ.userId}> (${missing.scheduledQ.f3Name})`
            : `\n*Scheduled Q:* ${missing.scheduledQ.f3Name}`)
        : '\n*Scheduled Q:* Not assigned';
      
      const siteQInfo = missing.siteQs.length > 0
        ? missing.siteQs.map(sq => sq.userId ? `<@${sq.userId}>` : sq.f3Name).join(', ')
        : 'None listed';
      
      const channelMessage = {
        channel: reminderChannel,
        text: `Missing backblast reminder`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Missing Backblast',
              emoji: true
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*AO:* ${missing.channelName}\n*Date:* ${dateFormatted}\n*Time:* ${missing.startTime}${qInfo}\n*Site Qs:* ${siteQInfo}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Please post a backblast for this workout.'
              }
            ]
          }
        ]
      };
      
      // Send to reminder channel (if enabled)
      if (sendChannel) {
        await slackApp.client.chat.postMessage(channelMessage);
        results.channelMessages++;
      }
      
      // Send DMs to Site Qs (if enabled and they have Slack user IDs)
      if (sendDMs) {
        for (const siteQ of missing.siteQs) {
        if (siteQ.userId) {
          try {
            const dmMessage = {
              channel: siteQ.userId,
              text: `Missing backblast reminder for ${missing.aoName}`,
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: '⚠️ Missing Backblast Reminder',
                    emoji: true
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `Hi! There's a missing backblast for *${missing.aoName}* on *${dateFormatted}*.${qInfo}\n\nAs a Site Q for this AO, please check if a backblast was posted or follow up with the Q.`
                  }
                },
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'Go to AO Channel'
                      },
                      url: `slack://channel?team=T0188A7KBLB&id=${missing.channelId}`
                    }
                  ]
                }
              ]
            };
            
            await slackApp.client.chat.postMessage(dmMessage);
            results.directMessages++;
          } catch (dmError) {
            console.error(`Failed to send DM to ${siteQ.f3Name}:`, dmError.message);
            results.errors.push({
              type: 'dm',
              siteQ: siteQ.f3Name,
              error: dmError.message
            });
          }
        }
      }
      
      // Also try to DM the scheduled Q if different from Site Qs (if DMs enabled)
      if (sendDMs && missing.scheduledQ && missing.scheduledQ.userId) {
        const isAlsoSiteQ = missing.siteQs.some(sq => sq.userId === missing.scheduledQ.userId);
        
        if (!isAlsoSiteQ) {
          try {
            const qDmMessage = {
              channel: missing.scheduledQ.userId,
              text: `Missing backblast reminder for ${missing.aoName}`,
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: '⚠️ Missing Backblast Reminder',
                    emoji: true
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `Hi! You were scheduled to Q at *${missing.aoName}* on *${dateFormatted}* at *${missing.startTime}*.\n\nWe don't have a backblast posted yet. Please post your backblast when you get a chance!`
                  }
                },
                {
                  type: 'actions',
                  elements: [
                    {
                      type: 'button',
                      text: {
                        type: 'plain_text',
                        text: 'Go to AO Channel'
                      },
                      url: `slack://channel?team=T0188A7KBLB&id=${missing.channelId}`
                    }
                  ]
                }
              ]
            };
            
            await slackApp.client.chat.postMessage(qDmMessage);
            results.directMessages++;
          } catch (qDmError) {
            console.error(`Failed to send DM to Q ${missing.scheduledQ.f3Name}:`, qDmError.message);
            results.errors.push({
              type: 'q_dm',
              q: missing.scheduledQ.f3Name,
              error: qDmError.message
            });
          }
        }
      }
      } // End of if (sendDMs)
      
    } catch (error) {
      console.error(`Failed to send reminder for ${missing.aoName}:`, error.message);
      results.errors.push({
        type: 'channel',
        ao: missing.aoName,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Send admin notification about missing Slack IDs
 * @param {Object} missingSlackIds - Object with missing AOs and Site Qs
 * @param {Object} slackApp - Slack app instance
 * @param {string} adminUserId - Admin user ID to notify
 * @returns {Promise<Object>} Results of notification sending
 */
async function sendMissingSlackIdNotification(missingSlackIds, slackApp, adminUserId) {
  const results = {
    sent: false,
    error: null
  };
  
  // Only send if there are missing IDs
  const hasAos = missingSlackIds.aos && missingSlackIds.aos.length > 0;
  const hasSiteQs = missingSlackIds.siteQs && missingSlackIds.siteQs.length > 0;
  
  if (!hasAos && !hasSiteQs) {
    return results;
  }
  
  if (!adminUserId) {
    adminUserId = process.env.SCHEDULE_ADMIN_USER_ID;
  }
  
  if (!adminUserId) {
    results.error = 'No admin user ID configured';
    return results;
  }
  
  try {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Missing Slack IDs in GloomSchedule',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'The following AOs and Site Qs are missing their Slack IDs in GloomSchedule. This prevents sending reminders and affects the backblast reminder system.'
        }
      }
    ];
    
    // Add AOs section if any missing
    if (hasAos) {
      const aoList = missingSlackIds.aos.map(ao => `• *${ao.name}* - ${ao.issue}`).join('\n');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*AOs Missing Channel IDs:*\n${aoList}`
        }
      });
    }
    
    // Add Site Qs section if any missing
    if (hasSiteQs) {
      const siteQList = missingSlackIds.siteQs.map(sq => `• *${sq.name}* (${sq.ao}) - ${sq.issue}`).join('\n');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Site Qs Missing User IDs:*\n${siteQList}`
        }
      });
    }
    
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Please update these IDs in GloomSchedule to ensure proper functionality.'
        }
      ]
    });
    
    await slackApp.client.chat.postMessage({
      channel: adminUserId,
      text: 'Missing Slack IDs detected in GloomSchedule',
      blocks: blocks
    });
    
    results.sent = true;
    console.log(`Sent missing Slack IDs notification to admin ${adminUserId}`);
    
  } catch (error) {
    console.error(`Failed to send missing Slack IDs notification:`, error.message);
    results.error = error.message;
  }
  
  return results;
}

module.exports = {
  getBackblastStatus,
  getMissingBackblasts,
  sendReminders,
  sendMissingSlackIdNotification
};
