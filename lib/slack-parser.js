const { WebClient } = require('@slack/web-api');

// Initialize Slack WebClient
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Extracts text from rich_text blocks in a Slack message and converts to HTML.
 * Preserves formatting, links, emojis, and structure for WordPress.
 * 
 * @param {Array} blocks - The blocks array from a Slack message.
 * @param {Array} attachments - Optional attachments array from the message.
 * @returns {string} - The content as HTML.
 */
function extractTextFromRichTextBlocks(blocks, attachments = []) {
  let htmlContent = "";

  if (!blocks || !Array.isArray(blocks)) {
    return htmlContent;
  }

  for (const block of blocks) {
    if (block.type === "rich_text") {
      for (const element of block.elements) {
        if (element.type === "rich_text_section") {
          htmlContent += processRichTextSection(element.elements);
        } else if (element.type === "rich_text_list") {
          htmlContent += processRichTextList(element);
        } else if (element.type === "rich_text_preformatted") {
          htmlContent += "<pre>" + processRichTextSection(element.elements) + "</pre>";
        } else if (element.type === "rich_text_quote") {
          htmlContent += "<blockquote>" + processRichTextSection(element.elements) + "</blockquote>";
        }
      }
    } else if (block.type === "image") {
      // Handle image blocks
      if (block.image_url) {
        const altText = block.alt_text || block.title?.text || "Image";
        htmlContent += `<p><img src="${block.image_url}" alt="${altText}" /></p>`;
      }
    }
  }
  
  // Add images from attachments if they exist
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.image_url) {
        const altText = attachment.title || attachment.fallback || "Attachment Image";
        htmlContent += `<p><img src="${attachment.image_url}" alt="${altText}" /></p>`;
      }
    }
  }

  return htmlContent.trim();
}

/**
 * Process a rich text section element and convert to HTML
 * @param {Array} elements - Array of rich text elements
 * @returns {string} - HTML string
 */
function processRichTextSection(elements) {
  if (!elements || !Array.isArray(elements)) {
    return "";
  }

  let html = "";
  
  for (const subElement of elements) {
    let text = "";
    
    if (subElement.type === "text") {
      text = escapeHtml(subElement.text);
      
      // Apply formatting
      if (subElement.style) {
        if (subElement.style.bold) {
          text = `<strong>${text}</strong>`;
        }
        if (subElement.style.italic) {
          text = `<em>${text}</em>`;
        }
        if (subElement.style.strike) {
          text = `<del>${text}</del>`;
        }
        if (subElement.style.code) {
          text = `<code>${text}</code>`;
        }
      }
      
      html += text;
    } else if (subElement.type === "link") {
      const url = escapeHtml(subElement.url);
      const linkText = escapeHtml(subElement.text || url);
      html += `<a href="${url}">${linkText}</a>`;
    } else if (subElement.type === "emoji") {
      // Convert Slack emoji to Unicode character or skip if not available
      if (subElement.unicode) {
        // Convert hex unicode string to character
        try {
          const codePoints = subElement.unicode.split('-').map(hex => parseInt(hex, 16));
          html += String.fromCodePoint(...codePoints);
        } catch (e) {
          // If conversion fails, use emoji name as fallback
          html += `:${subElement.name}:`;
        }
      } else {
        // Use emoji name as fallback
        html += `:${subElement.name}:`;
      }
    } else if (subElement.type === "user") {
      // User mention - could be enhanced with actual username lookup
      html += `@${subElement.user_id}`;
    } else if (subElement.type === "channel") {
      // Channel mention
      html += `#${subElement.channel_id}`;
    } else if (subElement.type === "usergroup") {
      // User group mention
      html += `@${subElement.usergroup_id}`;
    } else if (subElement.type === "broadcast") {
      // @here, @channel, @everyone
      html += `@${subElement.range}`;
    }
  }
  
  return html;
}

/**
 * Process a rich text list and convert to HTML
 * @param {object} listElement - Rich text list element
 * @returns {string} - HTML string
 */
