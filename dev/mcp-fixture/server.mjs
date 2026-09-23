import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const port = Number(process.env.MCP_FIXTURE_PORT ?? 8765);

const mcpServer = new Server({ name: 'harness-mcp-fixture', version: '1.0.0' }, { capabilities: { tools: {} } });

mcpServer.setRequestHandler(
  { method: 'tools/list' },
  async () => ({
    tools: [
      {
        name: 'ping',
        description: 'Returns pong for Harness C4-A smoke tests',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
  }),
);

mcpServer.setRequestHandler({ method: 'tools/call' }, async (request) => {
  if (request.params.name !== 'ping') {
    return { content: [{ type: 'text', text: 'unknown tool' }], isError: true };
  }
  return { content: [{ type: 'text', text: 'pong' }] };
});

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => void transport.close());
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(port, '127.0.0.1', () => {
  console.log(`MCP fixture listening on http://127.0.0.1:${port}/mcp`);
  console.log('Configure serverName=demo, url above, tool mcp__demo__ping');
});
