import GRADIENTS from "@/data/gradients";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useToast } from "../context/ToastContext";
import { auth, db, firestore } from "../firebaseConfig";
import InviteFriendsModal from "./InviteFriendsModal";

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function WaitingLobby({
  visible,
  onClose,
  onLeave,
  roomId,
  players,
  hostId,
  onStart,
}: {
  visible: boolean;
  onClose: () => void; // hide
  onLeave?: () => void; // leave and navigate
  roomId: string;
  players: any[];
  hostId?: string;
  onStart?: () => void;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const { playSound, showAlert } = useToast();
  const me = auth.currentUser;

  const leaveRoom = async () => {
    showAlert({
      title: "Leave Lobby",
      message: "Do you want to leave this lobby?",
      buttons: [
        {
          text: "Wait",
          style: "cancel",
          onPress: () => {
            playSound(require("../assets/sounds/click.mp3"));
          },
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            playSound(require("../assets/sounds/decline.mp3"));
            try {
              if (!me) return;
              await db
                .collection("games")
                .doc(roomId)
                .update({
                  players: firestore.FieldValue.arrayRemove(me.uid),
                });
            } catch (e) {
              console.error("Failed to leave room", e);
            }
            if (onLeave) onLeave();
            else onClose();
          },
        },
      ],
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Lobby: {roomId}</Text>
            <Text style={styles.subtitle}>Waiting for players...</Text>
          </View>

          <ScrollView contentContainerStyle={styles.avatarsContainer}>
            {players.map((p) => (
              <View key={p.uid} style={styles.avatarItem}>
                <LinearGradient
                  colors={
                    p.avatarGradientIndex !== undefined &&
                    p.avatarGradientIndex >= 0 &&
                    p.avatarGradientIndex < AVATAR_GRADIENTS.length
                      ? AVATAR_GRADIENTS[p.avatarGradientIndex]
                      : getAvatarGradient(p.uid)
                  }
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>
                    {p.displayName?.[0]?.toUpperCase()}
                  </Text>
                </LinearGradient>
                <Text style={styles.name} numberOfLines={1}>
                  {p.displayName}
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => {
                setShowInvite(true);
                playSound(require("../assets/sounds/click.mp3"));
              }}
            >
              <Ionicons name="add" size={30} color="#666" />
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.leaveBtn} onPress={leaveRoom}>
              <Text style={styles.leaveText}>Leave</Text>
            </TouchableOpacity>
            {hostId === me?.uid && (
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => {
                  onStart && onStart();
                  playSound(require("../assets/sounds/gameStart.mp3"));
                }}
              >
                <Text style={styles.startText}>Start Game</Text>
              </TouchableOpacity>
            )}
          </View>

          <InviteFriendsModal
            visible={showInvite}
            onClose={() => setShowInvite(false)}
            roomId={roomId}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    maxHeight: "80%",
    elevation: 5,
  },
  header: {
    marginBottom: 20,
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#333" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  avatarsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 15,
    paddingBottom: 20,
  },
  avatarItem: {
    alignItems: "center",
    width: 70,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  name: {
    fontSize: 12,
    color: "#333",
    textAlign: "center",
    fontWeight: "600",
  },
  inviteBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderWidth: 2,
    borderColor: "#ccc",
    borderStyle: "dashed",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  leaveBtn: {
    flex: 1,
    padding: 15,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    alignItems: "center",
  },
  leaveText: {
    color: "#991b1b",
    fontWeight: "bold",
    fontSize: 16,
  },
  startBtn: {
    flex: 1,
    padding: 15,
    backgroundColor: "#ff9900",
    borderRadius: 12,
    alignItems: "center",
  },
  startText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 16,
  },
});
