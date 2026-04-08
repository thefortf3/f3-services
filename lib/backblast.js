const slackParser = require('./slack-parser');

/**
 * Searches all Slack channels for backblast posts since a given timestamp.
 * 
 * @param {string} sinceTimestamp - The timestamp to start searching from (e.g., "1697040000").
 * @returns {Promise<Array>} - Array of parsed backblast data
 */
async function searchBackblastPosts(sinceTimestamp) {
  let results = [];

  try {
    // Fetch all channels the bot is a member of
    const channelsResponse = await slackParser.slackClient.conversations.list({
      types: 'public_channel',
      exclude_archived: false,
      limit: 1000
    });
    const channels = channelsResponse.channels;

    for (const channel of channels) {
      if (!channel.is_member) continue; // Skip channels the bot is not a member of

      console.log(`Searching channel: ${channel.name}`);

      let hasMore = true;
      let cursor = null;

      while (hasMore) {
        // Fetch messages from the channel since the given timestamp
        const messagesResponse = await slackParser.slackClient.conversations.history({
          channel: channel.id,
          oldest: sinceTimestamp,
          limit: 100, // Maximum allowed by Slack
          cursor: cursor,  // Use the cursor for pagination
          include_all_metadata: true
        });

        const messages = messagesResponse.messages;

        console.log(`Found ${messages.length} messages in channel ${channel.name} since timestamp ${sinceTimestamp}`);

        for (const message of messages) {
          // Check for backblast metadata (event_type === "backblast")
          if (message.metadata && message.metadata.event_type === "backblast") {
            const parsedData = await slackParser.parseSlackMessage(message, 'backblast', channel.name);
            
            if (parsedData) {
              console.log("Parsed Backblast Data:", parsedData);
              results.push(parsedData);
            }
          }
        }

        // Check if there are more messages to fetch
        cursor = messagesResponse.response_metadata?.next_cursor;
        hasMore = !!cursor; // Continue if a next_cursor exists
      }
    }
  } catch (error) {
    console.error("Error searching for Backblast posts:", error);
  }
  
  return results;
}

module.exports = { searchBackblastPosts };
