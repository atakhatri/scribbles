import http from "http";
import { Server, Socket } from "socket.io";
import { WORDS_POOL } from "../components/words";

const PORT = Number(process.env.PORT) || 3001;

export interface Stroke {
  path: string;
  color: string;
  width: number;
}

export interface PlayerInfo {
  name: string;
  avatarGradientIndex: number;
}

export interface RoomState {
  roomId: string;
  hostId: string;
  status: "waiting" | "playing" | "finished";
  players: string[];
  playerInfo: Record<string, PlayerInfo>;
  scores: Record<string, number>;
  drawer: string;
  word: string;
  wordOptions: string[];
  isChoosingWord: boolean;
  chooseWordStartTime: number | null;
  roundStartTime: number | null;
  roundDuration: number;
  roundNumber: number;
  maxRounds: number;
  strokes: Stroke[];
  canvasFillColor: string;
  guessedPlayers: string[];
  turnOrder: string[];
  currentTurnIndex: number;
  winnerId?: string | null;
  serverNow?: number;
  remainingSeconds?: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  type: "chat" | "correct" | "close" | "system";
  timestamp: number;
}

const rooms = new Map<string, RoomState>();
// Using ReturnType<typeof setTimeout> avoids NodeJS.Timeout vs number conflicts in Expo's tsconfig!
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const socketToRoom = new Map<
  string,
  { roomId: string; uid: string; inGame: boolean }
>();

// Create an HTTP server with a health-check route for Render / Railway
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
  let code = "";
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
};

const getRandomWords = (count = 3): string[] => {
  const shuffled = [...WORDS_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Levenshtein distance for "So Close!" guess detection
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

const computeRemainingSeconds = (room: RoomState, now: number): number => {
  if (room.status !== "playing") return 0;
  if (room.isChoosingWord && room.chooseWordStartTime) {
    const elapsed = Math.floor((now - room.chooseWordStartTime) / 1000);
    return Math.max(0, 30 - elapsed);
  }
  if (!room.isChoosingWord && room.roundStartTime) {
    const elapsed = Math.floor((now - room.roundStartTime) / 1000);
    return Math.max(0, (room.roundDuration || 120) - elapsed);
  }
  return 0;
};

const emitRoomState = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  const now = Date.now();
  io.to(roomId).emit("room:state", {
    ...room,
    serverNow: now,
    remainingSeconds: computeRemainingSeconds(room, now),
  });
};

const emitSystemMessage = (roomId: string, text: string) => {
  const msg: ChatMessage = {
    id: `${Date.now()}-${Math.random()}`,
    userId: "system",
    username: "System",
    text,
    type: "system",
    timestamp: Date.now(),
  };
  io.to(roomId).emit("chat:message", msg);
};

// Advance to next drawer or finish the game
const advanceTurn = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  clearRoomTimer(roomId);

  const activeTurnOrder = room.turnOrder.filter((id) =>
    room.players.includes(id),
  );
  room.turnOrder =
    activeTurnOrder.length > 0 ? activeTurnOrder : [...room.players];

  if (room.turnOrder.length < 2) {
    room.status = "finished";
    emitRoomState(roomId);
    return;
  }

  let nextTurnIndex = room.currentTurnIndex + 1;
  let nextRoundNumber = room.roundNumber;

  if (nextTurnIndex >= room.turnOrder.length) {
    nextTurnIndex = 0;
    nextRoundNumber += 1;
  }

  if (nextRoundNumber > room.maxRounds) {
    room.status = "finished";
    let maxScore = -1;
    let winnerId: string | null = null;
    for (const [uid, score] of Object.entries(room.scores)) {
      if (score > maxScore) {
        maxScore = score;
        winnerId = uid;
      }
    }
    room.winnerId = winnerId;
    emitRoomState(roomId);
    return;
  }

  const nextDrawer = room.turnOrder[nextTurnIndex];
  room.currentTurnIndex = nextTurnIndex;
  room.roundNumber = nextRoundNumber;
  room.drawer = nextDrawer;
  room.word = "";
  room.wordOptions = getRandomWords(3);
  room.isChoosingWord = true;
  room.chooseWordStartTime = Date.now();
  room.roundStartTime = null;
  room.strokes = [];
  room.canvasFillColor = "#FFFFFF";
  room.guessedPlayers = [];

  emitRoomState(roomId);

  const drawerName = room.playerInfo[nextDrawer]?.name || "Drawer";
  emitSystemMessage(roomId, `🎨 ${drawerName} is choosing a word...`);

  // 30s server timer to pick a word
  const timer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.status !== "playing" || !r.isChoosingWord) return;
    const autoWord =
      r.wordOptions[Math.floor(Math.random() * r.wordOptions.length)] ||
      getRandomWords(1)[0];
    selectWordForRoom(roomId, autoWord);
  }, 30000);

  roomTimers.set(roomId, timer);
};

