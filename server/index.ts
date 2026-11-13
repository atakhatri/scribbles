import cors from "cors";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ---------------- TYPES ----------------
export interface Stroke {
  path: string;
  color: string;
  width: number;
  fill?: boolean;
}

export interface PlayerInfo {
  uid: string;
  displayName: string;
  avatar?: string | null;
  avatarGradientIndex?: number;
  points: number;
  socketId: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isCorrectGuess: boolean;
  isCloseGuess?: boolean;
  isSystem?: boolean;
  systemType?: string; // 'join' | 'leave' | 'round'
  timestamp: number;
}

export interface GameRoomState {
  id: string;
  status: "waiting" | "playing" | "finished";
  lobbyEnteredAt: number | null;
  hostId: string;
  currentDrawer: string;
  word: string;
  currentWord: string;
  round: number;
  maxRounds: number;
  strokes: Stroke[];
  liveStroke: Stroke | null; // Real-time in-progress stroke while finger moves
  players: PlayerInfo[];
  scores: Record<string, number>;
  guessed: string[];
  guesses: string[];
  messages: ChatMessage[];
  roundEndTimestamp: number | null;
  serverNow?: number; // Sent with state so clients can compute clock offset
  createdAt: number;
}

// Fallback word pool for auto-selection on timeout
const FALLBACK_WORDS = [
  "APPLE", "BANANA", "GUITAR", "MOUNTAIN", "ELEPHANT", "AIRPLANE",
  "SUNFLOWER", "BACKPACK", "TELESCOPE", "WATERMELON", "BUTTERFLY",
  "SNOWMAN", "LIGHTHOUSE", "DIAMOND", "OCTOPUS", "VOLCANO",
  "HELICOPTER", "SANDWICH", "RAINBOW", "CAMPFIRE"
];

// In-memory store of active rooms and their authoritative timers
const rooms = new Map<string, GameRoomState>();
const roomTimers = new Map<string, NodeJS.Timeout>();

// Helper: Generate 4-char uppercase room code
const generateRoomCode = (): string => {
  let code = "";
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms.has(code) || code.length !== 4);
  return code;
};

// Helper: Levenshtein Distance for "is close!" guess detection
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// Helper: Add system or user message & broadcast
const addChatMessage = (
  room: GameRoomState,
  msg: Omit<ChatMessage, "id" | "timestamp">
) => {
  const fullMsg: ChatMessage = {
    ...msg,
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };
  room.messages.push(fullMsg);
  if (room.messages.length > 100) {
    room.messages.shift();
  }
  io.to(room.id).emit("chat:message", fullMsg);
  return fullMsg;
};

// Helper: Broadcast full room state to everyone in the room
const broadcastRoomState = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  room.serverNow = Date.now();
  io.to(roomId).emit("room:state", room);
};

// Helper: Clear existing timer for a room
const clearRoomTimer = (roomId: string) => {
  const existing = roomTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(roomId);
  }
};

// Authoritative Turn & Timer Manager
const scheduleRoomTimer = (roomId: string, durationMs: number) => {
  clearRoomTimer(roomId);
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  room.roundEndTimestamp = Date.now() + durationMs;
  broadcastRoomState(roomId);

  const timer = setTimeout(() => {
    handlePhaseTimeout(roomId);
  }, durationMs);

  roomTimers.set(roomId, timer);
};

// Triggered automatically by server when 30s picker or 120s drawing timer expires
const handlePhaseTimeout = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  // 1. Word Selection Phase Timeout -> Auto-pick word & start 120s drawing phase
  if (!room.word) {
    const randomWord =
      FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    room.word = randomWord;
    room.currentWord = randomWord;
    room.guessed = [];
    room.liveStroke = null;
    scheduleRoomTimer(roomId, 120000); // 2 mins to draw
    return;
  }

  // 2. Drawing Phase Timeout -> Award base drawer points & advance turn
  addChatMessage(room, {
    userId: "system",
    userName: "Game",
    text: `Time's up! The word was ${room.word}`,
    isCorrectGuess: false,
    isSystem: true,
  });

  const nonDrawerGuessed = room.guessed.filter(
    (uid) => uid !== room.currentDrawer
  );
  const drawerPoints = 5 * nonDrawerGuessed.length;
  if (room.currentDrawer && drawerPoints > 0) {
    room.scores[room.currentDrawer] =
      (room.scores[room.currentDrawer] || 0) + drawerPoints;
    const p = room.players.find((pl) => pl.uid === room.currentDrawer);
    if (p) p.points = room.scores[room.currentDrawer];
  }

  advanceToNextTurn(room);
};

