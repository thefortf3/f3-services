# Schedule Posting Migration - Fix Summary

## Date: January 19, 2026

## Problem
The new GloomSchedule-based schedule posting endpoint (`/api/post_schedule_v2`) was not producing messages that matched the existing ICS-based endpoint (`/api/post_schedule`).

## Root Causes Identified

### 1. Time Format Mismatch
- **Old**: `0500` (HHmm format, no colon)
- **New**: `05:00` (HH:MM format, with colon)
- **Fix**: Changed `lib/scheduler-gloomschedule.js` line 131 to remove colon: `.replace(':', '')`

### 2. Emoji Mapping Incomplete
- **Problem**: GloomSchedule API returns capitalized workout types (`Run`, `Ruck`, `Gear`) but emoji map only had lowercase versions
- **Fix**: Added case-insensitive matching (line 50) and expanded emoji map to include:
  - `run` (in addition to `running`)
  - `ruck` (in addition to `rucking`)
  - `gear` (in addition to `gear workout`)
  - `heavy` (in addition to `heavy lifting`)
  - `bible study`, `topical discussion`, `running bootcamp`

### 3. Q Status Display
- **Problem**: Old scheduler shows "(unconfirmed)" suffix for Qs who haven't accepted, new scheduler didn't
- **Fix**: Added status check in `convertEventToWorkout()` function (lines 90-93)

### 4. Multiple Qs Handling
- **Problem**: When multiple Qs are assigned (e.g., one declined, one accepted), old scheduler shows accepted Q, new scheduler showed first Q
- **Fix**: Changed logic to prefer accepted Q (lines 84-85): `const acceptedQ = event.qs.find(q => q.status === 'accepted')`

### 5. Day-Specific Workout Types
- **Problem**: Some AOs have day-specific types like "Tu: Bootcamp, Th: Running with Pain Stations"
- **Fix**: Implemented day-aware parsing in `getWorkoutTypeEmojis()` function:
  - Parse day prefixes (Su, Mo, Tu, We, Th, Fr, Sa)
  - Match against event's day of week
  - Only show emoji for matching day

### 6. Missing Event Date
- **Problem**: GloomSchedule API doesn't return event date in the response
- **Fix**: Pass the date string as parameter to `convertEventToWorkout()` function

### 7. Sorting Order
- **Problem**: Old scheduler sorts by time then AO name, new scheduler only sorted by time
- **Fix**: Updated sort function (lines 244-248) to match old behavior:
  ```javascript
  workouts.sort((a, b) => {
    const timeCompare = a.start.localeCompare(b.start);
    if (timeCompare !== 0) return timeCompare;
    return a.ao.localeCompare(b.ao);
  });
  ```

## Files Modified

### 1. `lib/scheduler-gloomschedule.js`
- Line 32-52: Updated emoji map with additional entries
- Line 27-104: Rewrote `getWorkoutTypeEmojis()` to support day-aware parsing
- Line 84-99: Updated Q selection logic to prefer accepted Qs
- Line 90-93: Added "(unconfirmed)" status suffix
- Line 131: Changed time format to HHmm (removed colon)
- Line 68: Added `dateStr` parameter to function signature
- Line 128: Parse event date from dateStr parameter
- Line 235: Pass tomorrowDate to convertEventToWorkout
- Line 244-248: Updated sorting to sort by time then AO name

### 2. `compare-schedule-outputs.js` (testing script)
- Created new script to compare old and new scheduler outputs side-by-side
- Validates all 7 fields: start time, AO name, Q name, emoji types, location, closed status

### 3. `docs/SCHEDULE_POSTING_GLOOMSCHEDULE.md`
- Updated emoji mapping table to include all variants
- Added "Day-Specific Workout Types" section
- Updated "Q Status" feature description
- Updated "Time Sorting" to mention AO name secondary sort

## Test Results

### Before Fixes
```
Workout #1: ❌ DIFFERENCES: START, TYPES
Workout #2: ❌ DIFFERENCES: AO, Q, LOCATION (wrong order)
Workout #3: ❌ DIFFERENCES: AO, Q, TYPES, LOCATION (wrong order)
Workout #4: ❌ DIFFERENCES: AO, Q, TYPES, LOCATION (wrong order)
Workout #5: ❌ DIFFERENCES: Q (wrong Q shown)
Workout #6: ❌ DIFFERENCES: START
Workout #7: ❌ DIFFERENCES: START
```

### After Fixes
```
Workout #1: ✅ MATCH
Workout #2: ✅ MATCH
Workout #3: ✅ MATCH
Workout #4: ✅ MATCH
Workout #5: ✅ MATCH
Workout #6: ✅ MATCH
Workout #7: ✅ MATCH
```

## Verification

Tested with tomorrow's schedule (2026-01-20):
- 7 workouts found
- All fields match between old and new endpoints
- Time format: `0500`, `0515`, `0615` (correct)
- Q status: "Boogie Nights" (accepted) shown instead of "3D" (declined) ✓
- Day-specific: "Tu: Bootcamp" correctly shows 🥾 on Tuesday ✓
- Sorting: Block Party < Colosseum < Seabiscuit (alphabetical) ✓

## Production Deployment

1. ✅ Code changes deployed to `lib/scheduler-gloomschedule.js`
2. ✅ Server restarted
3. ✅ Endpoint tested: `POST /api/post_schedule_v2` returns success
4. ✅ Messages posted to Slack channel
5. ✅ Admin notified of 1 unknown type (expected - day-specific type for different day)
6. ✅ Documentation updated

## Migration Path

The new endpoint is now ready for production use:

1. **Both endpoints available**: `/api/post_schedule` (old) and `/api/post_schedule_v2` (new)
2. **Output identical**: Messages match exactly
3. **Safe to migrate**: Update automation to use new endpoint
4. **Advantages of new endpoint**:
   - Real-time data from GloomSchedule (no ICS sync delay)
   - Better Q status handling (accepted vs assigned)
   - VQ indicators
   - Day-specific workout type support
   - Event type filtering (1stF/2ndF/3rdF)

## Recommendations

1. **Update Google Apps Script**: Change schedule posting automation to use `/api/post_schedule_v2`
2. **Monitor for 1 week**: Keep old endpoint running in parallel during transition
3. **Deprecate old endpoint**: After successful transition, document old endpoint as deprecated
4. **Add to GloomSchedule**: 
   - Add "Crows Nest" AO (currently missing but has beatdowns)
   - Update missing Slack user IDs (e.g., "Old Bay")
