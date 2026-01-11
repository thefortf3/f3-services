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

// Action handler for the commit button
app.action('commit_event', async ({ ack, body, client, logger }) => {
  await ack();
  try {
    console.log(`[ACTION] commit_event received from user=${body && body.user && body.user.id}`);
  } catch (e) {}
  try {
    const userId = body.user.id;
    const channel = body.channel.id;
    const ts = body.message.ts;
    const blocks = body.message.blocks || [];

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
        if (line.includes('None yet')) {
          newLines.push('*Committed:* ' + mention);
        } else {
          newLines.push(line + ' ' + mention);
        }
      } else {
        newLines.push(line);
      }
    }
    
    // If no commit line found, add one
    if (!foundCommitLine) {
      newLines.push('*Committed:* ' + mention);
    }

    // Update the blocks array copy
    const newBlocks = JSON.parse(JSON.stringify(blocks));
    newBlocks[commitsIndex].text.text = newLines.join('\n');

    // Add metadata to force client refresh
    await client.chat.update({ 
      channel, 
      ts, 
      blocks: newBlocks, 
      text: body.message.text || 'Event update',
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
    
    for (let line of lines) {
      if (line.includes('*Committed:*')) {
        // Remove the user's mention from the space-separated list on this line
        const parts = line.split(/\s+/);
        const filtered = parts.filter(p => p !== mention);
        
        // Reconstruct the committed line
        if (filtered.length === 1) {
          // Only "*Committed:*" left, no other mentions
          newLines.push('*Committed:* None yet');
        } else {
          // filtered[0] should be "*Committed:*", rest are mentions
          newLines.push(filtered.join(' '));
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
