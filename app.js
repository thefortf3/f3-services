require('dotenv').config()
const { ExpressReceiver, App } = require('@slack/bolt');
express = require('express');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

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

// Helper to build event message blocks
function buildEventBlocks({ title, description, when, where }){
  return [
    { type: 'header', text: { type: 'plain_text', text: title || 'Upcoming Event' } },
    { type: 'section', text: { type: 'mrkdwn', text: description || 'Details coming soon.' } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*When:*
${when || 'TBD'}` },
      { type: 'mrkdwn', text: `*Where:*
${where || 'TBD'}` }
    ] },
    { type: 'section', block_id: 'commits', text: { type: 'mrkdwn', text: '*Committed:* None yet' } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Commit' }, style: 'primary', action_id: 'commit_event', value: JSON.stringify({}) }
    ] }
  ];
}


// HTTP endpoint to post an event into a channel
receiver.app.use(require('express').json());


const pm = require("./lib/paxminer");
const wordpress = require("./lib/wordpress");
const pb = require("./lib/preblast");
//const slack = require('./lib/slack')

receiver.app.use(
  express.urlencoded({
    extended: true,
  })
);

const PORT = process.env.PORT || 5000;

receiver.app.get("/", (req, res) => res.redirect("/api/heartbeat"));

receiver.app.get("/api/heartbeat", (req, res) => res.send("Ok"));

receiver.app.get("/api/bbcheck/", (req, res) => 
  pm.getBBs(results => {
    res.header("Content-Type", "application/json");
      res.send(JSON.stringify(results, null, 4));
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })
);

receiver.app.get("/api/postbbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp'])
  let resultJson = {}
  resultJson['count'] = 0
  resultJson['last'] = timestamp
  pm.getBBDataSince(timestamp, results => {
      postBBs(results, timestamp).then(resultsJson => {
        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })

  
});

receiver.app.get("/api/postpbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp'])
  let resultJson = {}
  resultJson['count'] = 0
  resultJson['last'] = timestamp;

  pb.searchPreblastPosts(timestamp).then(results => {
      postPBs(results, timestamp).then(resultsJson => {
        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
      console.log(err);
      res.send("Error: " + err);

  });
  
});

receiver.app.post('/post_event', async (req, res) => {
  try {
    const { channel, title, description, when, where } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel is required' });

    const result = await app.client.chat.postMessage({
      channel,
      text: title || 'Upcoming event',
      blocks: buildEventBlocks({ title, description, when, where })
    });

    res.json({ ok: true, ts: result.ts, channel: result.channel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

receiver.app.post("/api/addvq", (req, res) => {
  ao = req.body['ao']
  pax = req.body['pax']
  date = req.body['date']
  pm.addVQ(date, pax, ao, (err) => {
    if (err) {
      console.log(err);
      res.send("Error: " + err);
    } else {
      res.send("Ok")
    }

  })
  
}
);

async function postPBs(preblasts, timestamp) {
  let resultJson = {}
  resultJson['last'] = timestamp
  resultJson['count'] = 0
  try {
      for (let i=0; i < preblasts.length; i++) {
        let r = preblasts[i];
        console.log(r.Preblast);
        retval= wordpress.postToWordpress(
            r.Preblast, 
            r.Date + " " + r.Time + ":00", 
            r.Q, 
            null,
            r.Where, 
            [], 
            r.Content,
            true)
 
      if (r.Timestamp > resultJson['last']) {
        resultJson['last'] = r.Timestamp;
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error)
    
  }
  return resultJson
}

async function postBBs(backblasts, timestamp) {
  let resultJson = {}
  resultJson['last'] = timestamp
  resultJson['count'] = 0
  try {
    for(let i=0; i < backblasts.length; i++) {
      let bb = backblasts[i]
      console.log(bb)

      retval = wordpress.postToWordpress(
          bb.title, 
          bb.date, 
          bb.q, 
          ('coq' in bb) ? bb.coq : null, 
          bb.ao, 
          bb.pax, 
          bb.backblast)
      if (bb.timestamp > resultJson['last']) {
        resultJson['last'] = bb.timestamp
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error)
    
  }
  return resultJson
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

    // If 'None yet', replace it
    if (text.includes('None yet')) {
      text = '*Committed:*\n' + mention;
    } else {
      // Append on a new line
      text = text + '\n' + mention;
    }

    // Update the blocks array copy
    const newBlocks = JSON.parse(JSON.stringify(blocks));
    newBlocks[commitsIndex].text.text = text;

    await client.chat.update({ channel, ts, blocks: newBlocks, text: body.message.text || 'Event update' });
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

    // Fetch the original message to get blocks. If the call fails (missing scope),
    // fall back to using the `body.message` payload supplied with the action.
    let msgResp = null;
    try {
      msgResp = await client.conversations.history({ channel, latest: ts, inclusive: true, limit: 1 });
    } catch (err) {
      console.error('[WARN] conversations.history failed, falling back to body.message', err && err.data ? err.data : err);
    }
    const message = (msgResp && msgResp.messages && msgResp.messages[0]) || body.message || {};
    const blocks = message.blocks || body.message.blocks || [];

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

    // Remove the user's mention line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const filtered = lines.filter(l => l !== mention && l !== `*Committed:*`);
    let newText = '*Committed:* None yet';
    if (filtered.length > 0) {
      newText = '*Committed:*\n' + filtered.join('\n');
    }

    const newBlocks = JSON.parse(JSON.stringify(blocks));
    newBlocks[commitsIndex].text.text = newText;

    await client.chat.update({ channel, ts, blocks: newBlocks, text: message.text || 'Event update' });

    console.log(`[UNCOMMIT] removed ${userId} from ${channel}:${ts}`);

    await client.chat.postEphemeral({ channel, user: userId, text: 'You have been uncommitted from this event.' });
  } catch (err) {
    logger.error(err);
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`Slack app running on port ${port}`);
})();
