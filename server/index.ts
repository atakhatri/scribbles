import http from "http";
import { Server, Socket } from "socket.io";
import { WORDS_POOL } from "../components/words";

const PORT = Number(process.env.PORT) || 3001;

export interface Stroke {
  path: string;
  color: string;
  width: number;
  fill?: boolean;
}

export interface RoomPlayer {
  uid: string;
  displayName: string;
  avatar?: string | null;
  avatarGradientIndex?: number;
  points: number;
}

export interface ChatMessage {
  id: string;
  user: string;
  userId?: string;
  text: string;
  timestamp?: number;
  system?: boolean;
  type?: "system" | "correct" | "close" | "chat";
  sound?: "correct" | "correct2" | "soClose";
}

export interface RoomState {
  id: string;
  roomId: string;
  hostId: string;
  status: "waiting" | "playing" | "finished";
  players: RoomPlayer[];
  currentDrawer: string;
  word: string;
  currentWord: string;
  strokes: Stroke[];
  liveStroke: Stroke | null;
  round: number;
  maxRounds: number;
  scores: Record<string, number>;
  guessed: string[];
  messages: ChatMessage[];
  roundEndTimestamp: number | null;
  lobbyEnteredAt: number | null;
  serverNow: number;
}

const rooms = new Map<string, RoomState>();
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const emptyRoomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const socketToRoom = new Map<string, { roomId: string; uid: string }>();

const CHOOSE_WORD_SECONDS = 30;
const DRAW_ROUND_SECONDS = 120;

// HTTP server with /health endpoint for Render.com & UptimeRobot
const httpServer = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "scribbles-websocket-server",
        activeRooms: rooms.size,
        uptimeSeconds: Math.floor(process.uptime()),
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// --- Helper Functions ---
const generateRoomCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
};

const pickRandomWord = (): string => {
  const pool =
    Array.isArray(WORDS_POOL) && WORDS_POOL.length > 0
      ? WORDS_POOL
      : ["APPLE", "BANANA", "GUITAR", "ROCKET", "CASTLE"];
  return pool[Math.floor(Math.random() * pool.length)].toUpperCase();
};

const isCloseGuess = (guess: string, target: string): boolean => {
  const a = guess.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (!a || !b || a === b) return false;
  if (Math.abs(a.length - b.length) > 2 || b.length < 3) return false;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  const distance = matrix[a.length][b.length];
  return distance === 1 || (b.length >= 6 && distance === 2);
};

const clearRoomTimer = (roomId: string) => {
  const timer = roomTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    roomTimers.delete(roomId);
  }
};

const clearEmptyRoomCleanupTimer = (roomId: string) => {
  const timer = emptyRoomCleanupTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    emptyRoomCleanupTimers.delete(roomId);
  }
};

const serializeRoom = (room: RoomState): RoomState => ({
  ...room,
  serverNow: Date.now(),
});

const emitRoomState = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room:state", serializeRoom(room));
};

const emitChatMessage = (roomId: string, msg: ChatMessage) => {
  const room = rooms.get(roomId);
  if (room) {
    room.messages.push(msg);
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }
  }
  io.to(roomId).emit("chat:message", msg);
};

const emitSystemMessage = (
  roomId: string,
  text: string,
  extra?: Partial<ChatMessage>,
) => {
  emitChatMessage(roomId, {
    id: `${Date.now()}-${Math.random()}`,
    user: "System",
    userId: "system",
    text,
    timestamp: Date.now(),
    system: true,
    type: "system",
    ...extra,
  });
};

const startWordSelectionPhase = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  clearRoomTimer(roomId);

  room.word = "";
  room.currentWord = "";
  room.strokes = [];
  room.liveStroke = null;
  room.guessed = [];
  room.roundEndTimestamp = Date.now() + CHOOSE_WORD_SECONDS * 1000;

  const drawerObj = room.players.find((p) => p.uid === room.currentDrawer);
  emitRoomState(roomId);
  emitSystemMessage(
    roomId,
    `🎨 ${drawerObj?.displayName || "Drawer"} is choosing a word...`,
  );

  const timer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.status !== "playing" || r.word) return;
    selectWordForRoom(roomId, pickRandomWord());
  }, CHOOSE_WORD_SECONDS * 1000);

  roomTimers.set(roomId, timer);
};

