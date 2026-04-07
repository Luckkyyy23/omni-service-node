#!/usr/bin/env node
/**
 * Post-install patch: Add SSE done event to MCP SDK transport
 * Fixes Smithery Connect spinner issue by signaling stream completion
 */

const fs = require('fs');
const path = require('path');

const sdkPath = path.join(
  __dirname,
  '../node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js'
);

try {
  let content = fs.readFileSync(sdkPath, 'utf8');

  // Check if patch already applied
  if (content.includes('writeSSEDone')) {
    console.log('SDK patch already applied, skipping');
    process.exit(0);
  }

  // Step 1: Add writeSSEDone method right before the send() method
  const sendMethodMarker = '    async send(message, options)';
  if (!content.includes(sendMethodMarker)) {
    throw new Error('send() method not found in SDK');
  }

  const doneMethod = `    writeSSEDone(controller, encoder) {
        try {
            const doneEvent = \`event: done\\ndata: {}\\n\\n\`;
            controller.enqueue(encoder.encode(doneEvent));
            return true;
        }
        catch (error) {
            this.onerror?.(error);
            return false;
        }
    }
    `;

  content = content.replace(sendMethodMarker, doneMethod + sendMethodMarker);

  // Step 2: Add writeSSEDone call before stream.cleanup() in the allResponsesReady block
  // Find: stream.cleanup(); that comes after allResponsesReady check
  const cleanupPattern = 'if (stream?.controller && stream?.encoder) {\n                    this.writeSSEDone(stream.controller, stream.encoder);\n                }\n                stream.cleanup();';

  if (content.includes(cleanupPattern)) {
    console.log('SDK done event call already present, skipping');
    process.exit(0);
  }

  // Find the first stream.cleanup() that's inside the allResponsesReady block
  const allResponsesIdx = content.indexOf('allResponsesReady');
  if (allResponsesIdx === -1) {
    throw new Error('allResponsesReady not found in SDK');
  }

  // Find stream.cleanup() after allResponsesReady
  const afterAllResponses = content.substring(allResponsesIdx);
  const cleanupIdx = afterAllResponses.indexOf('stream.cleanup();');
  if (cleanupIdx === -1) {
    throw new Error('stream.cleanup() not found after allResponsesReady');
  }

  const absoluteCleanupIdx = allResponsesIdx + cleanupIdx;
  const doneCall = `if (stream?.controller && stream?.encoder) {\n                    this.writeSSEDone(stream.controller, stream.encoder);\n                }\n                `;

  content = content.substring(0, absoluteCleanupIdx) + doneCall + content.substring(absoluteCleanupIdx);

  fs.writeFileSync(sdkPath, content, 'utf8');
  console.log('SDK SSE done event patch applied successfully');
  process.exit(0);

} catch (error) {
  console.warn('SDK patch skipped:', error.message);
  process.exit(0);
}
