#!/usr/bin/env node
/**
 * y-websocket collaboration server for NexusAI
 * Run with: node collaboration-server.mjs
 * Or via Docker: docker-compose up collaboration
 */

import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils.js';

const PORT = process.env.COLLAB_PORT || 1234;
const GC_ENABLED = process.env.COLLAB_GC !== 'false';

const server = new WebSocketServer({
  port: PORT,
  perMessageDeflate: false,
});

console.log(`[Collaboration] y-websocket server listening on port ${PORT}`);

server.on('connection', (conn, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const roomName = url.pathname.slice(1) || 'default';

  console.log(`[Collaboration] Client connected to room: ${roomName}`);

  setupWSConnection(conn, req, {
    gc: GC_ENABLED,
    timeout: 30000,
  });

  conn.on('close', () => {
    console.log(`[Collaboration] Client disconnected from room: ${roomName}`);
  });
});

server.on('error', (error) => {
  console.error('[Collaboration] Server error:', error.message);
});

process.on('SIGINT', () => {
  console.log('[Collaboration] Shutting down...');
  server.close();
  process.exit(0);
});
