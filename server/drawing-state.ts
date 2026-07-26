import { Stroke, Point } from './types';

export class DrawingState {
  // Master history of all strokes (active or undone)
  private strokes: Stroke[] = [];
  
  // Per-user stack of undone strokes (for Redo)
  private redoStacks: Map<string, Stroke[]> = new Map();

  constructor() {}

  /**
   * Add a new completed stroke to history and clear user's redo stack
   */
  public addStroke(stroke: Stroke): void {
    // Ensure stroke is marked active and completed
    const newStroke = { ...stroke, isActive: true };
    this.strokes.push(newStroke);
    
    // Clearing redo stack since a new action was taken
    this.redoStacks.delete(stroke.userId);
  }

  /**
   * Retrieve all active strokes in chronological order
   */
  public getActiveStrokes(): Stroke[] {
    return this.strokes.filter(s => s.isActive);
  }

  /**
   * Undo the last active stroke by a specific user
   * Returns the stroke ID that was undone, or null if nothing to undo
   */
  public undo(userId: string): string | null {
    // Find the last active stroke by this user
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i];
      if (stroke.userId === userId && stroke.isActive) {
        stroke.isActive = false;
        
        // Add to user's redo stack
        if (!this.redoStacks.has(userId)) {
          this.redoStacks.set(userId, []);
        }
        this.redoStacks.get(userId)!.push(stroke);
        
        return stroke.id;
      }
    }
    return null;
  }

  /**
   * Redo the last undone stroke by a specific user
   * Returns the stroke that was restored, or null if nothing to redo
   */
  public redo(userId: string): Stroke | null {
    const userRedoStack = this.redoStacks.get(userId);
    if (!userRedoStack || userRedoStack.length === 0) {
      return null;
    }
    
    // Pop from redo stack
    const strokeToRestore = userRedoStack.pop()!;
    
    // Find it in the master strokes list and reactivate it
    const stroke = this.strokes.find(s => s.id === strokeToRestore.id);
    if (stroke) {
      stroke.isActive = true;
      return stroke;
    }
    
    return null;
  }

  /**
   * Clear all drawing history and redo stacks
   */
  public clear(): void {
    this.strokes = [];
    this.redoStacks.clear();
  }
}
