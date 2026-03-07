// c:\Users\atakh\Downloads\scribbles\context\ToastContext.tsx

import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ToastType = "success" | "error" | "info";

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface AlertButton {
  text: string;
  style?: "cancel" | "destructive" | "default";
  onPress?: () => void;
}

interface AlertOptions {
  title: string;
  message: string;
  buttons?: AlertButton[];
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showAlert: (options: AlertOptions) => void;
  playSound: (source?: any) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [alert, setAlert] = useState<AlertOptions | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-50)).current;

  const playSound = async (source = require("../assets/sounds/pop.mp3")) => {
    try {
      const { sound } = await Audio.Sound.createAsync(source);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log("Sound error", error);
    }
  };

  const showToast = useCallback(
    ({ message, type = "info", duration = 3000 }: ToastOptions) => {
      playSound();
      setToast({ message, type, duration });

      // Animate In
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide
      setTimeout(() => {
        hideToast();
      }, duration);
    },
    [],
  );

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -50,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  const showAlert = useCallback((options: AlertOptions) => {
    playSound();
    setAlert(options);
  }, []);

  const closeAlert = () => {
    setAlert(null);
  };

  return (
    <ToastContext.Provider value={{ showToast, showAlert, playSound }}>
      {children}

      {/* Toast Component */}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            { opacity: fadeAnim, transform: [{ translateY }] },
          ]}
          pointerEvents="none"
        >
          <View style={[styles.toastCard, typeStyles[toast.type || "info"]]}>
            <Ionicons
              name={
                toast.type === "success"
                  ? "checkmark-circle"
                  : toast.type === "error"
                    ? "alert-circle"
                    : "information-circle"
              }
              size={28}
              color="#333"
            />
            <Text style={styles.toastText}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}

      {/* Custom Alert Modal */}
      {alert && (
        <Modal transparent visible={!!alert} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.alertCard}>
              <View style={styles.tape} />
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertMessage}>{alert.message}</Text>
              <View style={styles.buttonRow}>
                {(alert.buttons || [{ text: "OK", onPress: () => {} }]).map(
                  (btn, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.alertButton,
                        btn.style === "destructive"
                          ? styles.destructiveBtn
                          : btn.style === "cancel"
                            ? styles.cancelBtn
                            : styles.defaultBtn,
                      ]}
                      onPress={() => {
                        if (btn.onPress) btn.onPress();
                        closeAlert();
                      }}
                    >
                      <Text
                        style={[
                          styles.alertButtonText,
                          btn.style === "destructive"
                            ? { color: "white" }
                            : { color: "#333" },
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ToastContext.Provider>
  );
};

const typeStyles = {
  success: { borderLeftColor: "#4ECDC4" },
  error: { borderLeftColor: "#FF6B6B" },
  info: { borderLeftColor: "#45B7D1" },
};

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: "center",
  },
  toastCard: {
    backgroundColor: "#fff9f2",
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#333",
    borderLeftWidth: 10,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 5,
    gap: 15,
    width: "100%",
    maxWidth: 400,
    transform: [{ rotate: "-1deg" }],
  },
  toastText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 16,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  alertCard: {
    backgroundColor: "#fff9f2",
    width: "100%",
    maxWidth: 320,
    padding: 25,
    borderWidth: 3,
    borderColor: "#333",
    borderRadius: 2,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 10,
    position: "relative",
  },
  tape: {
    position: "absolute",
    top: -15,
    width: 100,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.8)",
    transform: [{ rotate: "-2deg" }],
    borderWidth: 1,
    borderColor: "#ddd",
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  alertMessage: {
    fontSize: 16,
    color: "#555",
    marginBottom: 25,
    textAlign: "center",
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 15,
    justifyContent: "center",
    width: "100%",
    flexWrap: "wrap",
  },
  alertButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: "#333",
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  defaultBtn: { backgroundColor: "#4ECDC4" },
  destructiveBtn: { backgroundColor: "#FF6B6B" },
  cancelBtn: { backgroundColor: "#ddd" },
  alertButtonText: {
    fontWeight: "bold",
    fontSize: 14,
  },
});
