/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const { ExpressReceiver, App } = require('@slack/bolt');

// Create receiver
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

// Initialize app with token check
const hasToken = Boolean(process.env.SLACK_BOT_TOKEN);
let app;
if (hasToken) {
  app = new App({ token: process.env.SLACK_BOT_TOKEN, receiver });
} else {
  // Minimal stub for local testing when no bot token is provided.
  app = {
    client: {
      chat: {
        postMessage: async () => { throw new Error('SLACK_BOT_TOKEN not set'); },
        update: async () => { throw new Error('SLACK_BOT_TOKEN not set'); },
        postEphemeral: async () => { /* noop for local */ }
      }
    },
    action: () => { /* noop: cannot register Slack actions without Bolt App */ },
    start: async (port) => {
      return new Promise((resolve, reject) => {
        const server = receiver.app.listen(port, () => {
          console.log(`Receiver listening on ${port}`);
          resolve(server);
        });
      });
    }
  };
  console.warn('Warning: SLACK_BOT_TOKEN is not set. App will run in limited local mode.');
}

// Helper function to get blocked user IDs
function getBlockedUserIds() {
  const blockedUsers = process.env.HC_BLOCKED_USERS || '';
  return blockedUsers.split(',').map(id => id.trim()).filter(id => id);
}

// Helper function to filter blocked users from HC list text
function filterBlockedUsersFromText(text) {
  const blockedUserIds = getBlockedUserIds();
  if (blockedUserIds.length === 0) {
    return text;
  }
  
  const lines = text.split('\n');
  const newLines = [];
  
  for (let line of lines) {
    if (line.includes('*Committed:*')) {
      // Extract all user mentions
      const mentions = line.match(/<@[A-Z0-9]+>/g) || [];
      
      // Filter out blocked users
      const filteredMentions = mentions.filter(mention => {
        const userId = mention.replace(/<@|>/g, '');
        return !blockedUserIds.includes(userId);
      });
      
      // Reconstruct the line
      if (filteredMentions.length === 0) {
        newLines.push('*Committed:* None yet');
      } else {
        const count = filteredMentions.length;
        newLines.push('*Committed:* ' + filteredMentions.join(' ') + ` (${count})`);
      }
    } else {
      newLines.push(line);
    }
  }
  
  return newLines.join('\n');
}

// Action handler for the commit button
app.action('commit_event', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    console.log(`[ACTION] commit_event received from user=${body && body.user && body.user.id}`);
  } catch (e) {}
  
  try {
    const userId = body.user.id;
    
    // Check if user is blocked from using HC button
    const blockedUserIds = getBlockedUserIds();
    
    if (blockedUserIds.includes(userId)) {
      console.log(`[ACTION] Blocked user ${userId} attempted to HC`);
      
      // Send Dennis Nedry GIF
      await client.chat.postEphemeral({
        channel: body.channel.id,
        user: userId,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Ah ah ah! You didn\'t say the magic word!* 🦖'
            }
          },
          {
            type: 'image',
            image_url: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3NmeDc3YTRucWJtM2F2ZWdocDl4ODZmbHBocWdnbTViajNnZjVlaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ohzdQ1IynzclJldUQ/giphy.gif',
            alt_text: 'Dennis Nedry - Ah ah ah!'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '_You are not authorized to commit to this event._'
            }
          }
        ],
        text: 'Ah ah ah! You didn\'t say the magic word!'
      });
      
      return; // Stop processing
    }
    
    const channel = body.channel.id;
    const ts = body.message.ts;
    
    // Fetch the latest message state to avoid stale data
    let msgResp = null;
    try {
      msgResp = await client.conversations.history({ 
        channel, 
        latest: ts, 
        inclusive: true, 
        limit: 1
      });
    } catch (err) {
      console.error('[WARN] conversations.history failed, falling back to body.message', err && err.data ? err.data : err);
    }
    
    // Use fetched message if available, otherwise fall back to body
    const message = (msgResp && msgResp.messages && msgResp.messages[0]) || body.message || {};
    const blocks = message.blocks || body.message.blocks || [];

    // Find the commits block
    const commitsIndex = blocks.findIndex(b => b.block_id === 'commits');
    if (commitsIndex === -1) {
      logger.warn('Commits block not found');
      return;
    }

    const commitsBlock = blocks[commitsIndex];
    let text = (commitsBlock.text && commitsBlock.text.text) || '';

    const mention = `<@${userId}>`;
    if (text.includes(mention)) {
      // already committed — send ephemeral with uncommit button
      await client.chat.postEphemeral({
        channel,
        user: userId,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: 'You are already committed to this event.' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Uncommit' }, style: 'danger', action_id: 'uncommit_event', value: JSON.stringify({ channel, ts }) }
          ] }
        ],
        text: 'You are already committed to this event.'
      });
      return;
    }

    // Split text by lines to find and update the Committed line
    const lines = text.split('\n');
    let newLines = [];
    let foundCommitLine = false;
    
    for (let line of lines) {
      if (line.includes('*Committed:*')) {
        foundCommitLine = true;
        
        // Extract current mentions and filter out blocked users
        const currentMentions = line.match(/<@[A-Z0-9]+>/g) || [];
        const filteredMentions = currentMentions.filter(m => {
          const uid = m.replace(/<@|>/g, '');
          return !blockedUserIds.includes(uid);
        });
        
        // Add the new user
        filteredMentions.push(mention);
        const newCount = filteredMentions.length;
        
        // Log if we removed any blocked users
        const removedCount = currentMentions.length - filteredMentions.length + 1;
        if (removedCount > 0 && currentMentions.length > 0) {
          console.log(`[HC_FILTER] Removed ${removedCount - 1} blocked user(s) from HC list`);
        }
        
        // Reconstruct the line
        newLines.push('*Committed:* ' + filteredMentions.join(' ') + ` (${newCount})`);
      } else {
        newLines.push(line);
      }
    }
    
    // If no commit line found, add one
    if (!foundCommitLine) {
      newLines.push('*Committed:* ' + mention + ' (1)');
    }

    // Update the blocks array copy
    const newBlocks = JSON.parse(JSON.stringify(blocks));
    newBlocks[commitsIndex].text.text = newLines.join('\n');

    // Add metadata to force client refresh
    await client.chat.update({ 
      channel, 
      ts, 
      blocks: newBlocks, 
      text: message.text || body.message.text || 'Event update',
      metadata: {
        event_type: 'commit_update',
        event_payload: {
          updated_at: Date.now(),
          user_id: userId
        }
      }
    });
    // Send an ephemeral confirmation with an Uncommit button (only visible to this user)
    await client.chat.postEphemeral({
      channel,
      user: userId,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: 'You committed to this event!' } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Uncommit' }, style: 'danger', action_id: 'uncommit_event', value: JSON.stringify({ channel, ts }) }
        ] }
      ],
      text: 'You committed to this event!'
    });
  } catch (err) {
    logger.error(err);
  }
});

