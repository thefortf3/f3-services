require('dotenv').config()

const pb = require("../lib/preblast");
const { WebClient } = require('@slack/web-api');

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// Calculate timestamp for 3 months ago
const threeMonthsAgo = new Date('2026-01-07');
const timestamp = Math.floor(threeMonthsAgo.getTime() / 1000).toString();

console.log('Inspecting Slack message structure for preblasts...\n');

async function inspectPreblasts() {
  try {
    const channelsResponse = await slackClient.conversations.list();
    const channels = channelsResponse.channels;

    for (const channel of channels) {
      if (!channel.is_member) continue;

      const messagesResponse = await slackClient.conversations.history({
        channel: channel.id,
        oldest: timestamp,
        limit: 100,
        include_all_metadata: true
      });

      const messages = messagesResponse.messages;

      for (const message of messages) {
        if (message.text && message.text.startsWith("*Preblast:") && message.metadata) {
          console.log('='.repeat(80));
          console.log('PREBLAST FOUND:', message.metadata?.event_payload?.title);
          console.log('='.repeat(80));
          
          // Show message structure
          console.log('\n--- MESSAGE METADATA ---');
          console.log(JSON.stringify(message.metadata, null, 2));
          
          console.log('\n--- MESSAGE TEXT ---');
          console.log(message.text?.substring(0, 300));
          
          console.log('\n--- BLOCKS ---');
          if (message.blocks) {
            console.log(`Found ${message.blocks.length} blocks`);
            message.blocks.forEach((block, idx) => {
              console.log(`\nBlock ${idx} - Type: ${block.type}`);
              if (block.type === 'rich_text') {
                console.log('Rich text elements:', JSON.stringify(block.elements, null, 2));
              } else if (block.type === 'image') {
                console.log('Image block:', JSON.stringify(block, null, 2));
              }
            });
          } else {
            console.log('No blocks found');
          }
          
          console.log('\n--- ATTACHMENTS ---');
          if (message.attachments && message.attachments.length > 0) {
            console.log(`Found ${message.attachments.length} attachments`);
            message.attachments.forEach((att, idx) => {
              console.log(`\nAttachment ${idx}:`);
              console.log('  Image URL:', att.image_url);
              console.log('  Title:', att.title);
              console.log('  Text:', att.text?.substring(0, 200));
              console.log('  Full:', JSON.stringify(att, null, 2));
            });
          } else {
            console.log('No attachments found');
          }
          
          console.log('\n--- FILES ---');
          if (message.files && message.files.length > 0) {
            console.log(`Found ${message.files.length} files`);
            message.files.forEach((file, idx) => {
              console.log(`\nFile ${idx}:`);
              console.log('  Name:', file.name);
              console.log('  URL:', file.url_private);
              console.log('  Type:', file.mimetype);
            });
          } else {
            console.log('No files found');
          }
          
          console.log('\n\n');
          
          // Only show first 2 preblasts in detail
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectPreblasts();
