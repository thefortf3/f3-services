/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const fetch = require('node-fetch');
const ical = require('node-ical');

// Fetch ICS feed from URL
async function fetchICSFeed(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS feed: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error('[CALENDAR] Error fetching ICS feed:', error);
    throw error;
  }
}

// Parse ICS text into calendar object
async function parseICSFeed(icsText) {
  try {
    return ical.parseICS(icsText);
  } catch (error) {
    console.error('[CALENDAR] Error parsing ICS feed:', error);
    throw error;
  }
}

// Parse event title to extract AO and Q
function parseEventTitle(summary) {
  if (!summary) {
    return { ao: 'Unknown', theQ: 'TBD' };
  }
  
  // Format: "AO Name - Q Name"
  const parts = summary.split(' - ');
  return {
    ao: parts[0] ? parts[0].trim() : 'Unknown',
    theQ: parts[1] ? parts[1].trim() : 'TBD'
  };
}

// Map workout types to emojis with day-aware parsing
function getWorkoutTypeEmojis(description, eventDate) {
  if (!description) {
    return { emojis: '', unknownTypes: [] };
  }
  
  // Get day of week abbreviation (Su, Mo, Tu, We, Th, Fr, Sa)
  const dayOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][eventDate.getDay()];
  
  let typesToUse = description;
  
  // Check if description has day-specific prefixes (e.g., "Tu: Bootcamp, Th: Running")
  const dayPrefixRegex = /(Su|Mo|Tu|We|Th|Fr|Sa):\s*([^,]+)/gi;
  const matches = [...description.matchAll(dayPrefixRegex)];
  
  if (matches.length > 0) {
    // Find the entry that matches this event's day
    const dayMatch = matches.find(m => m[1] === dayOfWeek);
    if (dayMatch) {
      typesToUse = dayMatch[2];
    } else {
      // No match for this day, use full description
      typesToUse = description;
    }
  }
  
  // Emoji mapping (from Google Apps Script)
  const emojiMap = {
    'run': '🏃',
    'ruck': '🎒',
    'gear': '⚙️',
    'bootcamp': '🥾',
    'kettlebell': '🫖',
    'heavy': '💪',
    'bible study': '📖',
    'topical discussion': '💬',
    'q school': '🏫',
    'running bootcamp': '🏃🥾',
    'moderate': '',
    '3rdf': '',
    '2ndf': ''
  };
  
  let emojis = '';
  const unknownTypes = [];
  
  // Split types by comma and process each
  const types = typesToUse.split(',').map(t => t.trim().toLowerCase());
  
  for (const type of types) {
    if (!type) continue;
    
    if (emojiMap.hasOwnProperty(type)) {
      emojis += emojiMap[type];
    } else {
      // Unknown type - add to list for admin notification
      unknownTypes.push(type);
      emojis += '🤷';
    }
  }
  
  return { emojis, unknownTypes };
}

// Filter events for tomorrow (11 PM tonight -> 11:59 PM tomorrow)
function filterTomorrowsEvents(calendar) {
  const now = new Date();
  
  // Start time: 11 PM tonight
  const startTime = new Date(now);
  // Testing only
  // startTime.setDate(now.getDate() + 1);
  startTime.setHours(23, 0, 0, 0);
  
  // End time: 11:59:59 PM tomorrow
  const endTime = new Date(startTime);
  endTime.setDate(startTime.getDate() + 1);
  endTime.setHours(23, 59, 59, 999);
  
  const events = [];
  
  for (const key in calendar) {
    const event = calendar[key];
    if (event.type === 'VEVENT') {
      const eventStart = new Date(event.start);
      if (eventStart >= startTime && eventStart <= endTime) {
        events.push(event);
      }
    }
  }
  
  return events;
}

// Format a single workout event
function formatWorkout(event, unknownTypesCollector, timezone, showLocation) {
  const { ao, theQ } = parseEventTitle(event.summary || '');
  const eventDate = new Date(event.start);
  const { emojis, unknownTypes } = getWorkoutTypeEmojis(
    event.description, 
    eventDate
  );
  
  // Collect unknown types for admin notification
  if (unknownTypes.length > 0) {
    unknownTypesCollector.push({
      ao,
      types: unknownTypes,
      description: event.description
    });
  }
  
  // Format time as HHmm in local timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const timeStr = formatter.format(eventDate).replace(':', '');
  
  return {
    ao,
    theQ,
    types: emojis,
    location: showLocation ? (event.location || null) : null,
    start: timeStr,
    isClosed: theQ.toUpperCase() === 'CLOSED',
    description: event.description || '',
    rawStart: eventDate
  };
}

// Main function: Get tomorrow's workouts
async function getTomorrowsWorkouts(icsUrl, timezone, showLocation) {
  // Validate required parameters
  if (!icsUrl) {
    throw new Error('icsUrl parameter is required');
  }
  if (!timezone) {
    throw new Error('timezone parameter is required');
  }
  if (showLocation === undefined || showLocation === null) {
    throw new Error('showLocation parameter is required');
  }
  
  const unknownTypesCollector = [];
  
  try {
    console.log('[CALENDAR] Fetching ICS feed from:', icsUrl);
    
    // 1. Fetch ICS feed
    const icsText = await fetchICSFeed(icsUrl);
    
    // 2. Parse ICS
    const calendar = await parseICSFeed(icsText);
    
    // 3. Filter tomorrow's events
    const tomorrowEvents = filterTomorrowsEvents(calendar);
    console.log(`[CALENDAR] Found ${tomorrowEvents.length} events for tomorrow`);
    
    // 4. Format each event
    const workouts = tomorrowEvents.map(event => 
      formatWorkout(event, unknownTypesCollector, timezone, showLocation)
    );
    
    // 5. Sort by time, then alphabetically by AO
    workouts.sort((a, b) => {
      const timeCompare = a.start.localeCompare(b.start);
      if (timeCompare !== 0) return timeCompare;
      return a.ao.localeCompare(b.ao);
    });
    
    console.log(`[CALENDAR] Parsed and sorted ${workouts.length} workouts`);
    
    return { workouts, unknownTypes: unknownTypesCollector };
    
  } catch (error) {
    console.error('[CALENDAR] Error in getTomorrowsWorkouts:', error);
    throw error;
  }
}

module.exports = {
  getTomorrowsWorkouts,
  fetchICSFeed,        // Exported for testing
  parseEventTitle,     // Exported for testing
  getWorkoutTypeEmojis // Exported for testing
};