// Handler for uncommit button (received from ephemeral message)
app.action('uncommit_event', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    console.log(`[ACTION] uncommit_event received from user=${body && body.user && body.user.id}`);
  } catch (e) {}
  try {
    const userId = body.user.id;
    // The value contains the channel and ts of the original message
    const payload = body.actions && body.actions[0] && body.actions[0].value ? JSON.parse(body.actions[0].value) : {};
    const channel = payload.channel || (body.channel && body.channel.id);
    const ts = payload.ts || (body.message && body.message.ts);

    if (!channel || !ts) {
      // Cannot locate original message
      await client.chat.postEphemeral({ channel: channel || body.channel.id, user: userId, text: 'Could not locate the event message.' });
      return;
    }

    // Fetch the original message to get the latest blocks state
    // Always fetch fresh data to avoid cache issues between clients
    let msgResp = null;
    try {
      msgResp = await client.conversations.history({ 
        channel, 
        latest: ts, 
        inclusive: true, 
        limit: 1
      });
    } catch (err) {
      console.error('[WARN] conversations.history failed, falling back to body.message', err && err.data ? err.data : err);
    }
    
    // Use fetched message if available, otherwise fall back to body
    const message = (msgResp && msgResp.messages && msgResp.messages[0]) || body.message || {};
    const blocks = message.blocks || [];

    const commitsIndex = blocks.findIndex(b => b.block_id === 'commits');
    if (commitsIndex === -1) {
      await client.chat.postEphemeral({ channel, user: userId, text: 'No commit list found on the message.' });
      return;
    }

    let text = (blocks[commitsIndex].text && blocks[commitsIndex].text.text) || '';
    const mention = `<@${userId}>`;
    if (!text.includes(mention)) {
      await client.chat.postEphemeral({ channel, user: userId, text: 'You are not committed to this event.' });
      return;
    }

    // Split text by lines to find and update the Committed line
    const lines = text.split('\n');
    let newLines = [];
    
    // Get blocked user IDs to filter them out
    const blockedUserIds = getBlockedUserIds();
    
    for (let line of lines) {
      if (line.includes('*Committed:*')) {
        // Extract all mentions
        const allMentions = line.match(/<@[A-Z0-9]+>/g) || [];
        
        // Remove the uncommitting user AND filter out blocked users
        const filteredMentions = allMentions.filter(m => {
          const uid = m.replace(/<@|>/g, '');
          return m !== mention && !blockedUserIds.includes(uid);
        });
        
        const newCount = filteredMentions.length;
        
        // Log if we removed any blocked users
        const removedBlockedCount = allMentions.length - filteredMentions.length - 1;
        if (removedBlockedCount > 0) {
          console.log(`[HC_FILTER] Removed ${removedBlockedCount} blocked user(s) from HC list during uncommit`);
        }
        
        // Reconstruct the committed line
        if (newCount === 0) {
          newLines.push('*Committed:* None yet');
        } else {
          newLines.push('*Committed:* ' + filteredMentions.join(' ') + ` (${newCount})`);
        }
      } else {
        newLines.push(line);
      }
    }

    const newBlocks = JSON.parse(JSON.stringify(blocks));
    newBlocks[commitsIndex].text.text = newLines.join('\n');

    // Add metadata to force client refresh
    await client.chat.update({ 
      channel, 
      ts, 
      blocks: newBlocks, 
      text: message.text || 'Event update',
      metadata: {
        event_type: 'commit_update',
        event_payload: {
          updated_at: Date.now(),
          user_id: userId
        }
      }
    });

    console.log(`[UNCOMMIT] removed ${userId} from ${channel}:${ts}`);

    await client.chat.postEphemeral({ channel, user: userId, text: 'You have been uncommitted from this event.' });
  } catch (err) {
    logger.error(err);
  }
});

