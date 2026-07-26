import { io, Socket } from 'socket.io-client';
import { User, Stroke, Point } from '../server/types';

export class WebSocketClient {
  private socket: Socket;
  
  // Handlers registered by main app controllers
  private onRoomDataCallback?: (data: { users: User[]; committedStrokes: Stroke[]; activeStrokes: Stroke[] }) => void;
  private onUserJoinedCallback?: (data: { user: User; users: User[] }) => void;
  private onUserLeftCallback?: (data: { userId: string; users: User[] }) => void;
  private onDrawStartCallback?: (stroke: Stroke) => void;
  private onDrawPointCallback?: (data: { strokeId: string; point: Point }) => void;
  private onDrawEndCallback?: (data: { strokeId: string }) => void;
  private onCursorMoveCallback?: (data: { userId: string; username: string; color: string; x: number; y: number }) => void;
  private onStrokeUndoneCallback?: (data: { strokeId: string }) => void;
  private onStrokeRestoredCallback?: (data: { stroke: Stroke }) => void;
  private onCanvasClearedCallback?: () => void;
  
  private onStatusChangeCallback?: (status: 'connected' | 'disconnected') => void;
  private onPingCallback?: (latencyMs: number) => void;

  constructor() {
    // Automatically resolve socket server connection address
    // During local Vite testing, route to express port 3000.
    const isLocalDev = window.location.hostname === 'localhost' && window.location.port === '5173';
    const serverUrl = isLocalDev ? 'http://localhost:3000' : window.location.origin;

    console.log(`Connecting WebSockets to ${serverUrl}`);
    this.socket = io(serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.setupListeners();
    this.startPingLoop();
  }

  // --- Registration hooks for client main controller ---
  public onRoomData(cb: typeof this.onRoomDataCallback) { this.onRoomDataCallback = cb; }
  public onUserJoined(cb: typeof this.onUserJoinedCallback) { this.onUserJoinedCallback = cb; }
  public onUserLeft(cb: typeof this.onUserLeftCallback) { this.onUserLeftCallback = cb; }
  public onDrawStart(cb: typeof this.onDrawStartCallback) { this.onDrawStartCallback = cb; }
  public onDrawPoint(cb: typeof this.onDrawPointCallback) { this.onDrawPointCallback = cb; }
  public onDrawEnd(cb: typeof this.onDrawEndCallback) { this.onDrawEndCallback = cb; }
  public onCursorMove(cb: typeof this.onCursorMoveCallback) { this.onCursorMoveCallback = cb; }
  public onStrokeUndone(cb: typeof this.onStrokeUndoneCallback) { this.onStrokeUndoneCallback = cb; }
  public onStrokeRestored(cb: typeof this.onStrokeRestoredCallback) { this.onStrokeRestoredCallback = cb; }
  public onCanvasCleared(cb: typeof this.onCanvasClearedCallback) { this.onCanvasClearedCallback = cb; }
  public onStatusChange(cb: typeof this.onStatusChangeCallback) { this.onStatusChangeCallback = cb; }
  public onPing(cb: typeof this.onPingCallback) { this.onPingCallback = cb; }

  // --- Connection Actions ---
  public getSocketId(): string | null {
    return this.socket.id || null;
  }

  public joinRoom(roomId: string, username: string, color: string): void {
    this.socket.emit('join-room', { roomId, username, color });
  }

  public sendDrawStart(stroke: Omit<Stroke, 'userId' | 'username' | 'isActive'>): void {
    this.socket.emit('draw-start', stroke);
  }

  public sendDrawPoint(strokeId: string, point: Point): void {
    this.socket.emit('draw-point', { strokeId, point });
  }

  public sendDrawEnd(strokeId: string): void {
    this.socket.emit('draw-end', { strokeId });
  }

  public sendCursorMove(point: Point): void {
    this.socket.emit('cursor-move', point);
  }

  public sendUndo(): void {
    this.socket.emit('undo');
  }

  public sendRedo(): void {
    this.socket.emit('redo');
  }

  public sendClear(): void {
    this.socket.emit('clear-canvas');
  }

  // --- WebSocket Listeners ---
  private setupListeners(): void {
    this.socket.on('connect', () => {
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback('connected');
      }
    });

    this.socket.on('disconnect', () => {
      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback('disconnected');
      }
    });

    // Server room state distribution
    this.socket.on('room-data', (data) => {
      if (this.onRoomDataCallback) this.onRoomDataCallback(data);
    });

    this.socket.on('user-joined', (data) => {
      if (this.onUserJoinedCallback) this.onUserJoinedCallback(data);
    });

    this.socket.on('user-left', (data) => {
      if (this.onUserLeftCallback) this.onUserLeftCallback(data);
    });

    // Remote drawing pipeline
    this.socket.on('draw-start', (stroke: Stroke) => {
      if (this.onDrawStartCallback) this.onDrawStartCallback(stroke);
    });

    this.socket.on('draw-point', (data) => {
      if (this.onDrawPointCallback) this.onDrawPointCallback(data);
    });

    this.socket.on('draw-end', (data) => {
      if (this.onDrawEndCallback) this.onDrawEndCallback(data);
    });

    // Cursor position notifications
    this.socket.on('cursor-move', (data) => {
      if (this.onCursorMoveCallback) this.onCursorMoveCallback(data);
    });

    // Global action updates
    this.socket.on('stroke-undone', (data) => {
      if (this.onStrokeUndoneCallback) this.onStrokeUndoneCallback(data);
    });

    this.socket.on('stroke-restored', (data) => {
      if (this.onStrokeRestoredCallback) this.onStrokeRestoredCallback(data);
    });

    this.socket.on('canvas-cleared', () => {
      if (this.onCanvasClearedCallback) this.onCanvasClearedCallback();
    });
  }

  // --- Latency Checker Loop ---
  private startPingLoop(): void {
    setInterval(() => {
      if (!this.socket.connected) return;

      const startTime = Date.now();
      this.socket.emit('ping-test', () => {
        const latency = Date.now() - startTime;
        if (this.onPingCallback) {
          this.onPingCallback(latency);
        }
      });
    }, 2000);
  }
}
