import { Point, Stroke } from '../server/types';

export class CanvasManager {
  private committedCanvas: HTMLCanvasElement;
  private activeCanvas: HTMLCanvasElement;
  private committedCtx: CanvasRenderingContext2D;
  private activeCtx: CanvasRenderingContext2D;
  private cursorLayer: HTMLDivElement;

  private isDrawing = false;
  private currentStrokeId: string | null = null;
  private currentPoints: Point[] = [];
  
  // Callbacks for events to propagate to WebSocket
  private onDrawStartCallback?: (stroke: Omit<Stroke, 'userId' | 'username' | 'isActive'>) => void;
  private onDrawPointCallback?: (strokeId: string, point: Point) => void;
  private onDrawEndCallback?: (strokeId: string) => void;
  private onCursorMoveCallback?: (point: Point) => void;

  // Active toolbar options
  private currentColor = '#ff5e57';
  private currentWidth = 5;
  private currentTool: 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text' | 'triangle' = 'brush';

  // Render variables
  private committedStrokes: Stroke[] = [];
  private remoteActiveStrokes: Map<string, Stroke> = new Map(); // strokeId -> Stroke

  constructor(
    committedCanvasId: string,
    activeCanvasId: string,
    cursorLayerId: string
  ) {
    this.committedCanvas = document.getElementById(committedCanvasId) as HTMLCanvasElement;
    this.activeCanvas = document.getElementById(activeCanvasId) as HTMLCanvasElement;
    this.cursorLayer = document.getElementById(cursorLayerId) as HTMLDivElement;

    this.committedCtx = this.committedCanvas.getContext('2d')!;
    this.activeCtx = this.activeCanvas.getContext('2d')!;

    this.setupPointerEvents();
    this.setupResizeObserver();
  }

  // --- Configuration setters ---
  public setTool(tool: typeof this.currentTool) {
    this.currentTool = tool;
  }

  public setColor(color: string) {
    this.currentColor = color;
  }

  public setWidth(width: number) {
    this.currentWidth = width;
  }

  // --- Registration hooks ---
  public onDrawStart(cb: typeof this.onDrawStartCallback) { this.onDrawStartCallback = cb; }
  public onDrawPoint(cb: typeof this.onDrawPointCallback) { this.onDrawPointCallback = cb; }
  public onDrawEnd(cb: typeof this.onDrawEndCallback) { this.onDrawEndCallback = cb; }
  public onCursorMove(cb: typeof this.onCursorMoveCallback) { this.onCursorMoveCallback = cb; }

