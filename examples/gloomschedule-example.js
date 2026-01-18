const GloomScheduleClient = require('../lib/gloomschedule-client');

/**
 * Example usage of the GloomSchedule API Client
 * 
 * This file demonstrates how to use the GloomScheduleClient to interact with the GloomSchedule API.
 */

async function main() {
  // Initialize the client with your API key and base URL
  const client = new GloomScheduleClient({
    apiKey: 'your_api_key_here',
    baseUrl: 'your_api_base_url_here'
  });

  try {
    console.log('=== GloomSchedule API Client Examples ===\n');

    // Example 1: Manually request a token (optional - client handles this automatically)
    console.log('1. Requesting authentication token...');
    const tokenData = await client.requestToken();
    console.log(`Token: ${tokenData.token}`);
    console.log(`Expires at: ${tokenData.expires_at}`);
    console.log(`Region: ${tokenData.region_name} (ID: ${tokenData.region_id})`);
    console.log();

    // Example 2: Get region information
    console.log('2. Getting region information...');
    const regionInfo = client.getRegionInfo();
    console.log(`Region: ${regionInfo.name} (ID: ${regionInfo.id})`);
    console.log();

    // Example 3: Get all active AOs (Area of Operations)
    console.log('3. Getting active AOs...');
    const aoData = await client.getAODetails({ activeOnly: true });
    console.log(`Found ${aoData.aos.length} active AOs in ${aoData.region.name}`);
    
    // Display first few AOs as examples
    aoData.aos.slice(0, 3).forEach(ao => {
      console.log(`  - ${ao.name} at ${ao.location}`);
      console.log(`    Start time: ${ao.start_time}`);
      console.log(`    Days: ${ao.days_of_week.join(', ')}`);
      console.log(`    Type: ${ao.event_type}`);
      if (ao.site_qs.length > 0) {
        console.log(`    Site Qs: ${ao.site_qs.map(q => q.f3_name).join(', ')}`);
      }
    });
    console.log();

    // Example 4: Get all AOs (including inactive)
    console.log('4. Getting all AOs (including inactive)...');
    const allAoData = await client.getAODetails({ activeOnly: false });
    console.log(`Found ${allAoData.aos.length} total AOs`);
    console.log();

    // Example 5: Get scheduled Qs for a specific date
    console.log('5. Getting scheduled Qs for 2026-01-19...');
    const schedule = await client.getScheduledQs('2026-01-19');
    console.log(`Date: ${schedule.date}`);
    console.log(`Region: ${schedule.region.name}`);
    console.log(`Scheduled events: ${schedule.scheduled_events.length}`);
    
    // Display first few events as examples
    schedule.scheduled_events.slice(0, 3).forEach(event => {
      console.log(`  - ${event.ao_name} at ${event.start_time}`);
      console.log(`    Type: ${event.event_type}`);
      console.log(`    Workout types: ${event.workout_types.join(', ')}`);
      if (event.qs.length > 0) {
        event.qs.forEach(q => {
          console.log(`    Q: ${q.f3_name} (${q.status})`);
        });
      }
    });
    console.log();

    // Example 6: Get scheduled Qs using a Date object
    console.log('6. Getting scheduled Qs using Date object...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowSchedule = await client.getScheduledQs(tomorrow);
    console.log(`Date: ${tomorrowSchedule.date}`);
    console.log(`Scheduled events: ${tomorrowSchedule.scheduled_events.length}`);
    console.log();

    // Example 7: Check token information
    console.log('7. Checking token information...');
    const tokenInfo = client.getTokenInfo();
    console.log(`Token: ${tokenInfo.token.substring(0, 20)}...`);
    console.log(`Expires at: ${tokenInfo.expiresAt}`);
    console.log(`Is valid: ${tokenInfo.isValid}`);
    console.log();

    // Example 8: The client automatically handles token refresh
    console.log('8. Token auto-refresh demonstration...');
    console.log('The client will automatically request a new token when needed.');
    console.log('You can safely make multiple requests without worrying about expiration.');
    
    // Make another request - token will be reused if still valid
    const aoData2 = await client.getAODetails();
    console.log(`Successfully made another request. AOs: ${aoData2.aos.length}`);
    console.log();

    console.log('=== All examples completed successfully! ===');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
