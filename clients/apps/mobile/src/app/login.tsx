import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Button, Input } from "../components"
import { colors, spacing, typography } from "../theme"
import { useAuth } from "../lib/auth"

export default function LoginScreen() {
  const { login, verify } = useAuth()
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const digits = phone.replace(/\D/g, "").replace(/^91/, "").slice(0, 10)

  const send = async () => {
    if (digits.length !== 10 || busy) return
    setBusy(true)
    setError("")
    try {
      await login(digits)
      setStep("otp")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code")
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError("")
    try {
      await verify(code)
      // AuthProvider's effect redirects to /runs.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>AR Partner</Text>
        <Text style={styles.sub}>Delivery partner app</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>
          {step === "phone" ? "Sign in" : "Enter code"}
        </Text>
        <Text style={styles.hint}>
          {step === "phone"
            ? "Use the phone number provisioned for you by the operator."
            : `Code sent to +91 ${digits}`}
        </Text>

        {step === "phone" ? (
          <>
            <Input
              value={digits}
              onChangeText={(t) => setPhone(t.replace(/\D/g, "").replace(/^91/, "").slice(0, 10))}
              placeholder="10-digit phone"
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Button onPress={send} disabled={digits.length !== 10 || busy} style={styles.cta}>
              {busy ? "Sending…" : "Send code"}
            </Button>
          </>
        ) : (
          <>
            <Input
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              keyboardType="numeric"
              style={{ ...styles.input, ...styles.otp }}
            />
            <Button onPress={check} disabled={code.length !== 6 || busy} style={styles.cta}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setStep("phone")
                setCode("")
                setError("")
              }}
              style={styles.change}
            >
              Change number
            </Button>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.lg },
  header: { alignItems: "center", marginBottom: spacing.xl },
  brand: { ...typography.h1, color: colors.primary, fontWeight: "800" },
  sub: { ...typography.small, color: colors.mutedForeground, marginTop: 4 },
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12 },
  title: { ...typography.h2, color: colors.foreground },
  hint: { ...typography.small, color: colors.mutedForeground, marginTop: 4, marginBottom: spacing.md },
  input: { backgroundColor: "#FFFFFF" },
  otp: { textAlign: "center", fontSize: 24, letterSpacing: 8 },
  cta: { marginTop: spacing.md, backgroundColor: colors.primary },
  change: { marginTop: spacing.sm },
  error: { color: colors.destructive, marginTop: spacing.sm, textAlign: "center" },
})
