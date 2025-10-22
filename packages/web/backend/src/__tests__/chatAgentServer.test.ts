import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';

import { ChatAgentServer } from '../server.js';

interface TestFileDescriptor {
  relativePath: string;
  content: string;
}

interface StartedServer {
  server: ChatAgentServer;
  port: number;
  staticDir: string;
}

interface SimpleHttpResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
}

let activeServer: ChatAgentServer | null = null;
let activeStaticDir: string | null = null;

async function createStaticDirectory(files: TestFileDescriptor[]): Promise<string> {
  const directory = await mkdtemp(join(os.tmpdir(), 'chat-agent-server-'));
  for (const file of files) {
    const targetPath = join(directory, file.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, 'utf8');
  }
  return directory;
}

function getListeningPort(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Server is not listening on a TCP address');
  }
  const { port } = address as AddressInfo;
  if (!port) {
    throw new Error('Failed to determine listening port');
  }
  return port;
}

async function startServer(files: TestFileDescriptor[]): Promise<StartedServer> {
  const staticDir = await createStaticDirectory(files);
  const server = new ChatAgentServer({
    port: 0,
    agent: { autoApprove: true },
    staticDir,
    indexFile: 'index.html',
  });
  const httpServer = await server.start();
  const port = getListeningPort(httpServer);
  activeServer = server;
  activeStaticDir = staticDir;
  return { server, port, staticDir };
}

async function stopActiveServer(): Promise<void> {
  if (activeServer) {
    await activeServer.stop();
    activeServer = null;
  }
  if (activeStaticDir) {
    await rm(activeStaticDir, { recursive: true, force: true });
    activeStaticDir = null;
  }
}

async function request(
  port: number,
  path: string,
  method: string = 'GET',
): Promise<SimpleHttpResponse> {
  return await new Promise<SimpleHttpResponse>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
      },
      (res) => {
        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const statusCode = typeof res.statusCode === 'number' ? res.statusCode : 0;
          resolve({
            statusCode,
            headers: res.headers,
            body: chunks.join(''),
          });
        });
      },
    );
    req.on('error', (error) => reject(error));
    req.end();
  });
}

afterEach(async () => {
  await stopActiveServer();
});

describe('ChatAgentServer HTTP handler', () => {
  it('serves the index file at the root path', async () => {
    const indexContent = '<html><body>agent</body></html>';
    const { port } = await startServer([
      { relativePath: 'index.html', content: indexContent },
    ]);

    const response = await request(port, '/');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(indexContent);
  });

  it('serves static assets when they exist', async () => {
    const { port } = await startServer([
      { relativePath: 'index.html', content: '<html></html>' },
      { relativePath: 'static/dist/app.js', content: 'console.log("ok");' },
    ]);

    const response = await request(port, '/static/dist/app.js');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(response.body).toBe('console.log("ok");');
  });

  it('returns a 404 for missing static assets', async () => {
    const { port } = await startServer([
      { relativePath: 'index.html', content: '<html></html>' },
    ]);

    const response = await request(port, '/static/dist/missing.js');

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('Not Found');
  });

  it('falls back to the index file for non-static routes', async () => {
    const indexContent = '<html><body>fallback</body></html>';
    const { port } = await startServer([
      { relativePath: 'index.html', content: indexContent },
    ]);

    const response = await request(port, '/workspace/notes');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(indexContent);
  });

  it('rejects unsupported HTTP methods', async () => {
    const { port } = await startServer([
      { relativePath: 'index.html', content: '<html></html>' },
    ]);

    const response = await request(port, '/', 'POST');

    expect(response.statusCode).toBe(405);
    expect(response.body).toBe('Method Not Allowed');
  });
});
