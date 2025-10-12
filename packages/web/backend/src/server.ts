import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  AgentSocketManager,
  sendAgentPayload,
  type AgentSocketManagerOptions,
} from './server/agentSocket.js';

export interface AgentConfigOptions {
  autoApprove?: boolean;
}

export interface ChatAgentServerOptions {
  port?: number;
  agent?: AgentConfigOptions;
}

export class ChatAgentServer {
  private port: number;

  private readonly agentConfig: Required<AgentConfigOptions>;

  private readonly agentSocketManager: AgentSocketManager;

  private server?: http.Server;

  private agentSocket?: WebSocketServer;

  constructor({ port = 8080, agent = {} }: ChatAgentServerOptions = {}) {
    this.port = port;
    this.agentConfig = {
      autoApprove: agent?.autoApprove !== false,
    };
    const options: AgentSocketManagerOptions = {
      agentConfig: this.agentConfig,
      sendPayload: (ws, payload) => sendAgentPayload(ws, payload),
    };
    this.agentSocketManager = new AgentSocketManager(options);
  }

  async start(): Promise<http.Server> {
    const app = (_req: IncomingMessage, res: ServerResponse): void => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Chat agent backend running.\n');
    };

    const server = http.createServer(app);
    const agentSocket = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = request.url ?? '';
      if (url.startsWith('/ws/agent')) {
        agentSocket.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          agentSocket.emit('connection', ws, request);
        });
        return;
      }

      socket.destroy();
    });

    agentSocket.on('connection', (ws: WebSocket) => this.agentSocketManager.handleConnection(ws));

    await new Promise<void>((resolve) => {
      server.listen(this.port, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          const addressInfo = address as AddressInfo | null;
          if (addressInfo?.port) {
            this.port = addressInfo.port;
          }
        }
        console.log(`Chat agent backend listening on port ${this.port}`);
        resolve();
      });
    });

    this.server = server;
    this.agentSocket = agentSocket;
    return server;
  }

  async stop(): Promise<void> {
    await this.agentSocketManager.stopAll('server-stop');

    if (this.agentSocket) {
      const clients = Array.from(this.agentSocket.clients) as WebSocket[];
      for (const client of clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => {
        this.agentSocket?.close(() => resolve());
      });
      this.agentSocket = undefined;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close((error) => {
          if (error) {
            console.warn('Failed to close HTTP server cleanly', error);
          }
          resolve();
        });
      });
      this.server = undefined;
    }
  }
}
