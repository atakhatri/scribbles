// c:\Users\atakh\Downloads\scribbles\components\GameInviteModal.tsx

import { Audio } from "expo-av";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface GameInviteModalProps {
  visible: boolean;
  invite: {
    inviterName: string;
    roomId: string;
    timestamp: number;
  } | null;
  onDecline: () => void;
  onAccept: () => void;
}

export default function GameInviteModal({
  visible,
  invite,
  onDecline,
  onAccept,
}: GameInviteModalProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible && invite) {
      playSound();
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();

      // Countdown Timer Animation
      const elapsed = Date.now() - (invite.timestamp || Date.now());
      const duration = 15000; // 15 seconds total lifetime
      const remaining = Math.max(0, duration - elapsed);

      progressAnim.setValue(remaining / duration);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }
  }, [visible, invite]);

  const playSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/pop.mp3"),
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
        }
      });
    } catch (error) {
      // console.log("Sound error", error);
    }
  };

  if (!visible || !invite) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[styles.modalContent, { transform: [{ scale: scaleAnim }] }]}
        >
          <View style={styles.tape} />
          <Text style={styles.modalTitle}>Game Invite! 🎮</Text>
          <Text style={styles.modalSubtitle}>
            {invite.inviterName} invited you to play.
          </Text>
          <View style={styles.timerContainer}>
            <Animated.View
              style={[
                styles.timerBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.modalButtons}>
            <TouchableOpacity onPress={onDecline} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onAccept} style={styles.confirmBtn}>
              <Text style={styles.confirmText}>Join Game</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tape2} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
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
    left: -40,
    width: 100,
    height: 30,
    backgroundColor: "rgba(205, 205, 205, 0.8)",
    transform: [{ rotate: "-80deg" }],
    borderWidth: 1,
    borderColor: "#000000",
  },
  tape2: {
    position: "absolute",
    top: -15,
    left: 230,
    width: 100,
    height: 30,
    backgroundColor: "rgba(205, 205, 205, 0.8)",
    transform: [{ rotate: "10deg" }],
    borderWidth: 1,
    borderColor: "#000000",
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#555",
    marginBottom: 15,
    textAlign: "center",
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 15,
    justifyContent: "center",
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#ddd",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  cancelText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#4ECDC4",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  confirmText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 14,
  },
  timerContainer: {
    width: "100%",
    height: 8,
    backgroundColor: "#eee",
    borderRadius: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#333",
    overflow: "hidden",
  },
  timerBar: {
    height: "100%",
    backgroundColor: "#FF6B6B",
  },
});
