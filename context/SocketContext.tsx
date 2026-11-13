import Constants from "expo-constants";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

// Automatically resolves your computer's LAN IP when running in Expo Go / Dev Client
const getSocketServerUrl = (): string => {
  if (process.env.EXPO_PUBLIC_SOCKET_URL) {
    return process.env.EXPO_PUBLIC_SOCKET_URL;
  }

  // Extract the LAN IP from Expo's bundler hostUri (e.g., "192.168.1.5:8081")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const lanIp = hostUri.split(":")[0];
    if (lanIp) {
      return `http://${lanIp}:3001`;
    }
  }

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

  useEffect(() => {
    const serverUrl = getSocketServerUrl();
    console.log("[SocketContext] Connecting to:", serverUrl);

    const socketInstance = io(serverUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      console.log("[SocketContext] Connected:", socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("[SocketContext] Disconnected:", reason);
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (err) => {
      if (__DEV__) {
        console.log("[SocketContext] Connection error:", err.message);
      }
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