const selectWordForRoom = (roomId: string, word: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  clearRoomTimer(roomId);

  const cleanWord = word.trim().toUpperCase();
  room.word = cleanWord;
  room.currentWord = cleanWord;
  room.strokes = [];
  room.liveStroke = null;
  room.guessed = [];
  room.roundEndTimestamp = Date.now() + DRAW_ROUND_SECONDS * 1000;

  emitRoomState(roomId);
  emitSystemMessage(
    roomId,
    `✏️ The word has ${cleanWord.replace(/\s+/g, "").length} letters! Start guessing!`,
  );

  const timer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.status !== "playing") return;
    emitSystemMessage(roomId, `⏰ Time's up! The word was "${r.word}".`);
    advanceTurn(roomId);
  }, DRAW_ROUND_SECONDS * 1000);

  roomTimers.set(roomId, timer);
};

const advanceTurn = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  clearRoomTimer(roomId);

  if (room.players.length < 2) {
    room.status = "finished";
    room.roundEndTimestamp = null;
    emitRoomState(roomId);
    return;
  }

  const currentIdx = room.players.findIndex(
    (p) => p.uid === room.currentDrawer,
  );
  let nextIdx = currentIdx + 1;
  let nextRound = room.round;

  if (nextIdx >= room.players.length) {
    nextIdx = 0;
    nextRound += 1;
  }

  if (nextRound > room.maxRounds) {
    room.status = "finished";
    room.roundEndTimestamp = null;
    room.liveStroke = null;
    emitRoomState(roomId);
    return;
  }

  room.round = nextRound;
  room.currentDrawer = room.players[nextIdx].uid;
  startWordSelectionPhase(roomId);
};

const removePlayerFromRoom = (
  socket: Socket,
  roomId: string,
  uid: string,
  withMessage = false,
) => {
  socketToRoom.delete(socket.id);
  socket.leave(roomId);

  const room = rooms.get(roomId);
  if (!room) return;

  const leavingPlayer = room.players.find((p) => p.uid === uid);
  const wasDrawer = room.currentDrawer === uid;
  room.players = room.players.filter((p) => p.uid !== uid);

  if (room.players.length === 0) {
    clearRoomTimer(roomId);
    clearEmptyRoomCleanupTimer(roomId);
    const deleteTimer = setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.players.length === 0) {
        rooms.delete(roomId);
      }
      emptyRoomCleanupTimers.delete(roomId);
    }, 15000);
    emptyRoomCleanupTimers.set(roomId, deleteTimer);
    return;
  }

  if (room.hostId === uid) {
    room.hostId = room.players[0].uid;
  }

  if (withMessage && leavingPlayer) {
    emitSystemMessage(roomId, `👋 ${leavingPlayer.displayName} left the room.`);
  }

  if (room.status === "playing") {
    if (room.players.length < 2) {
      clearRoomTimer(roomId);
      room.status = "finished";
      room.roundEndTimestamp = null;
      emitSystemMessage(roomId, "🏁 Not enough players to continue!");
      emitRoomState(roomId);
      return;
    }

    if (wasDrawer) {
      room.currentDrawer = room.players[0].uid;
      startWordSelectionPhase(roomId);
      return;
    }

    const nonDrawers = room.players.filter((p) => p.uid !== room.currentDrawer);
    const allGuessed =
      nonDrawers.length > 0 &&
      nonDrawers.every((p) => room.guessed.includes(p.uid));

    if (allGuessed && room.word) {
      advanceTurn(roomId);
      return;
    }
  }

  emitRoomState(roomId);
};

