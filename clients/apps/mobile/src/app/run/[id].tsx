import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { Link, useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as Linking from "expo-linking"
import { api, rupees, type RunDetail, type Stop } from "../../lib/api"
import { Button } from "../../components"
import { colors, spacing, typography } from "../../theme"
import { startTracking } from "../../lib/tracking"

export default function RunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<RunDetail>(`/v1/partner/runs/${id}`)
      setRun(res)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run")
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const act = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )
  }
  if (!run) {
    return <ActivityIndicator style={styles.center} color={colors.primary} />
  }

  const openStops = run.stops.filter((s) => s.status === "pending" || s.status === "in_progress")
  const canPickup = run.status === "dispatched" && run.stops.some((s) => s.order_status === "assigned")
  const canComplete = run.status === "in_progress" && openStops.length === 0 && run.stops.length > 0
  const handoverPending = run.status === "completed"

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{run.name || `Run #${run.run_id}`}</Text>
          <Text style={styles.meta}>
            {run.delivery_date} · {run.status.replace("_", " ")}
          </Text>
        </View>
        <Pressable onPress={() => router.push("/scan")} accessibilityLabel="Scan package">
          <Ionicons name="scan" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {(run.status === "dispatched" || run.status === "in_progress") && (
        <Pressable style={styles.trackingBanner} onPress={() => startTracking()}>
          <Ionicons name="navigate" size={16} color={colors.primary} />
          <Text style={styles.trackingText}>GPS sharing is on while this run is active</Text>
        </Pressable>
      )}

      {(canPickup || canComplete || handoverPending) && (
        <View style={styles.actions}>
          {canPickup && (
            <Button disabled={busy} onPress={() => act("Pickup", () => api.post(`/v1/partner/runs/${run.run_id}/pickup`))} style={styles.cta}>
              Confirm package pickup
            </Button>
          )}
          {canComplete && (
            <Button disabled={busy} onPress={() => act("Complete run", () => api.post(`/v1/partner/runs/${run.run_id}/complete`))} style={styles.cta}>
              Complete run
            </Button>
          )}
          {handoverPending && (
            <Link href={`/cash/${run.run_id}`} asChild>
              <Pressable style={styles.cashCta}>
                <Text style={styles.cashCtaText}>
                  Submit cash handover · {rupees(run.cash.collected_paise)}
                </Text>
              </Pressable>
            </Link>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {run.stops.map((stop, i) => (
          <StopCard key={stop.stop_id} stop={stop} index={i} />
        ))}
      </ScrollView>
    </View>
  )
}

function StopCard({ stop, index }: { stop: Stop; index: number }) {
  const router = useRouter()
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${stop.address_line}${stop.landmark ? `, ${stop.landmark}` : ""}${
      stop.latitude && stop.longitude ? `@${stop.latitude},${stop.longitude}` : ""
    }`,
  )}`

  const open = stop.status === "pending" || stop.status === "in_progress"

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.position}>{index + 1}</Text>
        <View style={styles.cardBody}>
          <Text style={styles.customer}>{stop.customer_name}</Text>
          <Text style={styles.code}>{stop.order_code} · {rupees(stop.total_paise)} COD</Text>
        </View>
        <Text
          style={[
            styles.status,
            stop.status === "delivered" && styles.statusDelivered,
            stop.status === "failed" && styles.statusFailed,
          ]}
        >
          {stop.status.replace("_", " ")}
        </Text>
      </View>

      <Text style={styles.address}>
        {stop.address_line}
        {stop.landmark ? `\nLandmark: ${stop.landmark}` : ""}
        {stop.locality ? `\n${stop.locality}` : ""}
      </Text>
      {stop.instructions ? <Text style={styles.instructions}>“{stop.instructions}”</Text> : null}

      <Text style={styles.items}>
        {stop.items.map((it) => `${it.quantity}× ${it.name}${it.size_label ? ` (${it.size_label})` : ""}`).join("\n")}
      </Text>

      <View style={styles.cardActions}>
        <Pressable style={styles.mapButton} onPress={() => Linking.openURL(mapsUrl)} accessibilityLabel="Navigate with Google Maps">
          <Ionicons name="map" size={16} color={colors.primary} />
          <Text style={styles.mapText}>Navigate</Text>
        </Pressable>
        <Pressable style={styles.callButton} onPress={() => Linking.openURL(`tel:${stop.customer_phone}`)} accessibilityLabel="Call customer">
          <Ionicons name="call" size={16} color={colors.foreground} />
          <Text style={styles.callText}>Call</Text>
        </Pressable>
        {open ? (
          <Pressable style={styles.openButton} onPress={() => router.push(`/stop/${stop.stop_id}`)}>
            <Text style={styles.openButtonText}>Open stop</Text>
          </Pressable>
        ) : stop.collected_paise ? (
          <Text style={styles.collected}>{rupees(stop.collected_paise)} collected</Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.destructive },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.card },
  headerText: { flex: 1 },
  title: { ...typography.h2, color: colors.foreground },
  meta: { ...typography.small, color: colors.mutedForeground, textTransform: "capitalize" },
  trackingBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.cream, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  trackingText: { ...typography.small, color: colors.primary, flex: 1 },
  actions: { padding: spacing.lg, gap: spacing.sm },
  cta: { backgroundColor: colors.primary },
  cashCta: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 8, alignItems: "center" },
  cashCtaText: { color: "#fff", fontWeight: "700" },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg },
  cardTop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  position: { fontSize: 18, fontWeight: "800", color: colors.primary, width: 28 },
  cardBody: { flex: 1 },
  customer: { ...typography.h3, color: colors.foreground },
  code: { ...typography.small, color: colors.mutedForeground, marginTop: 2 },
  status: { ...typography.small, color: colors.mutedForeground, textTransform: "capitalize" },
  statusDelivered: { color: colors.primary, fontWeight: "700" },
  statusFailed: { color: colors.destructive, fontWeight: "700" },
  address: { ...typography.small, color: colors.foreground, marginTop: spacing.sm, lineHeight: 20 },
  instructions: { ...typography.small, color: colors.mutedForeground, fontStyle: "italic", marginTop: 4 },
  items: { ...typography.small, color: colors.foreground, marginTop: spacing.sm, lineHeight: 20 },
  cardActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center", flexWrap: "wrap" },
  mapButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mapText: { color: colors.primary, fontWeight: "600" },
  callButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.foreground, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  callText: { color: colors.foreground, fontWeight: "600" },
  openButton: { backgroundColor: colors.foreground, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  openButtonText: { color: colors.card, fontWeight: "700" },
  collected: { ...typography.small, color: colors.primary, fontWeight: "700" },
})
