import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  staticDir?: string;
  indexFile?: string;
}

interface MimeTypeEntry {
  extension: string;
  mediaType: string;
}

const MIME_TYPES: MimeTypeEntry[] = [
  { extension: '.html', mediaType: 'text/html; charset=utf-8' },
  { extension: '.js', mediaType: 'application/javascript; charset=utf-8' },
  { extension: '.css', mediaType: 'text/css; charset=utf-8' },
  { extension: '.json', mediaType: 'application/json; charset=utf-8' },
  { extension: '.png', mediaType: 'image/png' },
  { extension: '.jpg', mediaType: 'image/jpeg' },
  { extension: '.jpeg', mediaType: 'image/jpeg' },
  { extension: '.svg', mediaType: 'image/svg+xml' },
  { extension: '.woff2', mediaType: 'font/woff2' },
  { extension: '.woff', mediaType: 'font/woff' },
  { extension: '.ttf', mediaType: 'font/ttf' },
  { extension: '.map', mediaType: 'application/json; charset=utf-8' },
];

const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const DEFAULT_INDEX_FILE = 'unified_index.html';

function resolveMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  for (const entry of MIME_TYPES) {
    if (entry.extension === extension) {
      return entry.mediaType;
    }
  }
  return 'application/octet-stream';
}

function isFileMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === 'ENOENT';
}

export class ChatAgentServer {
  private port: number;

  private readonly agentConfig: Required<AgentConfigOptions>;

  private readonly agentSocketManager: AgentSocketManager;

  private readonly staticDirectory: string;

  private readonly indexFilePath: string;

  private server?: http.Server;

  private agentSocket?: WebSocketServer;

  constructor({
    port = 8080,
    agent = {},
    staticDir,
    indexFile = DEFAULT_INDEX_FILE,
  }: ChatAgentServerOptions = {}) {
    this.port = port;
    this.agentConfig = {
      autoApprove: agent?.autoApprove !== false,
    };
    const resolvedStaticDir = staticDir ? resolve(staticDir) : DEFAULT_STATIC_DIR;
    this.staticDirectory = resolvedStaticDir;
    const sanitizedIndexName = indexFile.startsWith('/') ? indexFile.slice(1) : indexFile;
    const normalisedIndex = normalize(sanitizedIndexName);
    if (normalisedIndex.startsWith('..')) {
      throw new Error('Index file path must be within the static directory');
    }
    this.indexFilePath = join(this.staticDirectory, normalisedIndex);
    const options: AgentSocketManagerOptions = {
      agentConfig: this.agentConfig,
      sendPayload: (ws, payload) => sendAgentPayload(ws, payload),
    };
    this.agentSocketManager = new AgentSocketManager(options);
  }

  async start(): Promise<http.Server> {
    const app = (req: IncomingMessage, res: ServerResponse): void => {
      void this.handleHttpRequest(req, res);
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

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Method Not Allowed');
      return;
    }

    const pathname = this.parseRequestPath(req);
    if (pathname == null) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    const targetPaths = this.resolveCandidatePaths(pathname);
    for (const candidate of targetPaths) {
      const served = await this.tryServeFile(res, candidate, method);
      if (served) {
        return;
      }
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  }

  private parseRequestPath(req: IncomingMessage): string | null {
    const requestUrl = req.url ?? '/';
    const host = req.headers.host ?? 'localhost';
    try {
      const parsed = new URL(requestUrl, `http://${host}`);
      return parsed.pathname;
    } catch (error) {
      console.warn('Failed to parse incoming request URL', error);
      return null;
    }
  }

  private resolveCandidatePaths(pathname: string): string[] {
    if (pathname === '/' || pathname === '') {
      return [this.indexFilePath];
    }

    const normalisedPath = this.normaliseAssetPath(pathname);
    if (!normalisedPath) {
      return [this.indexFilePath];
    }

    const staticPath = join(this.staticDirectory, normalisedPath);
    const isLikelyStaticAsset = normalisedPath.includes('.');
    if (isLikelyStaticAsset) {
      return [staticPath];
    }
    return [staticPath, this.indexFilePath];
  }

  private normaliseAssetPath(pathname: string): string | null {
    if (!pathname.startsWith('/')) {
      return null;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch (error) {
      console.warn('Failed to decode request path', error);
      return null;
    }
    const trimmed = decoded.replace(/^\/+/u, '');
    if (!trimmed) {
      return null;
    }
    const normalised = normalize(trimmed);
    if (normalised.startsWith('..')) {
      return null;
    }
    return normalised;
  }

  private async tryServeFile(
    res: ServerResponse,
    filePath: string,
    method: string,
  ): Promise<boolean> {
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        return false;
      }

      const mimeType = resolveMimeType(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', fileStats.size.toString());
      if (filePath === this.indexFilePath) {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }

      if (method === 'HEAD') {
        res.end();
        return true;
      }

      const stream = createReadStream(filePath);
      stream.on('error', (error) => {
        console.error('Failed while streaming static asset', error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Internal Server Error');
        } else {
          res.destroy(error instanceof Error ? error : new Error('Stream failure'));
        }
      });
      stream.pipe(res);
      return true;
    } catch (error) {
      if (isFileMissingError(error)) {
        return false;
      }

      console.error('Failed to serve static asset', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
      return true;
    }
  }
}
