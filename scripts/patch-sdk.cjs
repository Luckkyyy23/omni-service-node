#!/usr/bin/env node
/**
 * Post-install patch: Add SSE done event to MCP SDK transport
 * Fixes Smithery Connect spinner issue by signaling stream completion
 * 
 * Runs after: npm install (via package.json postinstall script)
 */

const fs = require('fs');
const path = require('path');

const sdkPath = path.join(
  __dirname, 
  '../node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js'
);

try {
  const content = fs.readFileSync(sdkPath, 'utf8');

  // Check if patch already applied
  if (content.includes('writeSSEDone')) {
    console.log('✓ SDK patch already applied, skipping');
    process.exit(0);
  }

  // Inject writeSSEDone method after writeSSEEvent
  const writeSSEEventPattern = /(\s+writeSSEEvent\(controller, encoder, message, eventId\) \{[\s\S]*?\n\s+\})/;
  const writeSSEDoneMethod = `\n    writeSSEDone(controller, encoder) {
        try {
            const doneEvent = \`event: done\\n\` +
                \`data: {}\\n\\n\`;
            controller.enqueue(encoder.encode(doneEvent));
            return true;
        }
        catch (error) {
            this.onerror?.(error);
            return false;
        }
    }`;

  if (!writeSSEEventPattern.test(content)) {
    throw new Error('writeSSEEvent method not found - SDK structure may have changed');
  }

  let patched = content.replace(writeSSEEventPattern, '$1' + writeSSEDoneMethod);

  // Inject call to writeSSEDone before stream.cleanup() in send() method
  // Pattern: find the cleanup() call and add writeSSEDone before it
  const cleanupCallIndex = patched.indexOf('stream.cleanup();');
  if (cleanupCallIndex === -1) {
    throw new Error('stream.cleanup() call not found - SDK structure may have changed');
  }
  
  // Find the start of the line and indent level
  const beforeCleanup = patched.substring(0, cleanupCallIndex);
  const lineStart = beforeCleanup.lastIndexOf('\n') + 1;
  const indent = beforeCleanup.substring(lineStart).match(/^\s*/)[0];
  
  const writeSSEDoneCall = `${indent}if (stream?.controller && stream?.encoder) {\n${indent}    this.writeSSEDone(stream.controller, stream.encoder);\n${indent}}\n${indent}`;
  
  patched = patched.substring(0, cleanupCallIndex) + writeSSEDoneCall + patched.substring(cleanupCallIndex);

  fs.writeFileSync(sdkPath, patched, 'utf8');
  console.log('✓ SDK SSE done event patch applied successfully');
  process.exit(0);

} catch (error) {
  console.warn('⚠ SDK patch skipped (SDK structure changed):', error.message);
  process.exit(0);
}
