/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const GloomScheduleClient = require('./gloomschedule-client');
const slack = require('./slack');

/**
 * Get tomorrow's date in YYYY-MM-DD format
 * @param {string} timezone - Timezone (e.g., 'America/New_York')
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getTomorrowDate(timezone) {
  const now = new Date();
  // Add one day
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  // Format as YYYY-MM-DD
  return tomorrow.toISOString().split('T')[0];
}

/**
 * Map workout types to emojis with day-aware parsing
 * @param {Array<string>} workoutTypes - Array of workout type strings
 * @param {Date} eventDate - Date of the workout event for day-specific parsing
 * @returns {Object} Object with emojis string and unknownTypes array
 */
function getWorkoutTypeEmojis(workoutTypes, eventDate) {
  if (!workoutTypes || workoutTypes.length === 0) {
    return { emojis: '', unknownTypes: [] };
  }
  
  const emojiMap = {
    'running': '🏃',
    'run': '🏃',
    'running with pain stations': '🏃',
    'running w/ pain stations': '🏃',
    'rucking': '🎒',
    'ruck': '🎒',
    'bootcamp': '🥾',
    'kettlebell': '🫖',
    'heavy lifting': '💪',
    'heavy': '💪',
    'swimming': '🏊',
    'cycling': '🚴',
    'yoga': '🧘',
    'gear workout': '⚙️',
    'gear': '⚙️',
    'q school': '🏫',
    'bible study': '📖',
    'topical discussion': '💬',
    'running bootcamp': '🏃🥾',
    'moderate': '',
    '2ndf': '',
    '3rdf': ''
  };
  
  let emojis = '';
  const unknownTypes = [];
  
  // Get day of week abbreviation (Su, Mo, Tu, We, Th, Fr, Sa)
  const dayOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][eventDate.getDay()];
  
  for (const type of workoutTypes) {
    let typesToParse = type;
    
    // Check if this workout type has day-specific prefixes (e.g., "Tu: Bootcamp")
    const dayPrefixRegex = /(Su|Mo|Tu|We|Th|Fr|Sa):\s*([^,]+)/gi;
    const matches = [...type.matchAll(dayPrefixRegex)];
    
    if (matches.length > 0) {
      // Find the entry that matches this event's day
      const dayMatch = matches.find(m => m[1] === dayOfWeek);
      if (dayMatch) {
        typesToParse = dayMatch[2];
      } else {
        // No match for this day - skip it (not unknown, just not applicable today)
        continue;
      }
    }
    
    // Parse the type string (may contain commas)
    const types = typesToParse.split(',').map(t => t.trim().toLowerCase());
    
    for (const t of types) {
      if (!t) continue;
      
      if (emojiMap.hasOwnProperty(t)) {
        emojis += emojiMap[t];
      } else {
        unknownTypes.push(t);
      }
    }
  }
  
  return { emojis, unknownTypes };
}

/**
 * Convert GloomSchedule event to workout format for Slack posting
 * @param {Object} event - Scheduled event from GloomSchedule API
 * @param {Object} aoDetails - AO details with site Q info
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Object} Workout object formatted for Slack
 */
function convertEventToWorkout(event, aoDetails, dateStr) {
  // Check if event is closed (no Q assigned)
  const isClosed = !event.qs || event.qs.length === 0;
  
  // Get the Q name - prefer accepted Q, otherwise first Q
  let theQ = 'TBD';
  if (event.qs && event.qs.length > 0) {
    // Find accepted Q first
    const acceptedQ = event.qs.find(q => q.status === 'accepted');
    const selectedQ = acceptedQ || event.qs[0];
    
    theQ = selectedQ.f3_name;
    
    // Add unconfirmed suffix if Q hasn't accepted
    if (selectedQ.status && selectedQ.status !== 'accepted') {
      theQ += ' (unconfirmed)';
    }
    
    // Add VQ indicator if applicable
    if (selectedQ.is_vq) {
      theQ += ' 🌟';
    }
  }
  
  // Parse event date from dateStr parameter (YYYY-MM-DD)
  const eventDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  
  // Get workout type emojis with day-aware parsing
  const { emojis, unknownTypes } = getWorkoutTypeEmojis(event.workout_types || [], eventDate);
  
  // Format start time (HHmm format without colon, from HH:MM:SS)
  const startTime = event.start_time ? event.start_time.substring(0, 5).replace(':', '') : 'TBD';
  
  return {
    ao: event.ao_name,
    theQ: theQ,
    start: startTime,
    types: emojis,
    location: aoDetails.location || '',
    isClosed: isClosed,
    eventType: event.event_type,
    unknownTypes: unknownTypes
  };
}

