import { CanvasManager } from './canvas';
import { WebSocketClient } from './websocket';
import { User, Stroke } from '../server/types';

class AppController {
  private canvasManager: CanvasManager;
  private socketClient: WebSocketClient;

  // App states
  private currentUsername = '';
  private currentRoom = 'lobby';
  private currentUserColor = '#ff5e57';

  // DOM Elements - Panels
  private appContainer = document.getElementById('app-container') as HTMLDivElement;
  private joinModal = document.getElementById('join-modal') as HTMLDivElement;
  private joinForm = document.getElementById('join-form') as HTMLFormElement;

  // DOM Elements - Toolbar
  private toolBrush = document.getElementById('tool-brush') as HTMLButtonElement;
  private toolEraser = document.getElementById('tool-eraser') as HTMLButtonElement;
  private toolLine = document.getElementById('tool-line') as HTMLButtonElement;
  private toolRectangle = document.getElementById('tool-rectangle') as HTMLButtonElement;
  private toolCircle = document.getElementById('tool-circle') as HTMLButtonElement;

  private brushSize = document.getElementById('brush-size') as HTMLInputElement;
  private brushSizePreview = document.getElementById('brush-size-preview') as HTMLSpanElement;
  private colorPickerInput = document.getElementById('color-picker-input') as HTMLInputElement;

  // DOM Elements - Actions
  private btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  private btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
  private btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
  private btnExport = document.getElementById('btn-export') as HTMLButtonElement;
  private btnLeaveRoom = document.getElementById('btn-leave-room') as HTMLButtonElement;

  // DOM Elements - Headers & Sidebars
  private currentRoomName = document.getElementById('current-room-name') as HTMLSpanElement;
  private socketStatus = document.getElementById('socket-status') as HTMLSpanElement;
  private pingValue = document.getElementById('ping-value') as HTMLSpanElement;
  private fpsValue = document.getElementById('fps-value') as HTMLSpanElement;
  private usersList = document.getElementById('users-list') as HTMLUListElement;
  private cursorLayer = document.getElementById('cursor-layer') as HTMLDivElement;

  // Tracking structures
  private cursors: Map<string, { el: HTMLDivElement; lastUpdate: number }> = new Map();
  private onlineUsers: Map<string, User> = new Map();

  // FPS tracker values
  private frameCount = 0;
  private lastFpsUpdateTime = 0;

  constructor() {
    this.canvasManager = new CanvasManager('committed-canvas', 'active-canvas', 'cursor-layer');
    this.socketClient = new WebSocketClient();

    this.setupUIListeners();
    this.setupSocketHooks();
    this.setupKeyboardShortcuts();
    this.startGhostCursorCleanup();
    this.startFpsCounter();
  }

