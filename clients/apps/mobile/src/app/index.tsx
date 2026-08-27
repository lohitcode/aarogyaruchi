import { StyleSheet, Text, View } from "react-native"
import { colors } from "../theme"

/** Root placeholder — the layout's auth gate redirects to /login or /runs. */
export default function Index() {
  return (
    <View style={styles.center}>
      <Text style={styles.brand}>AR Partner</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  brand: { fontSize: 24, fontWeight: "700", color: colors.primary },
})
