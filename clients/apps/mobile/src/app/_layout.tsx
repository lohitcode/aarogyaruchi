import { Stack, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import { colors } from "../theme"
import { AuthProvider, useAuth } from "../lib/auth"
import { flushBuffer } from "../lib/tracking"

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AuthGate />
    </AuthProvider>
  )
}

function AuthGate() {
  const { partner, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (partner) {
      // Signed in: replay any offline-buffered GPS samples.
      flushBuffer()
      router.replace("/runs")
    } else {
      router.replace("/login")
    }
  }, [loading, partner, router])

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.brand}>AR Partner</Text>
      </View>
    )
  }

  return (
    <Stack
      screenOptions={() => ({
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      })}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="runs" />
      <Stack.Screen name="run/[id]" />
      <Stack.Screen name="stop/[id]" />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="cash/[id]" />
      <Stack.Screen name="profile" />
    </Stack>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  brand: { fontSize: 24, fontWeight: "700", color: colors.primary },
})