  // --- UI Interactivity Setup ---
  private setupUIListeners(): void {
    // Join form submission
    this.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const usernameInput = document.getElementById('username-input') as HTMLInputElement;
      const roomInput = document.getElementById('room-input') as HTMLInputElement;

      this.currentUsername = usernameInput.value.trim();
      this.currentRoom = roomInput.value.trim().toLowerCase() || 'lobby';

      // Connect to WebSocket room
      this.socketClient.joinRoom(this.currentRoom, this.currentUsername, this.currentUserColor);

      // Reveal Workspace UI
      this.joinModal.classList.add('hidden');
      this.appContainer.classList.remove('hidden');
      this.currentRoomName.textContent = this.currentRoom;
    });

    // Username modal color selection swatch action
    const modalColors = document.querySelectorAll('.modal-color-swatch');
    modalColors.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        modalColors.forEach(s => s.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');
        this.currentUserColor = target.getAttribute('data-color') || '#ff5e57';
      });
    });

    // Toolbar Tool selection
    const tools = [
      { btn: this.toolBrush, tool: 'brush' },
      { btn: this.toolEraser, tool: 'eraser' },
      { btn: this.toolLine, tool: 'line' },
      { btn: this.toolRectangle, tool: 'rectangle' },
      { btn: this.toolCircle, tool: 'circle' }
    ] as const;

    tools.forEach(({ btn, tool }) => {
      btn.addEventListener('click', () => {
        tools.forEach(t => t.btn.classList.remove('active'));
        btn.classList.add('active');
        this.canvasManager.setTool(tool);
      });
    });

    // Brush width changes
    this.brushSize.addEventListener('input', () => {
      const val = parseInt(this.brushSize.value);
      this.brushSizePreview.textContent = `${val}px`;
      this.canvasManager.setWidth(val);
    });

    // Color Swatches
    const colorSwatches = document.querySelectorAll('.color-swatch');
    colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        colorSwatches.forEach(s => s.classList.remove('active'));
        const target = e.currentTarget as HTMLButtonElement;
        target.classList.add('active');

        const color = target.getAttribute('data-color') || '#ff5e57';
        this.currentUserColor = color;
        this.colorPickerInput.value = color;
        this.canvasManager.setColor(color);

        // Auto reset tool to brush if currently eraser
        if (this.toolEraser.classList.contains('active')) {
          this.toolEraser.classList.remove('active');
          this.toolBrush.classList.add('active');
          this.canvasManager.setTool('brush');
        }
      });
    });

    // Custom Color picker
    this.colorPickerInput.addEventListener('input', () => {
      // Remove active states from standard color swatches
      colorSwatches.forEach(s => s.classList.remove('active'));
      const color = this.colorPickerInput.value;
      this.currentUserColor = color;
      this.canvasManager.setColor(color);

      if (this.toolEraser.classList.contains('active')) {
        this.toolEraser.classList.remove('active');
        this.toolBrush.classList.add('active');
        this.canvasManager.setTool('brush');
      }
    });

    // Operations binding
    this.btnUndo.addEventListener('click', () => this.socketClient.sendUndo());
    this.btnRedo.addEventListener('click', () => this.socketClient.sendRedo());
    this.btnClear.addEventListener('click', () => {
      if (confirm('Clear the entire collaborative board?')) {
        this.socketClient.sendClear();
      }
    });
    this.btnExport.addEventListener('click', () => this.exportCanvas());
    this.btnLeaveRoom.addEventListener('click', () => {
      // Clean reload restores modal joining flow cleanly
      window.location.reload();
    });
  }

  // --- keyboard commands ---
  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Avoid hotkeys when typing in forms
      if (document.activeElement?.tagName === 'INPUT') return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.socketClient.sendUndo();
      } else if (isCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.socketClient.sendRedo();
      } else {
        switch (e.key.toLowerCase()) {
          case 'b':
            this.toolBrush.click();
            break;
          case 'e':
            this.toolEraser.click();
            break;
          case 'l':
            this.toolLine.click();
            break;
          case 'r':
            this.toolRectangle.click();
            break;
          case 'c':
            this.toolCircle.click();
            break;
        }
      }
    });
  }

  // --- WebSocket event listeners routing ---
  private setupSocketHooks(): void {
    // 1. Client connection health
    this.socketClient.onStatusChange((status) => {
      this.socketStatus.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
      this.socketStatus.className = `status-badge ${status}`;
    });

    this.socketClient.onPing((latency) => {
      this.pingValue.textContent = `${latency} ms`;
    });

    // 2. Synchronized Canvas & User state triggers
    this.socketClient.onRoomData(({ users, committedStrokes, activeStrokes }) => {
      this.onlineUsers.clear();
      users.forEach(u => this.onlineUsers.set(u.id, u));
      this.updateUsersSidebar();

      // Clear existing canvas state and build history
      this.canvasManager.setCommittedStrokes(committedStrokes);

      // Setup current transient drawings
      activeStrokes.forEach(stroke => {
        this.canvasManager.addRemoteActiveStroke(stroke);
      });
    });

    this.socketClient.onUserJoined(({ user, users }) => {
      this.onlineUsers.clear();
      users.forEach(u => this.onlineUsers.set(u.id, u));
      this.updateUsersSidebar();
      this.showToastNotification(`${user.username} entered the room`);
    });

    this.socketClient.onUserLeft(({ userId, users }) => {
      const leftUser = this.onlineUsers.get(userId);
      this.onlineUsers.clear();
      users.forEach(u => this.onlineUsers.set(u.id, u));
      this.updateUsersSidebar();

      // Remove leaving peer's cursor representation
      this.removeCursor(userId);

      if (leftUser) {
        this.showToastNotification(`${leftUser.username} left the room`);
      }
    });

    // 3. Real-time draw operations
    this.canvasManager.onDrawStart((stroke) => {
      this.socketClient.sendDrawStart(stroke);
    });

    this.canvasManager.onDrawPoint((strokeId, point) => {
      this.socketClient.sendDrawPoint(strokeId, point);
    });

    this.canvasManager.onDrawEnd((strokeId) => {
      this.socketClient.sendDrawEnd(strokeId);
    });

    this.canvasManager.onCursorMove((point) => {
      this.socketClient.sendCursorMove(point);
    });

    // 4. Remote peer drawing actions
    this.socketClient.onDrawStart((stroke) => {
      this.canvasManager.addRemoteActiveStroke(stroke);
      this.setUserDrawingStatus(stroke.userId, true);
    });

    this.socketClient.onDrawPoint(({ strokeId, point }) => {
      this.canvasManager.appendRemotePoint(strokeId, point);
    });

    this.socketClient.onDrawEnd(({ strokeId }) => {
      this.canvasManager.commitRemoteStroke(strokeId);
      // Scan to find which user completed drawing
      for (const user of this.onlineUsers.values()) {
        this.setUserDrawingStatus(user.id, false);
      }
    });

    // 5. Live cursor broadcast handler
    this.socketClient.onCursorMove(({ userId, username, color, x, y }) => {
      this.updateCollaboratorCursor(userId, username, color, x, y);
    });

    // 6. Global action broadcast responses
    this.socketClient.onStrokeUndone(({ strokeId }) => {
      this.canvasManager.undoStroke(strokeId);
    });

    this.socketClient.onStrokeRestored(({ stroke }) => {
      this.canvasManager.restoreStroke(stroke);
    });

    this.socketClient.onCanvasCleared(() => {
      this.canvasManager.clearCanvas();
      this.showToastNotification('Canvas cleared by host');
    });
  }

  // --- Real-time user cursor handlers ---
  private updateCollaboratorCursor(userId: string, username: string, color: string, x: number, y: number): void {
    let cursorData = this.cursors.get(userId);

    if (!cursorData) {
      const el = document.createElement('div');
      el.className = 'collaborator-cursor';
      el.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color: ${color};">
          <path d="M4.5 3V17.5L8.7 13.3L13.8 22L17.5 19.8L12.5 11.2L17.5 11.2L4.5 3Z" fill="currentColor" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
        <div class="cursor-label" style="background-color: ${color};">${username}</div>
      `;
      this.cursorLayer.appendChild(el);
      cursorData = { el, lastUpdate: Date.now() };
      this.cursors.set(userId, cursorData);
    }

    // Position cursor utilizing percentages mapping to the 2000x2000 virtual space
    cursorData.el.style.left = `${(x / 20)}%`;
    cursorData.el.style.top = `${(y / 20)}%`;
    cursorData.lastUpdate = Date.now();
  }

  private removeCursor(userId: string): void {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.el.remove();
      this.cursors.delete(userId);
    }
  }

  /**
   * Cleans inactive cursor DOM elements if updates cease (due to abrupt peer tab closing)
   */
  private startGhostCursorCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, cursor] of this.cursors.entries()) {
        if (now - cursor.lastUpdate > 4000) { // 4 seconds timeout
          cursor.el.remove();
          this.cursors.delete(userId);
        }
      }
    }, 2000);
  }

  // --- Right Collaborative Panel Updates ---
  private updateUsersSidebar(): void {
    this.usersList.innerHTML = '';

    this.onlineUsers.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'user-item';

      const letter = user.username.charAt(0).toUpperCase();

      li.innerHTML = `
        <div class="user-avatar" style="background-color: ${user.color}">
          ${letter}
        </div>
        <div class="user-info">
          <span class="user-name">${user.username} ${user.id === this.socketClient.getSocketId() ? '(You)' : ''}</span>
          <span id="user-status-${user.id}" class="user-status">${user.isDrawing ? 'Drawing...' : 'Idle'}</span>
        </div>
      `;

      this.usersList.appendChild(li);
    });
  }

  private setUserDrawingStatus(userId: string, isDrawing: boolean): void {
    const user = this.onlineUsers.get(userId);
    if (user && user.isDrawing !== isDrawing) {
      user.isDrawing = isDrawing;
      const statusSpan = document.getElementById(`user-status-${userId}`);
      if (statusSpan) {
        statusSpan.textContent = isDrawing ? 'Drawing...' : 'Idle';
        statusSpan.className = `user-status ${isDrawing ? 'drawing' : ''}`;
      }
    }
  }

  // --- Actions ---
  private exportCanvas(): void {
    const dataUrl = this.canvasManager.getSnapshotUrl();
    const link = document.createElement('a');
    link.download = `paintsync-${this.currentRoom}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  // --- FPS Metrics Timer loop ---
  private startFpsCounter(): void {
    const loop = (timestamp: number) => {
      if (!this.lastFpsUpdateTime) {
        this.lastFpsUpdateTime = timestamp;
      }

      this.frameCount++;
      const elapsed = timestamp - this.lastFpsUpdateTime;

      if (elapsed >= 1000) {
        const fps = Math.round((this.frameCount * 1000) / elapsed);
        this.fpsValue.textContent = `${fps} FPS`;
        this.frameCount = 0;
        this.lastFpsUpdateTime = timestamp;
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // --- System notifications Toast element helper ---
  private showToastNotification(message: string): void {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.background = 'rgba(22, 28, 38, 0.95)';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '10px';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    toast.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
    toast.style.fontSize = '13px';
    toast.style.fontFamily = 'Inter, sans-serif';
    toast.style.zIndex = '99999';
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    toast.textContent = message;

    document.body.appendChild(toast);

    // Trigger transition
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);

    // Fade out and remove
    setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }
}

// Instantiate App
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
