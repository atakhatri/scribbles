import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = auth.currentUser;
        if (!me) return;
        const meDoc = await getDoc(doc(db, "users", me.uid));
        const fIds: string[] = meDoc.exists() ? meDoc.data().friends || [] : [];
        const profiles: any[] = [];
        for (const id of fIds) {
          try {
            const d = await getDoc(doc(db, "users", id));
            if (d.exists()) profiles.push({ id: d.id, ...(d.data() || {}) });
          } catch (e) {
            // ignore
          }
        }
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
    try {
      const inviterName = auth.currentUser?.displayName || "A player";
      await updateDoc(doc(db, "users", targetId), {
        gameInvites: arrayUnion({ roomId, inviterName }),
      });
    } catch (e) {
      console.error("Failed to send invite", e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Invite Friends</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={friends}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>
                  {item.username || item.displayName || item.id}
                </Text>
                <TouchableOpacity
                  style={styles.inviteBtn}
                  onPress={() => sendInvite(item.id)}
                >
                  <Text style={styles.inviteText}>Invite</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends to invite</Text>
            }
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
    width: "90%",
    maxHeight: "70%",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700" },
  close: { color: "#333", fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  name: { fontSize: 16 },
  inviteBtn: {
    backgroundColor: "#4338CA",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteText: { color: "white", fontWeight: "700" },
  empty: { textAlign: "center", color: "#666", marginTop: 20 },
});