function processRichTextList(listElement) {
  if (!listElement.elements || !Array.isArray(listElement.elements)) {
    return "";
  }

  const listType = listElement.style === "ordered" ? "ol" : "ul";
  let html = `<${listType}>`;
  
  for (const item of listElement.elements) {
    if (item.type === "rich_text_section") {
      html += "<li>" + processRichTextSection(item.elements) + "</li>";
    }
  }
  
  html += `</${listType}>`;
  return html;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

/**
 * Send a DM to the admin user
 * @param {string} message - The message to send
 * @returns {Promise<void>}
 */
async function notifyAdmin(message) {
  const adminUserId = process.env.SLACK_ADMIN_USER_ID;
  
  if (!adminUserId) {
    console.error("SLACK_ADMIN_USER_ID not set - cannot notify admin");
    return;
  }

  try {
    await slackClient.chat.postMessage({
      channel: adminUserId,
      text: message
    });
    
    console.log(`Admin notification sent to ${adminUserId}`);
  } catch (error) {
    console.error("Failed to notify admin:", error.message);
  }
}

/**
 * Parse a Slack message with metadata into structured data
 * @param {object} message - Slack message object
 * @param {string} eventType - Expected event type ("preblast" or "backblast")
 * @param {string} channelName - Name of the channel where message was posted (fallback for AO)
 * @returns {Promise<object|null>} - Parsed data or null if parsing fails
 */
async function parseSlackMessage(message, eventType, channelName = null) {
  try {
    // Check if message has required metadata
    if (!message.metadata || !message.metadata.event_payload) {
      console.error(`\n⚠️  ${eventType} message missing metadata - SKIPPING`);
      console.error("Message timestamp:", message.ts);
      console.error("Message text:", message.text?.substring(0, 100) + (message.text?.length > 100 ? '...' : ''));
      console.error("Message user:", message.user);
      
      // Send DM to admin about the skipped message
      await notifyAdminOfSkippedMessage(message, eventType);
      
      return null;
    }

    const metadata = message.metadata.event_payload;
    const data = {
      title: metadata.title,
      date: metadata.date,
      time: metadata.time || "05:30", // Default time if not provided
      q: null,
      coq: null,
      ao: null,
      pax: [],
      backblast: null,
      timestamp: message.ts,
    };
    
    // FALLBACK: If date is missing from metadata, try to extract from first block
    if (!data.date && message.blocks && message.blocks.length > 0) {
      const firstBlock = message.blocks[0];
      if (firstBlock.type === 'section' && firstBlock.text && firstBlock.text.text) {
        const dateMatch = firstBlock.text.text.match(/\*DATE\*:\s*(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          data.date = dateMatch[1];
          console.log(`⚠️  Date missing from metadata, extracted from block: ${data.date}`);
        }
      }
    }

    // Resolve Q user ID to display name
    if (metadata.the_q) {
      try {
        const qInfo = await slackClient.users.info({ user: metadata.the_q });
        data.q = qInfo.user.profile.display_name || qInfo.user.real_name;
      } catch (err) {
        console.error(`Error fetching Q user info for ${metadata.the_q}:`, err.message);
        data.q = metadata.the_q;
      }
    }

    // Resolve CoQ user ID if present
    if (metadata.the_coq && typeof metadata.the_coq === 'string' && metadata.the_coq.trim() !== '') {
      try {
        const coqInfo = await slackClient.users.info({ user: metadata.the_coq });
        data.coq = coqInfo.user.profile.display_name || coqInfo.user.real_name;
      } catch (err) {
        console.error(`Error fetching CoQ user info for ${metadata.the_coq}:`, err.message);
        data.coq = null;
      }
    } else if (metadata.coq_user_id && typeof metadata.coq_user_id === 'string' && metadata.coq_user_id.trim() !== '') {
      // Fallback to coq_user_id
      try {
        const coqInfo = await slackClient.users.info({ user: metadata.coq_user_id });
        data.coq = coqInfo.user.profile.display_name || coqInfo.user.real_name;
      } catch (err) {
        console.error(`Error fetching CoQ user info for ${metadata.coq_user_id}:`, err.message);
        data.coq = null;
      }
    }

    // Resolve AO channel ID to channel name
    if (metadata.The_AO) {
      try {
        const aoInfo = await slackClient.conversations.info({ channel: metadata.The_AO });
        data.ao = aoInfo.channel.name;
      } catch (err) {
        console.error(`Error fetching AO info for ${metadata.The_AO}:`, err.message);
        // Use channel where message was posted as fallback
        data.ao = channelName || metadata.The_AO;
      }
    } else {
      // Use channel where message was posted
      data.ao = channelName;
    }

    // Parse pax list from metadata if present
    if (metadata.the_pax && Array.isArray(metadata.the_pax)) {
      for (const paxId of metadata.the_pax) {
        try {
          const paxInfo = await slackClient.users.info({ user: paxId });
          const paxName = paxInfo.user.profile.display_name || paxInfo.user.real_name;
          if (paxName) {
            data.pax.push(paxName);
          }
        } catch (err) {
          console.error(`Error fetching pax info for ${paxId}:`, err.message);
        }
      }
    } else if (metadata.pax && Array.isArray(metadata.pax)) {
      // Fallback to 'pax' field if 'the_pax' doesn't exist
      for (const paxId of metadata.pax) {
        try {
          const paxInfo = await slackClient.users.info({ user: paxId });
          const paxName = paxInfo.user.profile.display_name || paxInfo.user.real_name;
          if (paxName) {
            data.pax.push(paxName);
          }
        } catch (err) {
          console.error(`Error fetching pax info for ${paxId}:`, err.message);
        }
      }
    }
    
    // If no pax in metadata, try to extract from first block (backblast format)
    // The first block typically has: *PAX*: <@U123> <@U456> ...
    if (data.pax.length === 0 && message.blocks && message.blocks.length > 0) {
      const firstBlock = message.blocks[0];
      if (firstBlock.type === 'section' && firstBlock.text && firstBlock.text.text) {
        const paxMatch = firstBlock.text.text.match(/\*PAX\*:\s*([^\n]+)/);
        if (paxMatch) {
          const paxLine = paxMatch[1];
          // Extract all user IDs from mentions like <@U123>
          const userIdMatches = paxLine.matchAll(/<@([A-Z0-9]+)>/g);
          for (const match of userIdMatches) {
            const userId = match[1];
            try {
              const paxInfo = await slackClient.users.info({ user: userId });
              const paxName = paxInfo.user.profile.display_name || paxInfo.user.real_name;
              if (paxName) {
                data.pax.push(paxName);
              }
            } catch (err) {
              console.error(`Error fetching pax info for ${userId}:`, err.message);
            }
          }
        }
      }
    }

    // Extract content from rich_text blocks and convert to HTML
    if (message.blocks) {
      data.backblast = extractTextFromRichTextBlocks(message.blocks, message.attachments);
    } else {
      data.backblast = "";
    }

    return data;
  } catch (error) {
    console.error(`Error parsing ${eventType} message:`, error);
    await notifyAdminOfParsingError(message, eventType, error);
    return null;
  }
}

/**
 * Send DM to admin when a message is skipped due to missing metadata
 */
async function notifyAdminOfSkippedMessage(message, eventType) {
  const adminUserId = process.env.SLACK_ADMIN_USER_ID;
  
  if (!adminUserId) return;

  try {
    const messageText = message.text?.substring(0, 200) + (message.text?.length > 200 ? '...' : '');
    const timestamp = new Date(parseFloat(message.ts) * 1000).toISOString();
    
    let userName = 'Unknown';
    if (message.user) {
      try {
        const userInfo = await slackClient.users.info({ user: message.user });
        userName = userInfo.user.profile.display_name || userInfo.user.real_name || message.user;
      } catch (err) {
        userName = message.user;
      }
    }
    
    const adminMessage = {
      text: `⚠️ *${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Skipped - Missing Metadata*\n\n` +
            `A ${eventType} message was found but could not be processed because it's missing the required metadata structure.\n\n` +
            `*Details:*\n` +
            `• Posted by: ${userName}\n` +
            `• Timestamp: ${timestamp}\n` +
            `• Message preview: \`\`\`${messageText}\`\`\`\n\n` +
            `*Issue:* This message starts with "*${eventType.charAt(0).toUpperCase() + eventType.slice(1)}:" but doesn't have the structured metadata that the bot requires. ` +
            `It was likely posted manually or by an older version of the bot.\n\n` +
            `*Action needed:* If this ${eventType} should be posted to WordPress, please recreate it using the ${eventType} bot with proper metadata.`
    };

    await slackClient.chat.postMessage({
      channel: adminUserId,
      ...adminMessage
    });
    
    console.log(`Admin notification sent to ${adminUserId}`);
  } catch (error) {
    console.error("Failed to notify admin of skipped message:", error.message);
  }
}

/**
 * Send DM to admin when a message fails to parse with an error
 */
async function notifyAdminOfParsingError(message, eventType, error) {
  const adminUserId = process.env.SLACK_ADMIN_USER_ID;
  
  if (!adminUserId) return;

  try {
    const messageText = message.text?.substring(0, 200) + (message.text?.length > 200 ? '...' : '');
    const timestamp = new Date(parseFloat(message.ts) * 1000).toISOString();
    
    const adminMessage = {
      text: `🚨 *${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Parsing Error*\n\n` +
            `A ${eventType} message failed to process due to an error.\n\n` +
            `*Details:*\n` +
            `• Timestamp: ${timestamp}\n` +
            `• Error: \`${error.message}\`\n` +
            `• Message preview: \`\`\`${messageText}\`\`\`\n\n` +
            `*Action needed:* Please check the logs for more details and investigate the issue.`
    };

    await slackClient.chat.postMessage({
      channel: adminUserId,
      ...adminMessage
    });
    
    console.log(`Admin error notification sent to ${adminUserId}`);
  } catch (err) {
    console.error("Failed to notify admin of parsing error:", err.message);
  }
}

module.exports = {
  slackClient,
  extractTextFromRichTextBlocks,
  parseSlackMessage,
  notifyAdmin,
  escapeHtml
};