// Rotate drawer, increment round if needed, or finish game
const advanceToNextTurn = (room: GameRoomState) => {
  clearRoomTimer(room.id);

  if (room.players.length === 0) {
    rooms.delete(room.id);
    return;
  }

  const foundIdx = room.players.findIndex(
    (p) => p.uid === room.currentDrawer
  );
  const idx = foundIdx >= 0 ? foundIdx : 0;
  const nextIdx = (idx + 1) % room.players.length;
  const nextDrawer = room.players[nextIdx].uid;
  const shouldIncrementRound = nextIdx <= idx;

  const nextRound = (room.round || 1) + (shouldIncrementRound ? 1 : 0);
  const newStatus = nextRound > room.maxRounds ? "finished" : "playing";

  room.strokes = [];
  room.liveStroke = null;
  room.word = "";
  room.currentWord = "";
  room.guessed = [];
  room.round = nextRound;
  room.currentDrawer = nextDrawer;
  room.status = newStatus;

  if (newStatus === "finished") {
    room.roundEndTimestamp = null;
    broadcastRoomState(room.id);
    // Clean up room 20 seconds after finish if nobody clicks Play Again
    const cleanupTimer = setTimeout(() => {
      const r = rooms.get(room.id);
      if (r && r.status === "finished") {
        rooms.delete(room.id);
      }
    }, 20000);
    roomTimers.set(room.id, cleanupTimer);
    return;
  }

  if (shouldIncrementRound) {
    addChatMessage(room, {
      userId: "system",
      userName: "Game",
      text: `Round ${nextRound} started!`,
      isCorrectGuess: false,
      isSystem: true,
    });
  }

  const drawerPlayer = room.players.find((p) => p.uid === nextDrawer);
  addChatMessage(room, {
    userId: "system",
    userName: "Game",
    text: `${drawerPlayer?.displayName || "A player"} is drawing!`,
    isCorrectGuess: false,
    isSystem: true,
  });

  // Start 30s word selection timer for the new drawer
  scheduleRoomTimer(room.id, 30000);
};

// Remove player on leave or socket disconnect
const removePlayerFromRoom = (
  roomId: string,
  uid: string,
  withLeaveMessage = true
) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const oldIndex = room.players.findIndex((p) => p.uid === uid);
  if (oldIndex === -1) return;

  const leavingPlayer = room.players[oldIndex];
  room.players.splice(oldIndex, 1);

  if (room.players.length === 0) {
    clearRoomTimer(roomId);
    rooms.delete(roomId);
    return;
  }

  if (withLeaveMessage) {
    addChatMessage(room, {
      userId: "system",
      userName: "Game",
      text: `${leavingPlayer.displayName || "A player"} left the game`,
      isCorrectGuess: false,
      isSystem: true,
      systemType: "leave",
    });
  }

  // Migrate host if host left
  if (room.hostId === uid) {
    room.hostId = room.players[0].uid;
  }

  // If current drawer left during an active game, rotate drawer immediately
  if (room.currentDrawer === uid && room.status === "playing") {
    const nextIndex = oldIndex >= room.players.length ? 0 : oldIndex;
    room.currentDrawer = room.players[nextIndex].uid;
    room.word = "";
    room.currentWord = "";
    room.strokes = [];
    room.liveStroke = null;
    room.guessed = [];

    addChatMessage(room, {
      userId: "system",
      userName: "Game",
      text: `${room.players[nextIndex].displayName} is now drawing!`,
      isCorrectGuess: false,
      isSystem: true,
    });

    scheduleRoomTimer(roomId, 30000);
    return;
  }

  broadcastRoomState(roomId);
};

