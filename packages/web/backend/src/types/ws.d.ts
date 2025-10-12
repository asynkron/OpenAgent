declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';
  import { EventEmitter } from 'node:events';

  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export interface WebSocketEventMap {
    close: (code: number, reason: Buffer) => void;
    error: (error: Error) => void;
    message: (data: RawData, isBinary: boolean) => void;
    open: () => void;
  }

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;

    readonly readyState: number;
    readonly protocol: string;

    constructor(url: string | URL, protocols?: string | string[]);

    send(data: string | ArrayBufferLike | Buffer | Buffer[], cb?: (error?: Error) => void): void;
    close(code?: number, reason?: string | Buffer): void;
    terminate(): void;

    on<Event extends keyof WebSocketEventMap>(
      event: Event,
      listener: WebSocketEventMap[Event],
    ): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    once<Event extends keyof WebSocketEventMap>(
      event: Event,
      listener: WebSocketEventMap[Event],
    ): this;
    once(event: string, listener: (...args: unknown[]) => void): this;

    off?(event: keyof WebSocketEventMap | string, listener: (...args: unknown[]) => void): this;
  }

  export interface WebSocketServerOptions {
    noServer?: boolean;
    server?: import('node:http').Server;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions);

    readonly clients: Set<WebSocket>;

    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket, request: IncomingMessage) => void,
    ): void;

    close(cb?: (err?: Error) => void): void;

    on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  const WebSocketDefault: typeof WebSocket;
  export default WebSocketDefault;
}
