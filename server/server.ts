import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { RoomManager } from './rooms';
import { User, Stroke, Point } from './types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Create Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from Vite dev server or other origins
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();

// Track users socket mappings for easy retrieval
const socketUserMap = new Map<string, User>();

// Serve client assets in production
const distPath = path.join(__dirname, '../client');
app.use(express.static(distPath));

// Fallback index.html route for SPA routing if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Socket Connections
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Latency checker
  socket.on('ping-test', (cb: () => void) => {
    if (typeof cb === 'function') {
      cb();
    }
  });

  // Handle joining a room
  socket.on('join-room', ({ roomId, username, color }: { roomId: string; username: string; color: string }) => {
    const cleanRoomId = roomId.trim().toLowerCase() || 'lobby';
    const cleanUsername = username.trim() || `User_${socket.id.substring(0, 4)}`;
    
    const user: User = {
      id: socket.id,
      username: cleanUsername,
      color,
      roomId: cleanRoomId,
      isDrawing: false
    };

    socketUserMap.set(socket.id, user);
    roomManager.addUser(cleanRoomId, user);
    socket.join(cleanRoomId);

    console.log(`${cleanUsername} joined room: ${cleanRoomId}`);

    // Send existing room state back to the joining user
    const room = roomManager.getOrCreateRoom(cleanRoomId);
    socket.emit('room-data', {
      users: roomManager.getUsersInRoom(cleanRoomId),
      committedStrokes: room.drawingState.getActiveStrokes(),
      activeStrokes: roomManager.getActiveStrokes(cleanRoomId)
    });

    // Notify other clients in the room
    socket.to(cleanRoomId).emit('user-joined', {
      user,
      users: roomManager.getUsersInRoom(cleanRoomId)
    });
  });

  // Real-time drawing events
  socket.on('draw-start', (strokeData: Omit<Stroke, 'userId' | 'username' | 'isActive'>) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const stroke: Stroke = {
      ...strokeData,
      userId: user.id,
      username: user.username,
      isActive: true
    };

    roomManager.startStroke(user.roomId, stroke);
    
    // Broadcast draw-start to others in the room
    socket.to(user.roomId).emit('draw-start', stroke);
  });

  socket.on('draw-point', ({ strokeId, point }: { strokeId: string; point: Point }) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    roomManager.appendPoint(user.roomId, strokeId, point);
    
    // Broadcast point to others in real-time
    socket.to(user.roomId).emit('draw-point', { strokeId, point });
  });

  socket.on('draw-end', ({ strokeId }: { strokeId: string }) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const committedStroke = roomManager.commitStroke(user.roomId, strokeId);
    if (committedStroke) {
      // Broadcast draw completion
      socket.to(user.roomId).emit('draw-end', { strokeId });
    }
  });

  // Live cursor positions
  socket.on('cursor-move', ({ x, y }: { x: number; y: number }) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    socket.to(user.roomId).emit('cursor-move', {
      userId: user.id,
      username: user.username,
      color: user.color,
      x,
      y
    });
  });

  // Global Undo / Redo
  socket.on('undo', () => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = roomManager.getOrCreateRoom(user.roomId);
    const undoneStrokeId = room.drawingState.undo(user.id);
    
    if (undoneStrokeId) {
      // Broadcast stroke removal to room
      io.to(user.roomId).emit('stroke-undone', { strokeId: undoneStrokeId });
    }
  });

  socket.on('redo', () => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = roomManager.getOrCreateRoom(user.roomId);
    const restoredStroke = room.drawingState.redo(user.id);

    if (restoredStroke) {
      // Broadcast stroke restoration to room
      io.to(user.roomId).emit('stroke-restored', { stroke: restoredStroke });
    }
  });

  // Clear room canvas
  socket.on('clear-canvas', () => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = roomManager.getOrCreateRoom(user.roomId);
    room.drawingState.clear();
    
    // Discard any active strokes as well
    room.activeStrokes.clear();

    io.to(user.roomId).emit('canvas-cleared');
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    socketUserMap.delete(socket.id);
    
    const removedInfo = roomManager.removeUser(socket.id);
    if (removedInfo) {
      const { user, roomId } = removedInfo;
      // Broadcast to other users in that room
      socket.to(roomId).emit('user-left', {
        userId: socket.id,
        users: roomManager.getUsersInRoom(roomId)
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
