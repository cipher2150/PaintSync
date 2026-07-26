export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  userId: string;
  username: string;
  color: string;
  width: number;
  tool: 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle';
  points: Point[];
  isEraser: boolean;
  isActive: boolean;
}

export interface User {
  id: string;
  username: string;
  color: string;
  roomId: string;
  isDrawing: boolean;
}

export interface CursorPosition {
  userId: string;
  username: string;
  color: string;
  x: number; // 0 to 2000 virtual space
  y: number;
}