// --- Socket.io Event Handlers ---
io.on("connection", (socket: Socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  // 1. Create Room
  socket.on("room:create", (payload: any, callback?: (res: any) => void) => {
    try {
      const u = payload?.user || payload;
      const uid = u?.uid || payload?.userId;
      if (!uid) {
        callback?.({ ok: false, error: "Authentication required" });
        return;
      }

      const displayName =
        u?.displayName || u?.name || payload?.name || "Player";
      const avatar = u?.avatar || null;
      const avatarGradientIndex = u?.avatarGradientIndex;
      const maxRounds = Number(payload?.maxRounds) || 3;
      const enterImmediately = Boolean(payload?.enterImmediately);

      const roomId = generateRoomCode();
      const hostPlayer: RoomPlayer = {
        uid,
        displayName,
        avatar,
        avatarGradientIndex,
        points: 0,
      };

      const newRoom: RoomState = {
        id: roomId,
        roomId,
        hostId: uid,
        status: "waiting",
        players: [hostPlayer],
        currentDrawer: uid,
        word: "",
        currentWord: "",
        strokes: [],
        liveStroke: null,
        round: 1,
        maxRounds,
        scores: { [uid]: 0 },
        guessed: [],
        messages: [],
        roundEndTimestamp: null,
        lobbyEnteredAt: enterImmediately ? Date.now() : null,
        serverNow: Date.now(),
      };

      rooms.set(roomId, newRoom);
      clearEmptyRoomCleanupTimer(roomId);
      socket.join(roomId);
      socketToRoom.set(socket.id, { roomId, uid });

      callback?.({
        ok: true,
        roomId,
        state: serializeRoom(newRoom),
      });
    } catch (err) {
      console.error("Error in room:create:", err);
      callback?.({ ok: false, error: "Failed to create room" });
    }
  });

  // 2. Check Room Exists
  socket.on(
    "room:check",
    (payload: { roomId: string }, callback?: (res: any) => void) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.status === "finished") {
        callback?.({ exists: false, error: "Room not found" });
        return;
      }
      callback?.({
        exists: true,
        status: room.status,
        playerCount: room.players.length,
      });
    },
  );

  // 3. Join Room (Auto-creates room if joining via direct code/link and room doesn't exist yet)
  socket.on("room:join", (payload: any, callback?: (res: any) => void) => {
    try {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const u = payload?.user || payload;
      const uid = u?.uid || payload?.userId;

      if (!code || !uid) {
        callback?.({ ok: false, error: "Invalid room or user" });
        return;
      }

      let room = rooms.get(code);
      const displayName =
        u?.displayName || u?.name || payload?.name || "Player";
      const avatar = u?.avatar || null;
      const avatarGradientIndex = u?.avatarGradientIndex;

      if (!room) {
        // If joining a code that hasn't been created yet, auto-create it with this user as host
        const hostPlayer: RoomPlayer = {
          uid,
          displayName,
          avatar,
          avatarGradientIndex,
          points: 0,
        };
        room = {
          id: code,
          roomId: code,
          hostId: uid,
          status: "waiting",
          players: [hostPlayer],
          currentDrawer: uid,
          word: "",
          currentWord: "",
          strokes: [],
          liveStroke: null,
          round: 1,
          maxRounds: 3,
          scores: { [uid]: 0 },
          guessed: [],
          messages: [],
          roundEndTimestamp: null,
          lobbyEnteredAt: null,
          serverNow: Date.now(),
        };
        rooms.set(code, room);
      } else {
        clearEmptyRoomCleanupTimer(code);
        const existing = room.players.find((p) => p.uid === uid);
        if (existing) {
          existing.displayName = displayName || existing.displayName;
          if (avatar !== undefined) existing.avatar = avatar;
          if (avatarGradientIndex !== undefined) {
            existing.avatarGradientIndex = avatarGradientIndex;
          }
        } else {
          if (room.players.length >= 8) {
            callback?.({ ok: false, error: "Room is full (max 8 players)" });
            return;
          }
          const currentScore = room.scores[uid] ?? 0;
          room.players.push({
            uid,
            displayName,
            avatar,
            avatarGradientIndex,
            points: currentScore,
          });
          if (room.scores[uid] === undefined) {
            room.scores[uid] = 0;
          }
          emitSystemMessage(code, `🎉 ${displayName} joined the room!`);
        }
      }

      socket.join(code);
      socketToRoom.set(socket.id, { roomId: code, uid });

      emitRoomState(code);
      callback?.({
        ok: true,
        state: serializeRoom(room),
      });
    } catch (err) {
      console.error("Error in room:join:", err);
      callback?.({ ok: false, error: "Failed to join room" });
    }
  });

  socket.on(
    "room:updateRounds",
    (payload: { roomId: string; userId: string; maxRounds: number }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      const uid = payload?.userId || (payload as any)?.uid;
      if (!room || room.hostId !== uid) return;
      room.maxRounds = Math.max(1, Math.min(20, Number(payload.maxRounds) || 3));
      emitRoomState(code);
    },
  );

  socket.on(
    "room:enterLobbyForAll",
    (payload: { roomId: string; userId: string }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      const uid = payload?.userId || (payload as any)?.uid;
      if (!room || room.hostId !== uid) return;
      room.lobbyEnteredAt = Date.now();
      emitRoomState(code);
    },
  );

  socket.on(
    "room:cancel",
    (payload: { roomId: string; userId?: string; uid?: string }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      const uid = payload?.userId || payload?.uid;
      if (!room || room.hostId !== uid) return;
      clearRoomTimer(code);
      io.to(code).emit("room:closed", {
        reason: "Lobby was closed by the host.",
      });
      rooms.delete(code);
    },
  );

  socket.on(
    "room:leave",
    (payload: {
      roomId: string;
      userId?: string;
      uid?: string;
      withMessage?: boolean;
    }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const uid = payload?.userId || payload?.uid;
      if (!code || !uid) return;
      removePlayerFromRoom(socket, code, uid, Boolean(payload?.withMessage));
    },
  );

  socket.on(
    "game:start",
    (
      payload: { roomId: string; userId?: string; uid?: string },
      callback?: (res: { ok: boolean; error?: string }) => void,
    ) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const uid = payload?.userId || payload?.uid;
      const room = rooms.get(code);

      if (!room) {
        callback?.({ ok: false, error: "Room not found" });
        return;
      }
      if (room.hostId !== uid) {
        callback?.({ ok: false, error: "Only the host can start the game" });
        return;
      }
      if (room.players.length < 2) {
        callback?.({
          ok: false,
          error: "At least 2 players are required to start",
        });
        return;
      }

      room.status = "playing";
      room.round = 1;
      room.lobbyEnteredAt = Date.now();
      room.scores = {};
      room.players.forEach((p) => {
        p.points = 0;
        room.scores[p.uid] = 0;
      });
      room.currentDrawer = room.players[0].uid;

      callback?.({ ok: true });
      startWordSelectionPhase(code);
    },
  );

  const handleSelectWordEvent = (payload: {
    roomId: string;
    userId?: string;
    uid?: string;
    word: string;
  }) => {
    const code = (payload?.roomId || "").trim().toUpperCase();
    const uid = payload?.userId || payload?.uid;
    const room = rooms.get(code);
    if (!room || room.status !== "playing" || room.currentDrawer !== uid) {
      return;
    }
    if (!payload.word || !payload.word.trim()) return;
    selectWordForRoom(code, payload.word);
  };

  socket.on("game:selectWord", handleSelectWordEvent);
  socket.on("game:pick_word", handleSelectWordEvent);

  const handleLiveStrokeEvent = (payload: {
    roomId: string;
    userId?: string;
    stroke: Stroke | null;
  }) => {
    const code = (payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;
    room.liveStroke = payload.stroke;
    socket.to(code).emit("draw:live", payload.stroke);
  };

  socket.on("draw:live", handleLiveStrokeEvent);
  socket.on("canvas:stroke_live", handleLiveStrokeEvent);

  const handleStrokeCommitEvent = (payload: {
    roomId: string;
    userId?: string;
    stroke: Stroke;
  }) => {
    const code = (payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room || !payload?.stroke) return;
    room.liveStroke = null;
    room.strokes.push(payload.stroke);
    io.to(code).emit("draw:strokesUpdated", room.strokes);
  };

  socket.on("draw:stroke", handleStrokeCommitEvent);
  socket.on("canvas:stroke_commit", handleStrokeCommitEvent);

  socket.on(
    "canvas:undo",
    (payload: { roomId: string; userId?: string }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.strokes.length === 0) return;
      room.strokes.pop();
      room.liveStroke = null;
      io.to(code).emit("draw:strokesUpdated", room.strokes);
    },
  );

  socket.on(
    "canvas:clear",
    (payload: { roomId: string; userId?: string }) => {
      const code = (payload?.roomId || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return;
      room.strokes = [];
      room.liveStroke = null;
      io.to(code).emit("draw:strokesUpdated", room.strokes);
    },
  );

  const handleChatEvent = (
    payload: {
      roomId: string;
      user?: { uid: string; displayName: string };
      uid?: string;
      userId?: string;
      username?: string;
      text: string;
    },
    callback?: (res: { ok: boolean }) => void,
  ) => {
    const code = (payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      callback?.({ ok: false });
      return;
    }

    const senderUid =
      payload?.user?.uid || payload?.userId || payload?.uid || "anon";
    const senderName =
      payload?.user?.displayName ||
      payload?.username ||
      room.players.find((p) => p.uid === senderUid)?.displayName ||
      "Player";
    const trimmed = (payload?.text || "").trim();

    if (!trimmed) {
      callback?.({ ok: false });
      return;
    }

    const secretWord = (room.word || room.currentWord || "").trim();
    const isGuessPhase = room.status === "playing" && secretWord.length > 0;
    const isDrawer = room.currentDrawer === senderUid;
    const alreadyGuessed = room.guessed.includes(senderUid);

    if (isGuessPhase && !isDrawer && !alreadyGuessed) {
      if (trimmed.toLowerCase() === secretWord.toLowerCase()) {
        const isFirstGuesser = room.guessed.length === 0;
        room.guessed.push(senderUid);

        const guesserPoints = isFirstGuesser ? 10 : 7;
        const drawerPoints = 5;

        room.scores[senderUid] = (room.scores[senderUid] || 0) + guesserPoints;
        room.scores[room.currentDrawer] =
          (room.scores[room.currentDrawer] || 0) + drawerPoints;

        room.players.forEach((p) => {
          p.points = room.scores[p.uid] || 0;
        });

        emitChatMessage(code, {
          id: `${Date.now()}-${Math.random()}`,
          user: "System",
          userId: senderUid,
          text: `🎉 ${senderName} guessed the word! (+${guesserPoints} pts)`,
          timestamp: Date.now(),
          system: true,
          type: "correct",
          sound: isFirstGuesser ? "correct" : "correct2",
        });

        emitRoomState(code);
        callback?.({ ok: true });

        const nonDrawers = room.players.filter(
          (p) => p.uid !== room.currentDrawer,
        );
        const allGuessed =
          nonDrawers.length > 0 &&
          nonDrawers.every((p) => room.guessed.includes(p.uid));

        if (allGuessed) {
          setTimeout(() => {
            advanceTurn(code);
          }, 1200);
        }
        return;
      }

      if (isCloseGuess(trimmed, secretWord)) {
        emitChatMessage(code, {
          id: `${Date.now()}-${Math.random()}`,
          user: "System",
          userId: senderUid,
          text: `🤏 "${trimmed}" is so close!`,
          timestamp: Date.now(),
          system: true,
          type: "close",
          sound: "soClose",
        });
        callback?.({ ok: true });
        return;
      }
    }

    if (
      isGuessPhase &&
      (isDrawer || alreadyGuessed) &&
      trimmed.toLowerCase().includes(secretWord.toLowerCase())
    ) {
      callback?.({ ok: false });
      return;
    }

    emitChatMessage(code, {
      id: `${Date.now()}-${Math.random()}`,
      user: senderName,
      userId: senderUid,
      text: trimmed,
      timestamp: Date.now(),
      system: false,
      type: "chat",
    });
    callback?.({ ok: true });
  };

  socket.on("chat:send", handleChatEvent);
  socket.on("chat:message", handleChatEvent);

  socket.on("disconnect", () => {
    const info = socketToRoom.get(socket.id);
    if (!info) return;
    removePlayerFromRoom(socket, info.roomId, info.uid, true);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Scribbles WebSocket Server running on port ${PORT}`);
});