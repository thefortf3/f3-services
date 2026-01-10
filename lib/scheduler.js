/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const calendar = require('./calendar');
const slack = require('./slack');

async function postTomorrowsSchedule(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('Options parameter is required');
  }
  
  const { icsUrl, googleLink, icalLink, showLocation, channel, adminUser, timezone } = options;
  
  // Check all required fields
  const missingFields = [];
  if (!icsUrl) missingFields.push('icsUrl');
  if (!googleLink) missingFields.push('googleLink');
  if (!icalLink) missingFields.push('icalLink');
  if (showLocation === undefined) missingFields.push('showLocation');
  if (!channel) missingFields.push('channel');
  if (!adminUser) missingFields.push('adminUser');
  if (!timezone) missingFields.push('timezone');
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required parameters: ${missingFields.join(', ')}`);
  }
  
  try {
    console.log('[SCHEDULER] Starting schedule post...');
    
    // Fetch workouts
    const { workouts, unknownTypes } = await calendar.getTomorrowsWorkouts(icsUrl, timezone, showLocation);
    
    // Handle empty schedule (post nothing - silent)
    if (workouts.length === 0) {
      console.log('[SCHEDULER] No workouts found for tomorrow (silent)');
      return { success: true, count: 0, message: 'No workouts scheduled' };
    }
    
    console.log(`[SCHEDULER] Found ${workouts.length} workouts for tomorrow`);
    
    // Notify admin about unknown workout types
    if (unknownTypes.length > 0) {
      console.log(`[SCHEDULER] Found ${unknownTypes.length} unknown workout types`);
      const unknownMessage = `⚠️ *Unknown Workout Types Detected*\n\n` +
        unknownTypes.map(u => 
          `• *${u.ao}*: ${u.types.join(', ')}\n  _Original: ${u.description}_`
        ).join('\n\n') +
        `\n\nPlease add these types to the emoji mapping in lib/calendar.js`;
      
      await slack.sendAdminDM(adminUser, unknownMessage);
    }
    
    // Post to Slack
    const calendarLinks = {
      google: googleLink,
      ical: icalLink
    };
    
    const result = await slack.postWorkoutSchedule(
      channel,
      workouts,
      calendarLinks
    );
    
    console.log(`[SCHEDULER] Successfully posted ${result.length} messages`);
    return { 
      success: true, 
      count: workouts.length, 
      messages: result.length,
      unknownTypes: unknownTypes.length
    };
    
  } catch (error) {
    console.error('[SCHEDULER] Error posting schedule:', error);
    
    // Notify admin about failure
    const errorMessage = `❌ *Schedule Post Failed*\n\n` +
      `*Error:* ${error.message}\n` +
      `*Time:* ${new Date().toLocaleString('en-US', { timeZone: timezone })}\n\n` +
      `Check server logs for details.`;
    
    try {
      await slack.sendAdminDM(adminUser, errorMessage);
    } catch (dmError) {
      console.error('[SCHEDULER] Failed to send error notification:', dmError);
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}

module.exports = {
  postTomorrowsSchedule
};