const selectWordForRoom = (roomId: string, chosenWord: string) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "playing") return;

  clearRoomTimer(roomId);

  room.word = chosenWord;
  room.isChoosingWord = false;
  room.chooseWordStartTime = null;
  room.roundStartTime = Date.now();
  room.strokes = [];
  room.canvasFillColor = "#FFFFFF";

  emitRoomState(roomId);
  emitSystemMessage(
    roomId,
    `✏️ The word has ${chosenWord.length} letters! Start guessing!`,
  );

  // 120s server timer for drawing round
  const timer = setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.status !== "playing" || r.isChoosingWord) return;
    emitSystemMessage(roomId, `⏰ Time's up! The word was "${r.word}".`);
    advanceTurn(roomId);
  }, room.roundDuration * 1000);

  roomTimers.set(roomId, timer);
};

const handlePlayerLeave = (socket: Socket, explicitLeave = false) => {
  const info = socketToRoom.get(socket.id);
  if (!info) return;

  const { roomId, uid, inGame } = info;
  socketToRoom.delete(socket.id);
  socket.leave(roomId);

  const room = rooms.get(roomId);
  if (!room) return;

  if (
    room.status === "waiting" &&
    room.hostId === uid &&
    !inGame &&
    explicitLeave
  ) {
    clearRoomTimer(roomId);
    io.to(roomId).emit("room:closed", {
      reason: "Host cancelled the waiting group.",
    });
    rooms.delete(roomId);
    return;
  }

  const leavingName = room.playerInfo[uid]?.name || "A player";
  room.players = room.players.filter((id) => id !== uid);

  if (room.players.length === 0) {
    clearRoomTimer(roomId);
    rooms.delete(roomId);
    return;
  }

  if (room.hostId === uid) {
    room.hostId = room.players[0];
  }

  if (room.status === "playing") {
    emitSystemMessage(roomId, `👋 ${leavingName} left the game.`);

    if (room.players.length < 2) {
      clearRoomTimer(roomId);
      room.status = "finished";
      emitSystemMessage(roomId, `🏁 Not enough players to continue!`);
      emitRoomState(roomId);
      return;
    }

    if (room.drawer === uid) {
      room.currentTurnIndex = Math.max(-1, room.currentTurnIndex - 1);
      advanceTurn(roomId);
      return;
    }

    const nonDrawers = room.players.filter((id) => id !== room.drawer);
    const allGuessed =
      nonDrawers.length > 0 &&
      nonDrawers.every((id) => room.guessedPlayers.includes(id));

    if (allGuessed && !room.isChoosingWord) {
      emitSystemMessage(
        roomId,
        `🎉 Everyone guessed the word "${room.word}"!`,
      );
      advanceTurn(roomId);
      return;
    }
  }

  emitRoomState(roomId);
};

