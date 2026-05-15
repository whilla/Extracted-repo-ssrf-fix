import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerContentTools } from './tools/content.js';
import { registerMediaTools } from './tools/media.js';
import { registerPublishTools } from './tools/publish.js';
import { registerAnalyticsTools } from './tools/analytics.js';
import { registerBrandTools } from './tools/brand.js';

const server = new McpServer({
  name: 'nexusai-mcp-server',
  version: '1.0.0',
});

registerContentTools(server);
registerMediaTools(server);
registerPublishTools(server);
registerAnalyticsTools(server);
registerBrandTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('NexusAI MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
