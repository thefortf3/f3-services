require('dotenv').config();
const express = require('express');

// Import service modules
const slack = require('./lib/slack');
const pm = require("./lib/paxminer");
const wordpress = require("./lib/wordpress");
const pb = require("./lib/preblast");
const calendar = require('./lib/calendar');
const scheduler = require('./lib/scheduler');
const backblastReminder = require('./lib/backblast-reminder');

// Use the receiver's Express app for routes
const app = slack.receiver.app;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Health check routes
app.get("/", (req, res) => res.redirect("/api/heartbeat"));
app.get("/api/heartbeat", (req, res) => res.send("Ok"));

// PAXminer routes
app.get("/api/bbcheck/", (req, res) => 
  pm.getBBs(results => {
    res.header("Content-Type", "application/json");
    res.send(JSON.stringify(results, null, 4));
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })
);

app.get("/api/postbbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp']);
  let resultJson = {};
  resultJson['count'] = 0;
  resultJson['last'] = timestamp;
  pm.getBBDataSince(timestamp, results => {
    postBBs(results, timestamp).then(resultsJson => {
      res.header("Content-Type", "application/json");
      res.send(JSON.stringify(resultsJson, null, 4));
    });
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  });
});

app.get("/api/postpbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp']);
  let resultJson = {};
  resultJson['count'] = 0;
  resultJson['last'] = timestamp;

  pb.searchPreblastPosts(timestamp).then(results => {
    postPBs(results, timestamp).then(resultsJson => {
      res.header("Content-Type", "application/json");
      res.send(JSON.stringify(resultsJson, null, 4));
    });
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  });
});

app.post("/api/addvq", (req, res) => {
  const ao = req.body['ao'];
  const pax = req.body['pax'];
  const date = req.body['date'];
  pm.addVQ(date, pax, ao, (err) => {
    if (err) {
      console.log(err);
      res.send("Error: " + err);
    } else {
      res.send("Ok");
    }
  });
});

// Test calendar feed - fetch and return parsed data
app.post('/api/calendar_test', async (req, res) => {
  try {
    const icsUrl = req.body.icsUrl;
    const timezone = req.body.timezone || 'America/New_York';
    const showLocation = req.body.showLocation !== undefined ? req.body.showLocation : true;
    
    if (!icsUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'icsUrl is required' 
      });
    }
    
    const { workouts, unknownTypes } = await calendar.getTomorrowsWorkouts(icsUrl, timezone, showLocation);
    res.json({
      success: true,
      count: workouts.length,
      workouts: workouts,
      unknownTypes: unknownTypes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Manual trigger for posting schedule
app.post('/api/post_schedule', async (req, res) => {
  try {
    // All parameters are required
    const options = {
      icsUrl: req.body.icsUrl,
      googleLink: req.body.googleLink,
      icalLink: req.body.icalLink,
      showLocation: req.body.showLocation,
      channel: req.body.channel,
      adminUser: req.body.adminUser,
      timezone: req.body.timezone
    };
    
    const result = await scheduler.postTomorrowsSchedule(options);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Check for missing backblasts and optionally send reminders
app.get('/api/check_missing_backblasts', async (req, res) => {
  try {
    // Get date from query param or default to yesterday
    let targetDate;
    if (req.query.date) {
      targetDate = new Date(req.query.date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid date format. Use YYYY-MM-DD' 
        });
      }
    } else {
      // Default to yesterday
      targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - 1);
    }

    // Format date as YYYY-MM-DD
    const dateStr = targetDate.toISOString().split('T')[0];

    // Get backblast status (found and missing)
    const status = await backblastReminder.getBackblastStatus(dateStr);

    // Check which types of reminders to send
    // Legacy 'send=true' enables both channel and DMs
    const legacySend = req.query.send === 'true';
    const sendChannel = req.query.sendChannel === 'true' || legacySend;
    const sendDMs = req.query.sendDMs === 'true' || legacySend;
    const shouldSend = sendChannel || sendDMs;

    let reminderResults = null;
    let missingIdNotification = null;
    
    if (shouldSend) {
      const reminderChannel = process.env.BACKBLAST_REMINDER_CHANNEL;
      if (sendChannel && !reminderChannel) {
        return res.status(500).json({ 
          success: false, 
          error: 'BACKBLAST_REMINDER_CHANNEL not configured in environment' 
        });
      }

      reminderResults = await backblastReminder.sendReminders(
        status.missing, 
        slack.app, 
        reminderChannel,
        { sendChannel, sendDMs }
      );
      
      // Send notification about missing Slack IDs if any
      const adminUserId = process.env.SCHEDULE_ADMIN_USER_ID;
      if (status.missingSlackIds && adminUserId) {
        missingIdNotification = await backblastReminder.sendMissingSlackIdNotification(
          status.missingSlackIds,
          slack.app,
          adminUserId
        );
      }
    }

    res.json({
      success: true,
      date: dateStr,
      totalScheduled: status.found.length + status.missing.length,
      foundCount: status.found.length,
      missingCount: status.missing.length,
      foundBackblasts: status.found,
      missingBackblasts: status.missing,
      missingSlackIds: status.missingSlackIds,
      remindersSent: shouldSend,
      remindersConfig: shouldSend ? { sendChannel, sendDMs } : null,
      reminderResults: reminderResults,
      missingIdNotification: missingIdNotification
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// Helper function to post preblasts to WordPress
async function postPBs(preblasts, timestamp) {
  let resultJson = {};
  resultJson['last'] = timestamp;
  resultJson['count'] = 0;
  try {
    for (let i = 0; i < preblasts.length; i++) {
      let r = preblasts[i];
      console.log(r.Preblast);
      wordpress.postToWordpress(
        r.Preblast, 
        r.Date + " " + r.Time + ":00", 
        r.Q, 
        null,
        r.Where, 
        [], 
        r.Content,
        true
      );
 
      if (r.Timestamp > resultJson['last']) {
        resultJson['last'] = r.Timestamp;
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error);
  }
  return resultJson;
}

// Helper function to post backblasts to WordPress
async function postBBs(backblasts, timestamp) {
  let resultJson = {};
  resultJson['last'] = timestamp;
  resultJson['count'] = 0;
  try {
    for (let i = 0; i < backblasts.length; i++) {
      let bb = backblasts[i];
      console.log(bb);

      wordpress.postToWordpress(
        bb.title, 
        bb.date, 
        bb.q, 
        ('coq' in bb) ? bb.coq : null, 
        bb.ao, 
        bb.pax, 
        bb.backblast
      );
      if (bb.timestamp > resultJson['last']) {
        resultJson['last'] = bb.timestamp;
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error);
  }
  return resultJson;
}

// Start the Slack app
(async () => {
  await slack.app.start(PORT);
  console.log(`Slack app running on port ${PORT}`);
})();
