import { Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../lib/auth"
import { bufferedCount, stopTracking } from "../lib/tracking"
import { useEffect, useState } from "react"
import { colors, spacing, typography } from "../theme"

export default function ProfileScreen() {
  const router = useRouter()
  const { partner, logout } = useAuth()
  const [buffered, setBuffered] = useState(0)

  useEffect(() => {
    bufferedCount().then(setBuffered)
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.card}>
        <Ionicons name="person-circle" size={56} color={colors.primary} />
        <Text style={styles.name}>{partner?.name || "Partner"}</Text>
        <Text style={styles.phone}>{partner?.phone}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.statLabel}>Offline GPS samples waiting to upload</Text>
        <Text style={styles.statValue}>{buffered}</Text>
        <Text style = {styles.statHint}>
          Samples buffer on the device when the network drops and upload automatically once reconnected.
        </Text>
      </View>

      <Pressable
        style={styles.signOut}
        onPress={async () => {
          await stopTracking()
          await logout()
        }}
      >
        <Ionicons name="log-out" size={18} color={colors.destructive} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  title: { ...typography.h2, color: colors.foreground, flex: 1, marginLeft: spacing.sm },
  spacer: { width: 22 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.xl, alignItems: "center", marginBottom: spacing.md },
  name: { ...typography.h2, color: colors.foreground, marginTop: spacing.sm },
  phone: { ...typography.small, color: colors.mutedForeground, marginTop: 2 },
  statLabel: { ...typography.small, color: colors.mutedForeground },
  statValue: { fontSize: 32, fontWeight: "800", color: colors.foreground, marginTop: 4 },
  statHint: { ...typography.small, color: colors.mutedForeground, textAlign: "center", marginTop: 6 },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: spacing.md, borderWidth: 1, borderColor: colors.destructive, borderRadius: 8, marginTop: spacing.lg },
  signOutText: { color: colors.destructive, fontWeight: "700" },
})
