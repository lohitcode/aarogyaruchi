import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { api, rupees } from "../../lib/api"
import { Button, Input } from "../../components"
import { colors, spacing, typography } from "../../theme"

const FAILURE_REASONS: Array<{ value: string; label: string }> = [
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "wrong_address", label: "Wrong address" },
  { value: "customer_refused", label: "Customer refused" },
  { value: "payment_issue", label: "Cash not ready" },
  { value: "other", label: "Other" },
]

type StopDetail = {
  stop_id: number
  run_id: number
  position: number
  status: string
  order_id: number
  order_code: string
  order_status: string
  total_paise: number
  customer_id: number
  customer_name: string
  customer_phone: string
  address_line: string
  landmark: string
  latitude: number
  longitude: number
  partner_id: number
  run_status: string
}

export default function StopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [stop, setStop] = useState<StopDetail | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<StopDetail>(`/v1/partner/stops/${id}`)
      setStop(res)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stop")
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    )
  }
  if (!stop) {
    return <ActivityIndicator style={styles.center} color={colors.primary} />
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Stop {stop.position} · {stop.order_code}</Text>
          <Text style={styles.meta}>
            {stop.customer_name} · {rupees(stop.total_paise)} COD
          </Text>
        </View>
      </View>

      {stop.status === "pending" && (
        <StartSection stopId={stop.stop_id} onDone={load} />
      )}
      {(stop.status === "in_progress" || stop.status === "pending") && (
        <ResultSection stopId={stop.stop_id} total={stop.total_paise} onDone={() => router.back()} />
      )}
      {stop.status !== "pending" && stop.status !== "in_progress" && (
        <View style={styles.done}>
          <Text style={styles.doneText}>This stop is already {stop.status}.</Text>
        </View>
      )}
    </View>
  )
}

function StartSection({ stopId, onDone }: { stopId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <View style={styles.section}>
      <Button
        disabled={busy}
        style={styles.cta}
        onPress={async () => {
          setBusy(true)
          try {
            await api.post(`/v1/partner/stops/${stopId}/start`)
            onDone()
          } catch (e) {
            Alert.alert("Start", e instanceof Error ? e.message : "Failed")
          } finally {
            setBusy(false)
          }
        }}
      >
        Start this stop (out for delivery)
      </Button>
    </View>
  )
}

function ResultSection({
  stopId,
  total,
  onDone,
}: {
  stopId: number
  total: number
  onDone: () => void
}) {
  const [mode, setMode] = useState<"deliver" | "fail">("deliver")
  const [amount, setAmount] = useState(String(Math.floor(total / 100)))
  const [reason, setReason] = useState("customer_unavailable")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const rupeeDigits = Number(amount.replace(/[^\d.]/g, ""))
  const collectedPaise = Math.round((Number.isFinite(rupeeDigits) ? rupeeDigits : 0) * 100)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      if (mode === "deliver") {
        await api.post(`/v1/partner/stops/${stopId}/delivered`, {
          collected_amount_paise: collectedPaise,
          note: note.trim() || undefined,
        })
      } else {
        await api.post(`/v1/partner/stops/${stopId}/failed`, {
          reason,
          note: note.trim(),
        })
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, mode === "deliver" && styles.tabActive]}
          onPress={() => setMode("deliver")}
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, mode === "deliver" && styles.tabTextActive]}>Delivered</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === "fail" && styles.tabFailActive]}
          onPress={() => setMode("fail")}
          accessibilityRole="button"
        >
          <Text style={[styles.tabText, mode === "fail" && styles.tabTextFailActive]}>Failed</Text>
        </Pressable>
      </View>

      {mode === "deliver" ? (
        <>
          <Text style={styles.label}>Cash collected (₹)</Text>
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Order total is {rupees(total)}. Enter the full amount, or 0 with a note if waived
            (admin-approved).
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>Reason</Text>
          <View style={styles.reasons}>
            {FAILURE_REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={[styles.reason, reason === r.value && styles.reasonActive]}
                onPress={() => setReason(r.value)}
                accessibilityRole="button"
              >
                <Text style={[styles.reasonText, reason === r.value && styles.reasonTextActive]}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.label}>Note (optional)</Text>
      <Input value={note} onChangeText={setNote} placeholder="Anything the operator should know" style={styles.input} multiline numberOfLines={2} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button
        disabled={busy || (mode === "deliver" && collectedPaise > total)}
        style={mode === "fail" ? { ...styles.cta, ...styles.ctaFail } : styles.cta}
        onPress={submit}
      >
        {busy ? "Saving…" : mode === "deliver" ? "Record delivery" : "Record failure"}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.destructive, padding: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.card },
  headerText: { flex: 1 },
  title: { ...typography.h2, color: colors.foreground },
  meta: { ...typography.small, color: colors.mutedForeground, marginTop: 2 },
  section: { padding: spacing.lg, gap: spacing.sm },
  cta: { backgroundColor: colors.primary, marginTop: spacing.sm },
  ctaFail: { backgroundColor: colors.destructive },
  tabs: { flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.card },
  tab: { flex: 1, padding: spacing.md, alignItems: "center", backgroundColor: colors.background },
  tabActive: { backgroundColor: colors.primary },
  tabFailActive: { backgroundColor: colors.destructive },
  tabText: { fontWeight: "700", color: colors.mutedForeground },
  tabTextActive: { color: "#fff" },
  tabTextFailActive: { color: "#fff" },
  label: { ...typography.small, color: colors.foreground, fontWeight: "600", marginTop: spacing.sm },
  input: { backgroundColor: "#FFFFFF" },
  hint: { ...typography.small, color: colors.mutedForeground },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reason: { borderWidth: 1, borderColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card },
  reasonActive: { borderColor: colors.destructive },
  reasonText: { ...typography.small, color: colors.foreground },
  reasonTextActive: { color: colors.destructive, fontWeight: "700" },
  done: { padding: spacing.lg },
  doneText: { ...typography.body, color: colors.mutedForeground, textTransform: "capitalize" },
})
