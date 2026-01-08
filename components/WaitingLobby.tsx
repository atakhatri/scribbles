import { arrayRemove, doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";
import InviteFriendsModal from "./InviteFriendsModal";

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
  const me = auth.currentUser;

  const leaveRoom = async () => {
    try {
      if (!me) return;
      await updateDoc(doc(db, "games", roomId), {
        players: arrayRemove(me.uid),
      });
    } catch (e) {
      console.error("Failed to leave room", e);
    }
    if (onLeave) onLeave();
    else onClose();
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
            <Text style={styles.title}>Waiting Lobby</Text>
          </View>

          <Text style={styles.sub}>Room: {roomId}</Text>
          <FlatList
            data={players}
            keyExtractor={(i) => i.uid}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.points}>{item.points ?? 0} pts</Text>
              </View>
            )}
            style={{ marginTop: 10, marginBottom: 10 }}
            ListEmptyComponent={
              <Text style={styles.empty}>No players yet</Text>
            }
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={async () => {
                try {
                  const Clipboard = await import("expo-clipboard");
                  await Clipboard.setStringAsync(roomId);
                } catch (e) {
                  console.error("copy error", e);
                }
              }}
            >
              <Text style={styles.copyText}>Copy Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => setShowInvite(true)}
            >
              <Text style={styles.inviteText}>Invite Friends</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.leaveBtn} onPress={leaveRoom}>
              <Text style={styles.leaveText}>Leave</Text>
            </TouchableOpacity>
          </View>

          {hostId === me?.uid && (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => onStart && onStart()}
            >
              <Text style={styles.startText}>Start Game</Text>
            </TouchableOpacity>
          )}

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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "92%",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "700" },
  close: { color: "#333", fontWeight: "700" },
  sub: { marginTop: 8, color: "#555" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  name: { fontSize: 16 },
  points: { color: "#666" },
  empty: { textAlign: "center", color: "#666", padding: 20 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  copyBtn: { padding: 10, backgroundColor: "#f3f4f6", borderRadius: 8 },
  copyText: { color: "#333", fontWeight: "600" },
  inviteBtn: { padding: 10, backgroundColor: "#eef2ff", borderRadius: 8 },
  inviteText: { color: "#4338ca", fontWeight: "700" },
  leaveBtn: { padding: 10, backgroundColor: "#fee2e2", borderRadius: 8 },
  leaveText: { color: "#b91c1c", fontWeight: "700" },
  startBtn: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#4338ca",
    borderRadius: 8,
    alignItems: "center",
  },
  startText: { color: "white", fontWeight: "800" },
});
