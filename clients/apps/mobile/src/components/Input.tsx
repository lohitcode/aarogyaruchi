import type React from "react"
import {
  StyleSheet,
  TextInput,
  type TextStyle,
  type ViewStyle,
} from "react-native"
import { colors } from "../theme"

interface InputProps {
  value?: string
  onChangeText?: (text: string) => void
  placeholder?: string
  placeholderTextColor?: string
  secureTextEntry?: boolean
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad"
  autoCapitalize?: "none" | "sentences" | "words" | "characters"
  multiline?: boolean
  numberOfLines?: number
  style?: ViewStyle
  textStyle?: TextStyle
}

export const Input: React.FC<InputProps> = ({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor = colors.mutedForeground,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  multiline = false,
  numberOfLines,
  style,
  textStyle,
}) => {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      numberOfLines={numberOfLines}
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        style,
        textStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  input: {
    height: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    color: colors.foreground,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
})
