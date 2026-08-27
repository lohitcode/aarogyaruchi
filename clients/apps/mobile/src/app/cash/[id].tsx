import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { api, rupees, type RunDetail } from "../../lib/api"
import { Button, Input } from "../../components"
import { colors, spacing, typography } from "../../theme"

export default function CashScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<RunDetail | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<RunDetail>(`/v1/partner/runs/${id}`)
      setRun(res)
      setAmount(String(Math.floor(res.cash.collected_paise / 100)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load run")
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
  if (!run) {
    return <ActivityIndicator style={styles.center} color={colors.primary} />
  }

  const submit = async () => {
    if (busy) return
    const paise = Math.round((Number(amount.replace(/[^\d.]/g, "")) || 0) * 100)
    setBusy(true)
    setError("")
    try {
      await api.post(`/v1/partner/runs/${run.run_id}/cash-handover`, {
        amount_paise: paise,
        note: note.trim() || undefined,
      })
      Alert.alert("Handover submitted", "Hand the cash to the operator. They will confirm and reconcile the run.", [
        { text: "OK", onPress: () => router.replace("/runs") },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cash handover · Run #{run.run_id}</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryRow}>Collected from delivered stops: {rupees(run.cash.collected_paise)}</Text>
        <Text style={styles.summaryRow}>Pending stops (undelivered): {rupees(run.cash.pending_paise)}</Text>
        <Text style={styles.summaryRow}>Failed deliveries: {rupees(run.cash.failed_paise)}</Text>
      </View>

      <Text style={styles.label}>Amount you are handing over (₹)</Text>
      <Input value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.input} />
      <Text style={styles.hint}>
        Enter the actual cash in hand. Any difference from {rupees(run.cash.collected_paise)} is
        recorded and reviewed by the operator.
      </Text>

      <Text style={styles.label}>Note (optional)</Text>
      <Input value={note} onChangeText={setNote} placeholder="Explain any difference" style={styles.input} multiline numberOfLines={2} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button disabled={busy} style={styles.cta} onPress={submit}>
        {busy ? "Submitting…" : "Submit handover"}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h2, color: colors.foreground },
  summary: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, marginTop: spacing.md, gap: 6 },
  summaryRow: { ...typography.body, color: colors.foreground },
  label: { ...typography.small, fontWeight: "600", color: colors.foreground, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: "#FFFFFF" },
  hint: { ...typography.small, color: colors.mutedForeground, marginTop: 6 },
  cta: { backgroundColor: colors.primary, marginTop: spacing.lg },
  errorText: { color: colors.destructive, marginTop: spacing.md },
})