// ---------------- SOCKET.IO EVENTS ----------------
io.on("connection", (socket: Socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Track which user/room this socket belongs to for instant disconnect cleanup
  let boundRoomId: string | null = null;
  let boundUserId: string | null = null;

  // 1. CREATE ROOM (Used by both Create Room Modal and Quick Invite on Home Screen)
  socket.on(
    "room:create",
    (
      payload: {
        roomId?: string;
        user: {
          uid: string;
          displayName: string;
          avatar?: string | null;
          avatarGradientIndex?: number;
        };
        maxRounds: number;
        enterImmediately?: boolean;
      },
      callback?: (res: { ok: boolean; roomId?: string; state?: GameRoomState; error?: string }) => void
    ) => {
      try {
        const roomId = payload.roomId?.toUpperCase() || generateRoomCode();
        const { user, maxRounds = 2, enterImmediately = true } = payload;

        const newRoom: GameRoomState = {
          id: roomId,
          status: "waiting",
          lobbyEnteredAt: enterImmediately ? Date.now() : null,
          hostId: user.uid,
          currentDrawer: user.uid,
          word: "",
          currentWord: "",
          round: 1,
          maxRounds,
          strokes: [],
          liveStroke: null,
          players: [
            {
              uid: user.uid,
              displayName: user.displayName || "Player",
              avatar: user.avatar || null,
              avatarGradientIndex: user.avatarGradientIndex,
              points: 0,
              socketId: socket.id,
            },
          ],
          scores: { [user.uid]: 0 },
          guessed: [],
          guesses: [],
          messages: [],
          roundEndTimestamp: null,
          createdAt: Date.now(),
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);
        boundRoomId = roomId;
        boundUserId = user.uid;

        callback?.({ ok: true, roomId, state: newRoom });
        broadcastRoomState(roomId);
      } catch (e: any) {
        callback?.({ ok: false, error: e?.message || "Failed to create room" });
      }
    }
  );

  // 2. CHECK IF ROOM EXISTS (Used by Join Room button on Home Screen)
  socket.on(
    "room:check",
    (
      payload: { roomId: string },
      callback?: (res: { exists: boolean; state?: GameRoomState }) => void
    ) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      callback?.({ exists: !!room, state: room });
    }
  );

  // 3. JOIN ROOM (Used by Game Screen [id].tsx and Invite Acceptance)
  socket.on(
    "room:join",
    (
      payload: {
        roomId: string;
        user: {
          uid: string;
          displayName: string;
          avatar?: string | null;
          avatarGradientIndex?: number;
        };
      },
      callback?: (res: { ok: boolean; state?: GameRoomState; error?: string }) => void
    ) => {
      const roomId = (payload?.roomId || "").trim().toUpperCase();
      const { user } = payload;
      const room = rooms.get(roomId);

      if (!room) {
        callback?.({ ok: false, error: "Game not found" });
        return;
      }

      socket.join(roomId);
      boundRoomId = roomId;
      boundUserId = user.uid;

      const existingPlayer = room.players.find((p) => p.uid === user.uid);
      if (!existingPlayer) {
        room.scores[user.uid] = room.scores[user.uid] ?? 0;
        room.players.push({
          uid: user.uid,
          displayName: user.displayName || "Player",
          avatar: user.avatar || null,
          avatarGradientIndex: user.avatarGradientIndex,
          points: room.scores[user.uid],
          socketId: socket.id,
        });

        addChatMessage(room, {
          userId: "system",
          userName: "Game",
          text: `${user.displayName || "A player"} joined the game`,
          isCorrectGuess: false,
          isSystem: true,
          systemType: "join",
        });
      } else {
        existingPlayer.socketId = socket.id;
        existingPlayer.displayName =
          user.displayName || existingPlayer.displayName;
        if (user.avatarGradientIndex !== undefined) {
          existingPlayer.avatarGradientIndex = user.avatarGradientIndex;
        }
      }

      callback?.({ ok: true, state: room });
      broadcastRoomState(roomId);
    }
  );

  // 4. PRE-LOBBY CONTROLS (Used by Home Screen Waiting Group)
  socket.on(
    "room:updateRounds",
    (payload: { roomId: string; userId: string; maxRounds: number }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.hostId !== payload.userId) return;
      room.maxRounds = Math.max(1, Math.min(20, payload.maxRounds));
      broadcastRoomState(room.id);
    }
  );

  socket.on(
    "room:enterLobbyForAll",
    (payload: { roomId: string; userId: string }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.hostId !== payload.userId) return;
      room.lobbyEnteredAt = Date.now();
      broadcastRoomState(room.id);
    }
  );

  socket.on(
    "room:cancel",
    (payload: { roomId: string; userId: string }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.hostId !== payload.userId) return;
      clearRoomTimer(room.id);
      io.to(room.id).emit("room:closed", { reason: "Lobby was closed by host" });
      rooms.delete(room.id);
    }
  );

  // 5. START GAME (Or Play Again from Podium)
  socket.on(
    "game:start",
    (
      payload: { roomId: string; userId: string },
      callback?: (res: { ok: boolean; error?: string }) => void
    ) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        callback?.({ ok: false, error: "Room not found" });
        return;
      }
      if (room.hostId !== payload.userId) {
        callback?.({ ok: false, error: "Only the host can start the game." });
        return;
      }
      if (room.players.length < 2) {
        callback?.({
          ok: false,
          error: "At least 2 players are required to start the game.",
        });
        return;
      }

      // Reset scores if restarting from finished state
      if (room.status === "finished") {
        room.scores = {};
        room.players.forEach((p) => {
          room.scores[p.uid] = 0;
          p.points = 0;
        });
      }

      room.status = "playing";
      room.round = 1;
      room.currentDrawer = room.players[0].uid;
      room.strokes = [];
      room.liveStroke = null;
      room.guesses = [];
      room.guessed = [];
      room.word = "";
      room.currentWord = "";

      // Notify clients to clear chat or show new game start
      io.to(room.id).emit("game:restarted");

      addChatMessage(room, {
        userId: "system",
        userName: "Game",
        text: `Round 1 started! ${room.players[0].displayName} is drawing!`,
        isCorrectGuess: false,
        isSystem: true,
      });

      scheduleRoomTimer(room.id, 30000); // 30s to choose word
      callback?.({ ok: true });
    }
  );

  // 6. SELECT WORD (Candidate or Custom Word)
  socket.on(
    "game:selectWord",
    (payload: { roomId: string; userId: string; word: string }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.status !== "playing") return;
      if (room.currentDrawer !== payload.userId) return;

      const cleanWord = (payload.word || "").trim().toUpperCase();
      if (cleanWord.length < 2 || cleanWord.length > 20) return;

      room.word = cleanWord;
      room.currentWord = cleanWord;
      room.guessed = [];
      room.liveStroke = null;

      // Start 120s (2 mins) drawing countdown
      scheduleRoomTimer(room.id, 120000);
    }
  );

  // 7. REAL-TIME DRAWING EVENTS
  // 7a. Live in-progress brush stroke while finger is moving!
  socket.on(
    "draw:live",
    (payload: { roomId: string; userId: string; stroke: Stroke | null }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.currentDrawer !== payload.userId) return;
      room.liveStroke = payload.stroke;
      // Broadcast to everyone ELSE in the room immediately for 60fps feel
      socket.to(room.id).emit("draw:live", payload.stroke);
    }
  );

  // 7b. Committed stroke on finger release
  socket.on(
    "draw:stroke",
    (payload: { roomId: string; userId: string; stroke: Stroke }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.currentDrawer !== payload.userId) return;
      room.liveStroke = null;
      room.strokes.push(payload.stroke);
      io.to(room.id).emit("draw:strokesUpdated", room.strokes);
    }
  );

  // 7c. Clear Canvas
  socket.on("canvas:clear", (payload: { roomId: string; userId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room || room.currentDrawer !== payload.userId) return;
    room.strokes = [];
    room.liveStroke = null;
    io.to(room.id).emit("draw:strokesUpdated", room.strokes);
  });

  // 7d. Undo Last Stroke
  socket.on("canvas:undo", (payload: { roomId: string; userId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room || room.currentDrawer !== payload.userId) return;
    if (room.strokes.length > 0) {
      room.strokes.pop();
      io.to(room.id).emit("draw:strokesUpdated", room.strokes);
    }
  });

  // 8. CHAT & AUTHORITATIVE GUESS CHECKING
  socket.on(
    "chat:send",
    (payload: {
      roomId: string;
      user: { uid: string; displayName: string };
      text: string;
    }) => {
      const room = rooms.get(payload.roomId);
      if (!room) return;

      const text = (payload.text || "").trim();
      if (!text) return;

      const { uid, displayName } = payload.user;
      const isDrawer = room.currentDrawer === uid;
      const currentWord = room.word || "";
      const alreadyGuessed = room.guessed.includes(uid);

      const isGuess =
        currentWord.length > 0 &&
        text.toLowerCase() === currentWord.toLowerCase();

      const dist = currentWord
        ? getLevenshteinDistance(text.toLowerCase(), currentWord.toLowerCase())
        : 999;
      const isClose =
        currentWord.length > 0 &&
        dist > 0 &&
        ((currentWord.length <= 5 && dist === 1) ||
          (currentWord.length > 5 && dist <= 2));

      // Case 1: Correct Guess!
      if (isGuess && !isDrawer) {
        if (alreadyGuessed) return;

        room.guessed.push(uid);

        addChatMessage(room, {
          userId: uid,
          userName: displayName || "Player",
          text: "Correctly guessed the word!",
          isCorrectGuess: true,
        });

        // Calculate remaining seconds & award points to guesser
        const endTs = room.roundEndTimestamp || Date.now();
        const remainingSeconds = Math.max(
          0,
          Math.ceil((endTs - Date.now()) / 1000)
        );
        const guesserPoints = 10 + remainingSeconds;
        room.scores[uid] = (room.scores[uid] || 0) + guesserPoints;

        const guesserPlayer = room.players.find((p) => p.uid === uid);
        if (guesserPlayer) guesserPlayer.points = room.scores[uid];

        // Check if all non-drawer players have guessed
        const nonDrawerPlayers = room.players.filter(
          (p) => p.uid !== room.currentDrawer
        );
        const allGuessed =
          nonDrawerPlayers.length > 0 &&
          nonDrawerPlayers.every((p) => room.guessed.includes(p.uid));

        if (!allGuessed) {
          broadcastRoomState(room.id);
          return;
        }

        // Everyone guessed! Award drawer points and advance turn immediately
        const drawerPointsPerGuesser = 5 + Math.floor(remainingSeconds / 2);
        const numGuessers = nonDrawerPlayers.filter((p) =>
          room.guessed.includes(p.uid)
        ).length;

        if (room.currentDrawer) {
          room.scores[room.currentDrawer] =
            (room.scores[room.currentDrawer] || 0) +
            drawerPointsPerGuesser * numGuessers;
          const drawerPlayer = room.players.find(
            (p) => p.uid === room.currentDrawer
          );
          if (drawerPlayer) {
            drawerPlayer.points = room.scores[room.currentDrawer];
          }
        }

        advanceToNextTurn(room);
        return;
      }

      // Case 2: Close Guess ("So Close!")
      if (isClose && !isDrawer && !alreadyGuessed) {
        addChatMessage(room, {
          userId: uid,
          userName: displayName || "Player",
          text: `${displayName || "Player"} is close!`,
          isCorrectGuess: false,
          isCloseGuess: true,
        });
        return;
      }

      // Case 3: Normal Chat Message (prevent drawer or already-guessed players from leaking the secret word)
      if (
        (isDrawer || alreadyGuessed) &&
        currentWord &&
        text.toLowerCase().includes(currentWord.toLowerCase())
      ) {
        return;
      }

      addChatMessage(room, {
        userId: uid,
        userName: displayName || "Player",
        text,
        isCorrectGuess: false,
      });
    }
  );

  // 9. EXPLICIT ROOM LEAVE
  socket.on(
    "room:leave",
    (payload: { roomId: string; userId: string; withMessage?: boolean }) => {
      const { roomId, userId, withMessage = true } = payload;
      socket.leave(roomId);
      if (boundRoomId === roomId) {
        boundRoomId = null;
        boundUserId = null;
      }
      removePlayerFromRoom(roomId, userId, withMessage);
    }
  );

  // 10. AUTOMATIC DISCONNECT CLEANUP (Replaces all 220 lines of heartbeats & RTDB presence!)
  socket.on("disconnect", () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    if (boundRoomId && boundUserId) {
      removePlayerFromRoom(boundRoomId, boundUserId, true);
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", activeRooms: rooms.size });
});

const PORT = process.env.PORT || 3001;
server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🎨 Scribbles WebSocket Server running on port ${PORT}`);
});