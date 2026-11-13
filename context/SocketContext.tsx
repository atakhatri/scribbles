import Constants from "expo-constants";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  serverUrl: string;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  serverUrl: "",
});

const getSocketServerUrl = (): string => {
  // 1. Always prioritize a deployed production WebSocket URL if set in .env or EAS
  if (process.env.EXPO_PUBLIC_SOCKET_URL) {
    return process.env.EXPO_PUBLIC_SOCKET_URL.trim();
  }

  // 2. Fallback: Auto-detect computer's LAN IP from Expo Metro bundler during local dev
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const lanIp = hostUri.split(":")[0];
    return `http://${lanIp}:3001`;
  }

  // 3. Emulator fallbacks
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3001";
  }

  return "http://localhost:3001";
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const serverUrl = getSocketServerUrl();

  useEffect(() => {
    const newSocket = io(serverUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    newSocket.on("connect", () => {
      console.log(`✅ Connected to Scribbles Socket Server (${serverUrl})`);
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("⚠️ Disconnected from Scribbles Socket Server");
      setIsConnected(false);
    });

    newSocket.on("connect_error", (err) => {
      console.log("Socket connect_error:", err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [serverUrl]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, serverUrl }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
