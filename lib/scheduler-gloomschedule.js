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
  // Get current date/time in the specified timezone
  const now = new Date();
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  
  // Add one day
  const tomorrow = new Date(nowInTimezone.getTime() + 24 * 60 * 60 * 1000);
  
  // Format as YYYY-MM-DD
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
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
 * Normalize event type to 1stF, 2ndF, or 3rdF
 * @param {string} eventType - Event type from GloomSchedule
 * @returns {string} Normalized type (1stF, 2ndF, 3rdF, or original)
 */
function normalizeEventType(eventType) {
  if (!eventType) return null;
  
  const type = eventType.toLowerCase();
  
  // Check for 1stF patterns
  if (type.includes('1stf') || type.includes('1st f') || type === '1stf workout') {
    return '1stF';
  }
  
  // Check for 2ndF patterns
  if (type.includes('2ndf') || type.includes('2nd f')) {
    return '2ndF';
  }
  
  // Check for 3rdF patterns
  if (type.includes('3rdf') || type.includes('3rd f')) {
    return '3rdF';
  }
  
  return null; // Unknown type
}

/**
 * Clean AO name by removing day-of-week patterns
 * @param {string} aoName - Original AO name
 * @returns {string} Cleaned AO name
 */
function cleanAOName(aoName) {
  if (!aoName) return aoName;
  
  // Remove day-of-week patterns in parentheses or after dashes
  // Examples: "Dawn Patrol (Tue)" -> "Dawn Patrol"
  //           "Dawn Patrol - Tuesday" -> "Dawn Patrol"
  //           "Dawn Patrol Tue" -> "Dawn Patrol"
  
  const dayPatterns = [
    /\s*\(?(Mon|Monday|Tue|Tuesday|Wed|Wednesday|Thu|Thursday|Fri|Friday|Sat|Saturday|Sun|Sunday)\)?$/i,
    /\s*-\s*(Mon|Monday|Tue|Tuesday|Wed|Wednesday|Thu|Thursday|Fri|Friday|Sat|Saturday|Sun|Sunday)\s*$/i
  ];
  
  let cleaned = aoName;
  for (const pattern of dayPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // Remove trailing dashes or spaces
  cleaned = cleaned.replace(/[\s-]+$/, '').trim();
  
  return cleaned;
}

/**
 * Convert GloomSchedule event to workout format for Slack posting
 * @param {Object} event - Scheduled event from GloomSchedule API
 * @param {Object} aoDetails - AO details with site Q info
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Object} Workout object formatted for Slack
 */
function convertEventToWorkout(event, aoDetails, dateStr) {
  // Filter out declined Qs - only use accepted or unconfirmed Qs
  const validQs = event.qs ? event.qs.filter(q => q.status !== 'declined') : [];
  
  // Check if event is closed (no valid Q assigned)
  const isClosed = validQs.length === 0;
  
  // Get the Q names - list all valid Qs
  let theQ = 'TBD';
  if (validQs.length > 0) {
    // Build list of all valid Qs with VQ indicator
    const qNames = validQs.map(q => {
      let name = q.f3_name;
      
      // Add VQ indicator if applicable
      if (q.is_vq) {
        name += ' 🌟';
      }
      
      return name;
    });
    
    // Join multiple Qs with commas
    theQ = qNames.join(', ');
  }
  
  // Parse event date from dateStr parameter (YYYY-MM-DD)
  const eventDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  
  // Get workout type emojis with day-aware parsing
  const { emojis, unknownTypes } = getWorkoutTypeEmojis(event.workout_types || [], eventDate);
  
  // Format start time (HHmm format without colon, from HH:MM:SS)
  const startTime = event.start_time ? event.start_time.substring(0, 5).replace(':', '') : 'TBD';
  
  // Clean AO name (remove day-of-week suffixes)
  const cleanedAOName = cleanAOName(event.ao_name);
  
  // Normalize event type to 1stF/2ndF/3rdF
  const normalizedType = normalizeEventType(event.event_type);
  
  return {
    ao: cleanedAOName,
    theQ: theQ,
    start: startTime,
    types: emojis,
    type: normalizedType,  // Add normalized type (1stF, 2ndF, 3rdF)
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
 * @param {boolean} options.include1stF - Include 1stF events (default: true)
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
    include1stF = true,
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
      // Normalize event type for filtering
      const normalizedType = normalizeEventType(event.event_type);
      
      // Filter by event type - only include types that are enabled
      if (normalizedType === '1stF' && include1stF) {
        // Include 1stF if enabled
      } else if (normalizedType === '2ndF' && include2ndF) {
        // Include 2ndF if enabled
      } else if (normalizedType === '3rdF' && include3rdF) {
        // Include 3rdF if enabled
      } else {
        // Skip everything else (disabled types, non-F3 events, or unknown types)
        continue;
      }
      
      // Check if AO is shutdown - shutdown date overrides scheduled events
      const aoDetails = aoMap.get(event.ao_name) || {};
      if (aoDetails.shutdown_date) {
        const shutdownDate = new Date(aoDetails.shutdown_date);
        const eventDate = new Date(tomorrowDate);
        
        if (eventDate >= shutdownDate) {
          console.log(`[SCHEDULER] Skipping ${event.ao_name} - AO shutdown on ${aoDetails.shutdown_date}`);
          continue; // Skip workouts for shutdown AOs
        }
      }
      
      const workout = convertEventToWorkout(event, aoDetails, tomorrowDate);
      
      // Skip workouts with no valid Q (closed/TBD)
      if (workout.isClosed) {
        console.log(`[SCHEDULER] Skipping ${event.ao_name} - no valid Q assigned (all Qs declined or none assigned)`);
        continue;
      }
      
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
