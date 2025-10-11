import http from 'http';
import { WebSocketServer } from 'ws';

import { AgentSocketManager, sendAgentPayload } from './server/agentSocket.js';

export class ChatAgentServer {
  constructor({ port = 8080, agent = {} } = {}) {
    this.port = port;
    this.agentConfig = {
      autoApprove: agent?.autoApprove !== false,
    };
    this.agentSocketManager = new AgentSocketManager({
      agentConfig: this.agentConfig,
      sendPayload: (ws, payload) => sendAgentPayload(ws, payload),
    });
  }

  async start() {
    const app = (req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Chat agent backend running.\n');
    };

    const server = http.createServer(app);
    const agentSocket = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      if (request.url.startsWith('/ws/agent')) {
        agentSocket.handleUpgrade(request, socket, head, (ws) => {
          agentSocket.emit('connection', ws, request);
        });
        return;
      }

      socket.destroy();
    });

    agentSocket.on('connection', (ws) => this.agentSocketManager.handleConnection(ws));

    await new Promise((resolve) => {
      server.listen(this.port, () => {
        const address = server.address();
        if (typeof address === 'object' && address?.port) {
          this.port = address.port;
        }
        console.log(`Chat agent backend listening on port ${this.port}`);
        resolve();
      });
    });

    this.server = server;
    this.agentSocket = agentSocket;
    return server;
  }

  async stop() {
    await this.agentSocketManager.stopAll('server-stop');

    if (this.agentSocket) {
      for (const client of this.agentSocket.clients) {
        client.terminate();
      }
      await new Promise((resolve) => this.agentSocket?.close(resolve));
      this.agentSocket = undefined;
    }

    await new Promise((resolve) => this.server?.close(resolve));
    this.server = undefined;
  }
}
