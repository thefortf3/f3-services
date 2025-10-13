const { WebClient } = require('@slack/web-api');
const { json } = require('body-parser');

// Initialize Slack WebClient
const slackClient = new WebClient(process.env.COMZBOT_TOKEN);

/**
 * Searches all Slack channels for posts starting with "Preblast:" since a given timestamp.
 * Extracts specific fields and content from the posts.
 * 
 * @param {string} sinceTimestamp - The timestamp to start searching from (e.g., "1697040000").
 */
async function searchPreblastPosts(sinceTimestamp) {
    let results = [];

    try {
    // Fetch all channels the bot is a member of
    const channelsResponse = await slackClient.conversations.list();
    const channels = channelsResponse.channels;

    for (const channel of channels) {
      if (!channel.is_member) continue; // Skip channels the bot is not a member of

      console.log(`Searching channel: ${channel.name}`);

      let hasMore = true;
      let cursor = null;

      while (hasMore) {
        // Fetch messages from the channel since the given timestamp
        const messagesResponse = await slackClient.conversations.history({
          channel: channel.id,
          oldest: sinceTimestamp,
          limit: 100, // Maximum allowed by Slack
          cursor: cursor,  // Use the cursor for pagination
          include_all_metadata: true
        });

        const messages = messagesResponse.messages;

        console.log(`Found ${messages.length} messages in channel ${channel.name} since timestamp ${sinceTimestamp}`);

        for (const message of messages) {          

          if (message.text.startsWith("*Preblast:")) {
            // console.log('Message Contents:', JSON.stringify(message, null, 4));
            const parsedData = await parsePreblastMessage(message);
            
            if (parsedData) {
              console.log("Parsed Preblast Data:", parsedData);
            }
            results.push(parsedData);
          }
        }

        // Check if there are more messages to fetch
        cursor = messagesResponse.response_metadata?.next_cursor;
        hasMore = !!cursor; // Continue if a next_cursor exists
      }
    }
  } catch (error) {
    console.error("Error searching for Preblast posts:", error);
  }
  return results;
}

/**
 * Extracts text from rich_text blocks in a Slack message.
 * 
 * @param {Array} blocks - The blocks array from a Slack message.
 * @returns {string} - The concatenated text from all rich_text blocks.
 */
function extractTextFromRichTextBlocks(blocks) {
  let extractedText = "";

  if (!blocks || !Array.isArray(blocks)) {
    return extractedText;
  }

  for (const block of blocks) {
    if (block.type === "rich_text") {
      for (const element of block.elements) {
        if (element.type === "rich_text_section") {
          for (const subElement of element.elements) {
            if (subElement.type === "text") {
              extractedText += subElement.text;
            }
          }
        }
      }
    }
  }

  return extractedText.trim();
}

/**
 * Parses a message starting with "Preblast:" to extract specific fields and content.
 * 
 * @param {object} message - The message object from Slack.
 * @returns {object|null} - An object containing the parsed fields, or null if parsing fails.
 */
async function parsePreblastMessage(message) {
  /*
      Expected format:
      {
          "event_type": "backblast",
          "event_payload": {
              "title": "Test Preblast",
              "The_AO": "C02JPSTACQ5",
              "date": "2025-10-13",
              "time": "05:00",
              "the_q": "U0188A934NB",
              "coupons": null,
              "destination": "The_AO",
              "preblast_original_poster": "U0188A934NB"
          }
      }
  */

  try {
    const data = {
      Preblast: null,
      Date: null,
      Q: null,
      Time: null,
      Where: null,
      Content: null,
      Timestamp: null,
    };

    const metadata = message.metadata;
    data.Preblast = metadata.event_payload.title;
    data.Date = metadata.event_payload.date;
    data.Q = await slackClient.users.info({ user: metadata.event_payload.the_q }).then(res => res.user.profile.display_name);
    data.Time = metadata.event_payload.time;
    data.Where = await slackClient.conversations.info({ channel: metadata.event_payload.The_AO }).then(res => res.channel.name);
    data.Timestamp = message.ts;

    // Extract content from rich_text blocks
    if (message.blocks) {
      data.Content = extractTextFromRichTextBlocks(message.blocks);
    } else {
      data.Content = "";
    }

    return data;
  } catch (error) {
    console.error("Error parsing Preblast message:", error);
    return null;
  }
}

// Example usage
// searchPreblastPosts("1697040000"); // Replace with your desired timestamp

module.exports = { searchPreblastPosts };