/**
 * Post tomorrow's schedule using GloomSchedule API
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - GloomSchedule API key
 * @param {string} options.baseUrl - GloomSchedule API base URL
 * @param {string} options.googleLink - Google Calendar link
 * @param {string} options.icalLink - iCal subscription link
 * @param {string} options.channel - Slack channel ID to post to
 * @param {string} options.adminUser - Admin user ID for notifications
 * @param {string} options.timezone - Timezone (e.g., 'America/New_York')
 * @param {boolean} options.include2ndF - Include 2ndF events (default: false)
 * @param {boolean} options.include3rdF - Include 3rdF events (default: false)
 * @returns {Promise<Object>} Result object with success status and counts
 */
async function postTomorrowsSchedule(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('Options parameter is required');
  }
  
  const { 
    apiKey, 
    baseUrl, 
    googleLink, 
    icalLink, 
    channel, 
    adminUser, 
    timezone,
    include2ndF = false,
    include3rdF = false
  } = options;
  
  // Check all required fields
  const missingFields = [];
  if (!apiKey) missingFields.push('apiKey');
  if (!baseUrl) missingFields.push('baseUrl');
  if (!googleLink) missingFields.push('googleLink');
  if (!icalLink) missingFields.push('icalLink');
  if (!channel) missingFields.push('channel');
  if (!adminUser) missingFields.push('adminUser');
  if (!timezone) missingFields.push('timezone');
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required parameters: ${missingFields.join(', ')}`);
  }
  
  try {
    console.log('[SCHEDULER] Starting schedule post using GloomSchedule API...');
    
    // Get tomorrow's date
    const tomorrowDate = getTomorrowDate(timezone);
    console.log(`[SCHEDULER] Fetching schedule for ${tomorrowDate}`);
    
    // Initialize GloomSchedule client
    const client = new GloomScheduleClient({ apiKey, baseUrl });
    
    // Fetch schedule and AO details
    const [schedule, aoData] = await Promise.all([
      client.getScheduledQs(tomorrowDate),
      client.getAODetails({ activeOnly: true })
    ]);
    
    // Create AO lookup map
    const aoMap = new Map();
    aoData.aos.forEach(ao => {
      aoMap.set(ao.name, ao);
    });
    
    // Filter and convert events to workout format
    const workouts = [];
    const allUnknownTypes = new Set();
    
    for (const event of schedule.scheduled_events) {
      // Filter by event type
      if (event.event_type === '1stF Workout') {
        // Always include 1stF
      } else if (event.event_type === '2ndF' && !include2ndF) {
        continue; // Skip 2ndF unless enabled
      } else if (event.event_type === '3rdF' && !include3rdF) {
        continue; // Skip 3rdF unless enabled
      } else if (!event.event_type.includes('1stF') && !event.event_type.includes('2ndF') && !event.event_type.includes('3rdF')) {
        continue; // Skip other event types
      }
      
      const aoDetails = aoMap.get(event.ao_name) || {};
      const workout = convertEventToWorkout(event, aoDetails, tomorrowDate);
      
      // Track unknown types
      if (workout.unknownTypes && workout.unknownTypes.length > 0) {
        workout.unknownTypes.forEach(t => allUnknownTypes.add(t));
      }
      
      workouts.push(workout);
    }
    
    // Sort by time, then alphabetically by AO name
    workouts.sort((a, b) => {
      const timeCompare = a.start.localeCompare(b.start);
      if (timeCompare !== 0) return timeCompare;
      return a.ao.localeCompare(b.ao);
    });
    
    // Handle empty schedule (post nothing - silent)
    if (workouts.length === 0) {
      console.log('[SCHEDULER] No workouts found for tomorrow (silent)');
      return { success: true, count: 0, message: 'No workouts scheduled' };
    }
    
    console.log(`[SCHEDULER] Found ${workouts.length} workouts for tomorrow`);
    
    // Notify admin about unknown workout types
    if (allUnknownTypes.size > 0) {
      console.log(`[SCHEDULER] Found ${allUnknownTypes.size} unknown workout types`);
      const unknownMessage = `⚠️ *Unknown Workout Types Detected*\n\n` +
        Array.from(allUnknownTypes).map(t => `• ${t}`).join('\n') +
        `\n\nPlease add these types to the emoji mapping in lib/scheduler-gloomschedule.js`;
      
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
      unknownTypes: allUnknownTypes.size
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
  postTomorrowsSchedule,
  getTomorrowDate,
  convertEventToWorkout,
  getWorkoutTypeEmojis
};
