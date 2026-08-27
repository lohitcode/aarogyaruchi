import { useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useRouter } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { api, rupees } from "../lib/api"
import { Button } from "../components"
import { colors, spacing, typography } from "../theme"

type ScanResult = {
  stop_id: number
  run_id: number
  position: number
  order_id: number
  order_code: string
  status: string
  customer_name: string
  items: Array<{ name: string; size_label?: string; quantity: number }>
  total_paise: number
}

export default function ScanScreen() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState("")
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanned, setScanned] = useState(false)

  if (!permission) {
    return <View style={styles.center} />
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Camera access is needed to scan package QR labels.</Text>
        <Button style={styles.cta} onPress={requestPermission}>
          Grant camera access
        </Button>
      </View>
    )
  }

  const onScan = async ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    setError("")
    try {
      const res = await api.post<ScanResult>("/v1/partner/packages/scan", { token: data })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed")
      setScanned(false)
    }
  }

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.result}>
        <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
        <Text style={styles.resultTitle}>{result.order_code}</Text>
        <Text style={styles.resultMeta}>
          {result.customer_name} · stop {result.position} in run #{result.run_id} ·{" "}
          {rupees(result.total_paise)} COD
        </Text>
        <View style={styles.items}>
          {result.items.map((it, i) => (
            <Text key={i} style={styles.itemText}>
              {it.quantity}× {it.name}
              {it.size_label ? ` (${it.size_label})` : ""}
            </Text>
          ))}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button style={styles.cta} onPress={() => router.replace(`/run/${result.run_id}`)}>
          Open run
        </Button>
        <Button
          variant="ghost"
          onPress={() => {
            setResult(null)
            setScanned(false)
          }}
        >
          Scan another
        </Button>
      </ScrollView>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {error ? error : "Point the camera at the QR label on a package"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing.lg },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 220, height: 220, borderWidth: 2, borderColor: colors.primary, borderRadius: 16 },
  hint: { ...typography.small, color: "#fff", marginTop: spacing.md, textAlign: "center", paddingHorizontal: spacing.lg },
  result: { padding: spacing.xl, alignItems: "center", gap: spacing.sm, backgroundColor: colors.background, flexGrow: 1, justifyContent: "center" },
  resultTitle: { ...typography.h1, color: colors.foreground, marginTop: spacing.sm },
  resultMeta: { ...typography.small, color: colors.mutedForeground, textAlign: "center" },
  items: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, alignSelf: "stretch", marginTop: spacing.md, gap: 4 },
  itemText: { ...typography.body, color: colors.foreground },
  cta: { backgroundColor: colors.primary, alignSelf: "stretch", marginTop: spacing.md },
  errorText: { color: colors.destructive, textAlign: "center" },
})
