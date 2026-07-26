import { User, Stroke, Point } from './types';
import { DrawingState } from './drawing-state';

export interface Room {
  id: string;
  users: Map<string, User>; // userId -> User metadata
  drawingState: DrawingState;
  activeStrokes: Map<string, Stroke>; // strokeId -> Stroke (real-time drawing in progress)
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  constructor() {}

  /**
   * Get an existing room or create a new one
   */
  public getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        users: new Map(),
        drawingState: new DrawingState(),
        activeStrokes: new Map()
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /**
   * Add a user to a specific room
   */
  public addUser(roomId: string, user: User): void {
    const room = this.getOrCreateRoom(roomId);
    room.users.set(user.id, user);
  }

  /**
   * Remove a user from whichever room they are in
   * Returns the removed user and their room ID
   */
  public removeUser(userId: string): { user: User; roomId: string } | null {
    for (const [roomId, room] of this.rooms.entries()) {
      const user = room.users.get(userId);
      if (user) {
        room.users.delete(userId);
        
        // Clean up active strokes by this user if they disconnect abruptly
        for (const [strokeId, stroke] of room.activeStrokes.entries()) {
          if (stroke.userId === userId) {
            room.activeStrokes.delete(strokeId);
          }
        }
        
        // Clean up empty rooms to save memory (keep a default room 'lobby')
        if (room.users.size === 0 && roomId !== 'lobby') {
          this.rooms.delete(roomId);
        }
        
        return { user, roomId };
      }
    }
    return null;
  }

  /**
   * Get all active users in a room
   */
  public getUsersInRoom(roomId: string): User[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  /**
   * Get drawing state for a room
   */
  public getDrawingState(roomId: string): DrawingState | null {
    const room = this.rooms.get(roomId);
    return room ? room.drawingState : null;
  }

  /**
   * Start a new real-time stroke in a room
   */
  public startStroke(roomId: string, stroke: Stroke): void {
    const room = this.getOrCreateRoom(roomId);
    room.activeStrokes.set(stroke.id, stroke);
  }

  /**
   * Append a point to an active stroke
   */
  public appendPoint(roomId: string, strokeId: string, point: Point): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const stroke = room.activeStrokes.get(strokeId);
    if (stroke) {
      stroke.points.push(point);
    }
  }

  /**
   * Complete an active stroke, moving it to committed drawing state history
   */
  public commitStroke(roomId: string, strokeId: string): Stroke | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    
    const stroke = room.activeStrokes.get(strokeId);
    if (stroke) {
      stroke.isActive = true;
      room.drawingState.addStroke(stroke);
      room.activeStrokes.delete(strokeId);
      return stroke;
    }
    return null;
  }

  /**
   * Discard an active stroke (e.g. if cancelled)
   */
  public discardStroke(roomId: string, strokeId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.activeStrokes.delete(strokeId);
  }

  /**
   * Get all strokes currently being drawn in a room
   */
  public getActiveStrokes(roomId: string): Stroke[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.activeStrokes.values());
  }
}