// --- Socket.io Connections ---
io.on("connection", (socket: Socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  socket.on(
    "room:create",
    (
      payload: {
        uid: string;
        name: string;
        avatarGradientIndex: number;
      },
      callback?: (res: {
        ok: boolean;
        roomId?: string;
        state?: RoomState;
        error?: string;
      }) => void,
    ) => {
      try {
        const roomId = generateRoomCode();
        const newRoom: RoomState = {
          roomId,
          hostId: payload.uid,
          status: "waiting",
          players: [payload.uid],
          playerInfo: {
            [payload.uid]: {
              name: payload.name || "Player",
              avatarGradientIndex: payload.avatarGradientIndex ?? 0,
            },
          },
          scores: { [payload.uid]: 0 },
          drawer: payload.uid,
          word: "",
          wordOptions: [],
          isChoosingWord: false,
          chooseWordStartTime: null,
          roundStartTime: null,
          roundDuration: 120,
          roundNumber: 1,
          maxRounds: 3,
          strokes: [],
          canvasFillColor: "#FFFFFF",
          guessedPlayers: [],
          turnOrder: [payload.uid],
          currentTurnIndex: 0,
        };

        rooms.set(roomId, newRoom);
        socket.join(roomId);
        socketToRoom.set(socket.id, {
          roomId,
          uid: payload.uid,
          inGame: false,
        });

        const now = Date.now();
        callback?.({
          ok: true,
          roomId,
          state: { ...newRoom, serverNow: now, remainingSeconds: 0 },
        });
      } catch (err) {
        callback?.({ ok: false, error: "Failed to create room" });
      }
    },
  );

  socket.on(
    "room:check",
    (
      payload: { roomId: string; uid?: string },
      callback?: (res: {
        exists: boolean;
        status?: string;
        playerCount?: number;
        error?: string;
      }) => void,
    ) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        callback?.({ exists: false, error: "Room not found." });
        return;
      }
      const isAlreadyIn = payload.uid && room.players.includes(payload.uid);
      if (room.players.length >= 8 && !isAlreadyIn) {
        callback?.({
          exists: true,
          status: room.status,
          error: "Room is full (max 8 players).",
        });
        return;
      }
      if (room.status === "finished") {
        callback?.({
          exists: true,
          status: room.status,
          error: "This game has already finished.",
        });
        return;
      }
      callback?.({
        exists: true,
        status: room.status,
        playerCount: room.players.length,
      });
    },
  );

  socket.on(
    "room:join",
    (
      payload: {
        roomId: string;
        uid: string;
        name: string;
        avatarGradientIndex: number;
        inGame?: boolean;
      },
      callback?: (res: {
        ok: boolean;
        state?: RoomState;
        error?: string;
      }) => void,
    ) => {
      const room = rooms.get(payload.roomId);
      if (!room) {
        callback?.({ ok: false, error: "Room does not exist." });
        return;
      }

      if (room.players.length >= 8 && !room.players.includes(payload.uid)) {
        callback?.({ ok: false, error: "Room is full!" });
        return;
      }

      if (!room.players.includes(payload.uid)) {
        room.players.push(payload.uid);
      }
      if (!room.turnOrder.includes(payload.uid)) {
        room.turnOrder.push(payload.uid);
      }
      if (room.scores[payload.uid] === undefined) {
        room.scores[payload.uid] = 0;
      }

      room.playerInfo[payload.uid] = {
        name: payload.name || "Player",
        avatarGradientIndex: payload.avatarGradientIndex ?? 0,
      };

      socket.join(payload.roomId);
      socketToRoom.set(socket.id, {
        roomId: payload.roomId,
        uid: payload.uid,
        inGame: Boolean(payload.inGame),
      });

      emitRoomState(payload.roomId);
      const now = Date.now();
      callback?.({
        ok: true,
        state: {
          ...room,
          serverNow: now,
          remainingSeconds: computeRemainingSeconds(room, now),
        },
      });
    },
  );

  socket.on(
    "room:leave",
    (payload: { roomId: string; uid: string; explicit?: boolean }) => {
      handlePlayerLeave(socket, Boolean(payload?.explicit));
    },
  );

  socket.on(
    "game:start",
    (payload: { roomId: string; uid: string; maxRounds?: number }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.hostId !== payload.uid) return;
      if (room.players.length < 2) return;

      const firstDrawer =
        room.players[Math.floor(Math.random() * room.players.length)];
      const otherPlayers = room.players.filter((id) => id !== firstDrawer);
      const turnOrder = [firstDrawer, ...otherPlayers];

      room.status = "playing";
      room.maxRounds = payload.maxRounds || 3;
      room.roundNumber = 1;
      room.turnOrder = turnOrder;
      room.currentTurnIndex = 0;
      room.drawer = firstDrawer;
      room.word = "";
      room.wordOptions = getRandomWords(3);
      room.isChoosingWord = true;
      room.chooseWordStartTime = Date.now();
      room.roundStartTime = null;
      room.strokes = [];
      room.canvasFillColor = "#FFFFFF";
      room.guessedPlayers = [];

      emitRoomState(payload.roomId);

      const drawerName = room.playerInfo[firstDrawer]?.name || "Drawer";
      emitSystemMessage(
        payload.roomId,
        `🚀 Game started! ${drawerName} is choosing a word...`,
      );

      clearRoomTimer(payload.roomId);
      const timer = setTimeout(() => {
        const r = rooms.get(payload.roomId);
        if (!r || r.status !== "playing" || !r.isChoosingWord) return;
        const autoWord =
          r.wordOptions[Math.floor(Math.random() * r.wordOptions.length)] ||
          getRandomWords(1)[0];
        selectWordForRoom(payload.roomId, autoWord);
      }, 30000);
      roomTimers.set(payload.roomId, timer);
    },
  );

  socket.on(
    "game:pick_word",
    (payload: { roomId: string; uid: string; word: string }) => {
      const room = rooms.get(payload.roomId);
      if (!room || room.drawer !== payload.uid || !room.isChoosingWord) return;
      selectWordForRoom(payload.roomId, payload.word);
    },
  );

  socket.on(
    "canvas:stroke_live",
    (payload: { roomId: string; stroke: Stroke | null }) => {
      socket.to(payload.roomId).emit("canvas:stroke_live", payload.stroke);
    },
  );

  socket.on(
    "canvas:stroke_commit",
    (payload: { roomId: string; stroke: Stroke }) => {
      const room = rooms.get(payload.roomId);
      if (!room) return;
      room.strokes.push(payload.stroke);
      socket.to(payload.roomId).emit("canvas:stroke_live", null);
      emitRoomState(payload.roomId);
    },
  );

  socket.on("canvas:undo", (payload: { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room || room.strokes.length === 0) return;
    room.strokes.pop();
    emitRoomState(payload.roomId);
  });

  socket.on("canvas:clear", (payload: { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    room.strokes = [];
    room.canvasFillColor = "#FFFFFF";
    socket.to(payload.roomId).emit("canvas:stroke_live", null);
    emitRoomState(payload.roomId);
  });

  socket.on("canvas:fill", (payload: { roomId: string; color: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    room.canvasFillColor = payload.color;
    emitRoomState(payload.roomId);
  });

  socket.on(
    "chat:send",
    (payload: {
      roomId: string;
      uid: string;
      username: string;
      text: string;
    }) => {
      const room = rooms.get(payload.roomId);
      if (!room) return;

      const trimmed = payload.text.trim();
      if (!trimmed) return;

      const isGuessingPhase =
        room.status === "playing" && !room.isChoosingWord && Boolean(room.word);
      const isDrawer = room.drawer === payload.uid;
      const alreadyGuessed = room.guessedPlayers.includes(payload.uid);

      if (isGuessingPhase && !isDrawer && !alreadyGuessed) {
        if (trimmed.toLowerCase() === room.word.toLowerCase().trim()) {
          room.guessedPlayers.push(payload.uid);

          const orderIndex = room.guessedPlayers.length - 1;
          const pointsEarned = Math.max(50, 100 - orderIndex * 15);
          room.scores[payload.uid] =
            (room.scores[payload.uid] || 0) + pointsEarned;
          room.scores[room.drawer] = (room.scores[room.drawer] || 0) + 25;

          const correctMsg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            userId: payload.uid,
            username: payload.username,
            text: `🎉 ${payload.username} guessed the word! (+${pointsEarned} pts)`,
            type: "correct",
            timestamp: Date.now(),
          };
          io.to(payload.roomId).emit("chat:message", correctMsg);
          emitRoomState(payload.roomId);

          const nonDrawers = room.players.filter((id) => id !== room.drawer);
          const allGuessed =
            nonDrawers.length > 0 &&
            nonDrawers.every((id) => room.guessedPlayers.includes(id));

          if (allGuessed) {
            setTimeout(() => {
              advanceTurn(payload.roomId);
            }, 1200);
          }
          return;
        }

        if (isCloseGuess(trimmed, room.word)) {
          const closeMsg: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            userId: payload.uid,
            username: payload.username,
            text: `🤏 "${trimmed}" is so close!`,
            type: "close",
            timestamp: Date.now(),
          };
          socket.emit("chat:message", closeMsg);
          return;
        }
      }

      if (
        isGuessingPhase &&
        (isDrawer || alreadyGuessed) &&
        trimmed.toLowerCase().includes(room.word.toLowerCase().trim())
      ) {
        return;
      }

      const chatMsg: ChatMessage = {
        id: `${Date.now()}-${Math.random()}`,
        userId: payload.uid,
        username: payload.username,
        text: trimmed,
        type: "chat",
        timestamp: Date.now(),
      };
      io.to(payload.roomId).emit("chat:message", chatMsg);
    },
  );

  socket.on("disconnect", () => {
    handlePlayerLeave(socket, false);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Scribbles WebSocket Server running on port ${PORT}`);
});