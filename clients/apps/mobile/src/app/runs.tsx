import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { api, type RunSummary } from "../lib/api"
import { colors, spacing, typography } from "../theme"
import { useAuth } from "../lib/auth"
import { startTracking, stopTracking } from "../lib/tracking"

const ACTIVE_STATUSES = ["dispatched", "in_progress"]

export default function RunsScreen() {
  const router = useRouter()
  const { partner, logout } = useAuth()
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ runs: RunSummary[] }>("/v1/partner/runs")
      setRuns(res.runs)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Share GPS exactly while an assigned run is on the road.
  useEffect(() => {
    const hasActive = (runs ?? []).some((r) => ACTIVE_STATUSES.includes(r.status))
    if (hasActive) {
      startTracking()
    } else {
      stopTracking()
    }
  }, [runs])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{partner?.name || "Partner"}</Text>
            <Text style={styles.sub}>Your delivery runs</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/scan")} style={styles.iconButton} accessibilityLabel="Scan package">
              <Ionicons name="scan" size={22} color={colors.foreground} />
            </Pressable>
            <Pressable onPress={() => router.push("/profile")} style={styles.iconButton} accessibilityLabel="Profile">
              <Ionicons name="person" size={22} color={colors.foreground} />
            </Pressable>
            <Pressable onPress={logout} style={styles.iconButton} accessibilityLabel="Sign out">
              <Ionicons name="log-out" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {runs === null ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(r) => String(r.run_id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No runs assigned yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/run/${item.run_id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.runName}>
                  {item.name ? item.name : `Run #${item.run_id}`}
                </Text>
                <Text
                  style={[
                    styles.status,
                    ACTIVE_STATUSES.includes(item.status) && styles.statusActive,
                    item.status === "completed" && styles.statusDone,
                  ]}
                >
                  {item.status.replace("_", " ")}
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                Deliver {item.delivery_date} · {item.stop_count} stop{item.stop_count === 1 ? "" : "s"}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.card },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { ...typography.h2, color: colors.foreground },
  sub: { ...typography.small, color: colors.mutedForeground, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  iconButton: { padding: spacing.sm, backgroundColor: colors.card, borderRadius: 8 },
  loader: { marginTop: spacing.xl },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  runName: { ...typography.h3, color: colors.foreground, flexShrink: 1 },
  status: { ...typography.small, color: colors.mutedForeground, textTransform: "capitalize" },
  statusActive: { color: colors.primary, fontWeight: "700" },
  statusDone: { color: colors.mutedForeground },
  cardMeta: { ...typography.small, color: colors.mutedForeground, marginTop: 6 },
  empty: { textAlign: "center", color: colors.mutedForeground, marginTop: spacing.xl },
  error: { color: colors.destructive, padding: spacing.md },
})