  // --- Coordinate Projection ---
  private getVirtualCoordinates(e: PointerEvent): Point {
    const rect = this.activeCanvas.getBoundingClientRect();
    // Normalize coordinates based on current layout viewport
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 2000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 2000);
    return { x, y };
  }

  // --- Pointer events mapping (Supports Desktop & Touch Devices) ---
  private setupPointerEvents(): void {
    const el = this.activeCanvas;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      
      const pt = this.getVirtualCoordinates(e);
      this.isDrawing = true;
      this.currentStrokeId = crypto.randomUUID();
      
      // For shapes, pre-allocate 2-point array; for brush, start with 1
      if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
        this.currentPoints = [pt];
      } else {
        this.currentPoints = [pt, pt]; // Initialize with start point copied
      }

      const strokeData = {
        id: this.currentStrokeId,
        color: this.currentTool === 'eraser' ? '#ffffff' : this.currentColor,
        width: this.currentWidth,
        tool: this.currentTool,
        points: this.currentPoints,
        isEraser: this.currentTool === 'eraser'
      };

      if (this.onDrawStartCallback) {
        this.onDrawStartCallback(strokeData);
      }

      this.redrawActiveCanvas();
    });

    el.addEventListener('pointermove', (e) => {
      const pt = this.getVirtualCoordinates(e);
      
      // Throttle/Broadcast cursor coordinates to socket channel
      if (this.onCursorMoveCallback) {
        this.onCursorMoveCallback(pt);
      }

      if (!this.isDrawing || !this.currentStrokeId) return;

      if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
        // High frequency point capture for freehand brush
        this.currentPoints.push(pt);
        if (this.onDrawPointCallback) {
          this.onDrawPointCallback(this.currentStrokeId, pt);
        }
      } else {
        // Shapes only capture starting and current bounding boxes
        this.currentPoints[1] = pt;
        if (this.onDrawPointCallback) {
          this.onDrawPointCallback(this.currentStrokeId, pt);
        }
      }

      this.redrawActiveCanvas();
    });

    const endDrawing = (e: PointerEvent) => {
      if (!this.isDrawing || !this.currentStrokeId) return;
      
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore capture errors on window exits
      }

      const pt = this.getVirtualCoordinates(e);
      
      if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
        this.currentPoints.push(pt);
      } else {
        this.currentPoints[1] = pt;
      }

      // Trigger socket draw-end event
      if (this.onDrawEndCallback) {
        this.onDrawEndCallback(this.currentStrokeId);
      }

      // Add to local committed list and draw it
      const completedStroke: Stroke = {
        id: this.currentStrokeId,
        userId: 'local',
        username: 'You',
        color: this.currentTool === 'eraser' ? '#ffffff' : this.currentColor,
        width: this.currentWidth,
        tool: this.currentTool,
        points: [...this.currentPoints],
        isEraser: this.currentTool === 'eraser',
        isActive: true
      };

      this.committedStrokes.push(completedStroke);
      this.drawStrokeToContext(this.committedCtx, completedStroke);

      // Clean active scratch state
      this.isDrawing = false;
      this.currentStrokeId = null;
      this.currentPoints = [];
      this.redrawActiveCanvas();
    };

    el.addEventListener('pointerup', endDrawing);
    el.addEventListener('pointercancel', endDrawing);
  }

  // --- Dynamic Layout Dimension Resizing ---
  private setupResizeObserver(): void {
    const container = this.activeCanvas.parentElement!;
    const resizeHandler = () => {
      const rect = container.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) - 32; // padding margin
      
      // Update canvas CSS size while leaving internal resolution at 2000x2000
      this.committedCanvas.style.width = `${size}px`;
      this.committedCanvas.style.height = `${size}px`;
      this.activeCanvas.style.width = `${size}px`;
      this.activeCanvas.style.height = `${size}px`;
      
      // Sync cursor overlay layer size with canvas size
      this.cursorLayer.style.width = `${size}px`;
      this.cursorLayer.style.height = `${size}px`;
    };

    const observer = new ResizeObserver(resizeHandler);
    observer.observe(container);
    // Initial resize call
    window.addEventListener('load', resizeHandler);
  }

  // --- Rendering Pipeline ---

  /**
   * Set and redraw committed canvas history
   */
  public setCommittedStrokes(strokes: Stroke[]) {
    this.committedStrokes = strokes;
    this.redrawCommittedCanvas();
  }

  /**
   * Render a remote stroke start
   */
  public addRemoteActiveStroke(stroke: Stroke) {
    this.remoteActiveStrokes.set(stroke.id, stroke);
    this.redrawActiveCanvas();
  }

  /**
   * Append point to remote stroke
   */
  public appendRemotePoint(strokeId: string, point: Point) {
    const stroke = this.remoteActiveStrokes.get(strokeId);
    if (stroke) {
      if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
        stroke.points.push(point);
      } else {
        stroke.points[1] = point;
      }
      this.redrawActiveCanvas();
    }
  }

  /**
   * Move remote stroke to committed list
   */
  public commitRemoteStroke(strokeId: string) {
    const stroke = this.remoteActiveStrokes.get(strokeId);
    if (stroke) {
      this.committedStrokes.push(stroke);
      this.drawStrokeToContext(this.committedCtx, stroke);
      this.remoteActiveStrokes.delete(strokeId);
      this.redrawActiveCanvas();
    }
  }

  /**
   * Remove a stroke from committed list (Undo event)
   */
  public undoStroke(strokeId: string) {
    this.committedStrokes = this.committedStrokes.filter(s => s.id !== strokeId);
    this.redrawCommittedCanvas();
  }

  /**
   * Add back a stroke to committed list (Redo event)
   */
  public restoreStroke(stroke: Stroke) {
    this.committedStrokes.push(stroke);
    this.drawStrokeToContext(this.committedCtx, stroke);
  }

  /**
   * Clear drawing canvases
   */
  public clearCanvas() {
    this.committedStrokes = [];
    this.remoteActiveStrokes.clear();
    this.redrawCommittedCanvas();
    this.redrawActiveCanvas();
  }

  /**
   * Full redraw of all historical strokes on committed canvas
   */
  private redrawCommittedCanvas() {
    this.committedCtx.clearRect(0, 0, 2000, 2000);
    for (const stroke of this.committedStrokes) {
      this.drawStrokeToContext(this.committedCtx, stroke);
    }
  }

  /**
   * Full redraw of active/transient strokes on overlay canvas
   */
  private redrawActiveCanvas() {
    this.activeCtx.clearRect(0, 0, 2000, 2000);

    // 1. Draw local active stroke in progress
    if (this.isDrawing && this.currentStrokeId && this.currentPoints.length > 0) {
      const tempStroke: Stroke = {
        id: this.currentStrokeId,
        userId: 'local',
        username: 'You',
        color: this.currentTool === 'eraser' ? '#ffffff' : this.currentColor,
        width: this.currentWidth,
        tool: this.currentTool,
        points: this.currentPoints,
        isEraser: this.currentTool === 'eraser',
        isActive: true
      };
      this.drawStrokeToContext(this.activeCtx, tempStroke);
    }

    // 2. Draw remote active strokes in progress
    for (const stroke of this.remoteActiveStrokes.values()) {
      this.drawStrokeToContext(this.activeCtx, stroke);
    }
  }

  /**
   * Low-level canvas operation router for rendering paths & shapes
   */
  private drawStrokeToContext(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    const pts = stroke.points;
    if (pts.length === 0) return;

    ctx.save();
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Eraser configuration
    if (stroke.isEraser) {
      ctx.strokeStyle = '#ffffff'; // White overlay acts as eraser
    }

    // Tool routing
    switch (stroke.tool) {
      case 'brush':
      case 'eraser':
        this.drawSmoothPath(ctx, pts);
        break;
      case 'line':
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
        }
        break;
      case 'rectangle':
        if (pts.length >= 2) {
          ctx.beginPath();
          const width = pts[1].x - pts[0].x;
          const height = pts[1].y - pts[0].y;
          ctx.rect(pts[0].x, pts[0].y, width, height);
          ctx.stroke();
        }
        break;
      case 'circle':
        if (pts.length >= 2) {
          ctx.beginPath();
          const radius = Math.sqrt(
            Math.pow(pts[1].x - pts[0].x, 2) + Math.pow(pts[1].y - pts[0].y, 2)
          );
          ctx.arc(pts[0].x, pts[0].y, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;
      case 'triangle':
        if (pts.length >= 2) {
          ctx.beginPath();
          const dx = pts[1].x - pts[0].x;
          const dy = pts[1].y - pts[0].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          
          // Draw equilateral triangle with one vertex at start point
          //const height = dist * Math.sqrt(3) / 2;
          const p1x = pts[0].x;
          const p1y = pts[0].y;
          const p2x = pts[0].x + dist * Math.cos(angle + Math.PI / 3);
          const p2y = pts[0].y + dist * Math.sin(angle + Math.PI / 3);
          const p3x = pts[0].x + dist * Math.cos(angle - Math.PI / 3);
          const p3y = pts[0].y + dist * Math.sin(angle - Math.PI / 3);
          
          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.lineTo(p3x, p3y);
          ctx.closePath();
          ctx.stroke();
        }
        break;
      case 'text':
        if (pts.length >= 1) {
          ctx.font = `${Math.max(stroke.width * 3, 16)}px Arial`;
          ctx.fillStyle = stroke.color;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('Text', pts[0].x, pts[0].y);
        }
        break;
    }

    ctx.restore();
  }

  /**
   * Quadratic Bézier Curve path optimization for anti-aliased drawing
   */
  private drawSmoothPath(ctx: CanvasRenderingContext2D, points: Point[]) {
    if (points.length < 1) return;
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    if (points.length === 1) {
      // Draw single dot
      ctx.lineTo(points[0].x + 0.1, points[0].y);
      ctx.stroke();
      return;
    }

    if (points.length === 2) {
      // Linear path for 2 points
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      return;
    }

    // Quadratic interpolation for smooth brush strokes
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    
    // Connect final point
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  }

  /**
   * Get dynamic snapshot data URL of the canvas (excluding overlay active strokes)
   */
  public getSnapshotUrl(): string {
    return this.committedCanvas.toDataURL('image/png');
  }
}
