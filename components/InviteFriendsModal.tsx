import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useToast } from "../context/ToastContext";
import GRADIENTS from "../data/gradients";
import { auth, db } from "../firebaseConfig";

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function InviteFriendsModal({
  visible,
  onClose,
  roomId,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
}) {
  const [friends, setFriends] = useState<any[]>([]);
  const { showToast, playSound } = useToast();
  const [invitedIds, setInviteIds] = useState<string[]>([]);

  const handleClose = () => {
    playSound(require("../assets/sounds/lock.mp3"));
    onClose();
  };

  useEffect(() => {
    if (!visible) {
      setInviteIds([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const me = auth.currentUser;
        if (!me) return;

        // Check if current user is in users or guestUsers collection
        let meDoc = await getDoc(doc(db, "users", me.uid));
        if (!meDoc.exists()) {
          meDoc = await getDoc(doc(db, "guestUsers", me.uid));
        }

        const fIds: string[] = meDoc.exists() ? meDoc.data().friends || [] : [];
        const profiles: any[] = [];

        // Fetch friends from both collections
        for (const id of fIds) {
          try {
            let d = await getDoc(doc(db, "users", id));
            if (!d.exists()) {
              d = await getDoc(doc(db, "guestUsers", id));
            }
            if (d.exists()) profiles.push({ id: d.id, ...(d.data() || {}) });
          } catch (e) {
            // ignore
          }
        }

        // Sort by online status: online users first, then by lastSeen
        profiles.sort((a, b) => {
          const aOnline = a.isOnline && Date.now() - (a.lastSeen || 0) < 120000;
          const bOnline = b.isOnline && Date.now() - (b.lastSeen || 0) < 120000;

          if (aOnline && !bOnline) return -1;
          if (!aOnline && bOnline) return 1;

          // Both same online status, sort by lastSeen
          return (b.lastSeen || 0) - (a.lastSeen || 0);
        });

        if (mounted) setFriends(profiles);
      } catch (e) {
        console.error("InviteFriendsModal fetch error", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible]);

  const sendInvite = async (targetId: string) => {
    if (invitedIds.includes(targetId)) return;
    try {
      const inviterName = auth.currentUser?.displayName || "A player";

      // Determine target collection
      let targetDoc = await getDoc(doc(db, "users", targetId));
      const targetCollection = targetDoc.exists() ? "users" : "guestUsers";

      await updateDoc(doc(db, targetCollection, targetId), {
        gameInvites: arrayUnion({ roomId, inviterName, timestamp: Date.now() }),
      });
      setInviteIds((prev) => [...prev, targetId]);
      showToast({ message: "Invite sent!", type: "success" });
    } catch (e) {
      console.error("Failed to send invite", e);
      showToast({ message: "Failed to send invite", type: "error" });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.tape} />
          <View style={styles.header}>
            <Text style={styles.title}>Invite Friends</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={friends}
            keyExtractor={(i) => i.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isInvited = invitedIds.includes(item.id);
              return (
                <View style={styles.row}>
                  <View style={styles.userInfo}>
                    <LinearGradient
                      colors={
                        item.avatarGradientIndex !== undefined &&
                        item.avatarGradientIndex >= 0 &&
                        item.avatarGradientIndex < AVATAR_GRADIENTS.length
                          ? (AVATAR_GRADIENTS[item.avatarGradientIndex] as any)
                          : (getAvatarGradient(item.id) as any)
                      }
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {item.username?.[0]?.toUpperCase() ||
                          item.displayName?.[0]?.toUpperCase() ||
                          "?"}
                      </Text>
                      {item.isOnline &&
                        Date.now() - (item.lastSeen || 0) < 120000 && (
                          <View style={styles.onlineIndicator} />
                        )}
                    </LinearGradient>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.username || item.displayName || item.id}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.inviteBtn, isInvited && styles.invitedBtn]}
                    onPress={() => sendInvite(item.id)}
                    disabled={isInvited}
                  >
                    <Text
                      style={[
                        styles.inviteText,
                        isInvited && styles.invitedText,
                      ]}
                    >
                      {isInvited ? "Sent" : "Invite"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends found.</Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff9f2",
    borderRadius: 2,
    padding: 22,
    maxHeight: "70%",
    borderWidth: 3,
    borderColor: "#333",
    shadowColor: "#000",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 10,
    transform: [{ rotate: "-0.5deg" }],
    position: "relative",
  },
  tape: {
    position: "absolute",
    top: -15,
    width: 100,
    height: 30,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.8)",
    transform: [{ rotate: "-2deg" }],
    borderWidth: 1,
    borderColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#333" },
  closeButton: {
    padding: 8,
    backgroundColor: "#ddd",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "bold", color: "#333" },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4ade80",
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: { fontSize: 16, fontWeight: "600", color: "#333", flex: 1 },
  inviteBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  invitedBtn: {
    backgroundColor: "#e0e0e0",
  },
  inviteText: { color: "white", fontWeight: "bold", fontSize: 14 },
  invitedText: { color: "#888" },
  empty: {
    textAlign: "center",
    color: "#888",
    marginTop: 30,
    fontStyle: "italic",
  },
});