// Exports
// Send DM to admin user
async function sendAdminDM(userId, message) {
  try {
    await app.client.chat.postMessage({
      channel: userId,
      text: message
    });
    console.log(`[SLACK] Sent admin DM to ${userId}`);
  } catch (error) {
    console.error('[SLACK] Failed to send admin DM:', error);
  }
}

// Build workout card blocks
function buildWorkoutCard(workout) {
  // CLOSED workouts: simple text, no button
  if (workout.isClosed) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${workout.ao} [❌] - CLOSED`
        }
      }
    ];
  }
  
  // Regular workouts: compact single-line format with commit button inline
  let mainLine = `*${workout.start}*: ${workout.ao} ${workout.types ? "[" + workout.types + "]" : ''} - ${workout.theQ}`;
  if (workout.location) {
    mainLine += ` - ${workout.location}`;
  }
  mainLine += `\n*Committed:* None yet`;
  
  return [
    {
      type: "section",
      block_id: "commits",
      text: {
        type: "mrkdwn",
        text: mainLine
      },
      accessory: {
        type: "button",
        text: { type: "plain_text", text: "HC" },
        style: "primary",
        action_id: "commit_event",
        value: JSON.stringify({
          ao: workout.ao,
          time: workout.start,
          q: workout.theQ,
          location: workout.location,
          types: workout.types
        })
      }
    }
  ];
}

// Post workout schedule to Slack
async function postWorkoutSchedule(channel, workouts, calendarLinks) {
  const results = [];
  
  try {
    console.log(`[SLACK] Posting schedule to channel ${channel}`);
    
    // Post header
    const headerResult = await app.client.chat.postMessage({
      channel,
      text: "Tomorrow's Schedule",
      unfurl_links: false,
      unfurl_media: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Tomorrow's Schedule:*"
          }
        }
      ]
    });
    results.push({ type: 'header', ts: headerResult.ts });
    
    // Post each workout as separate message
    for (const workout of workouts) {
      const blocks = buildWorkoutCard(workout);
      const result = await app.client.chat.postMessage({
        channel,
        text: `${workout.start}: ${workout.ao} - ${workout.theQ}`,
        unfurl_links: false,
        unfurl_media: false,
        blocks
      });
      results.push({ 
        type: 'workout', 
        ts: result.ts,
        ao: workout.ao,
        time: workout.start
      });
    }
    
    // Post footer with calendar links
    if (calendarLinks && (calendarLinks.google || calendarLinks.ical)) {
      const footerResult = await app.client.chat.postMessage({
        channel,
        text: "Subscribe to the calendar",
        unfurl_links: false,
        unfurl_media: false,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Subscribe to the calendar: <${calendarLinks.google}|Google> | <${calendarLinks.ical}|iCal>`
              }
            ]
          }
        ]
      });
      results.push({ type: 'footer', ts: footerResult.ts });
    }
    
    console.log(`[SLACK] Posted ${results.length} messages`);
    return results;
  } catch (error) {
    console.error('[SLACK] Error posting schedule:', error);
    throw error;
  }
}

module.exports = {
  receiver,
  app,
  sendAdminDM,
  postWorkoutSchedule
};
