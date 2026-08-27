import type React from "react"
import { Pressable, Text, type TextStyle, type ViewStyle } from "react-native"
import { colors } from "../theme"

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "destructive"
type ButtonSize = "sm" | "default" | "lg" | "icon"

interface ButtonProps {
  children: React.ReactNode
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  style?: ViewStyle
  textStyle?: TextStyle
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  style,
  textStyle,
}) => {
  const getBackgroundColor = (): string => {
    if (disabled) return colors.muted

    switch (variant) {
      case "default":
        return colors.primary
      case "outline":
      case "ghost":
      case "link":
        return "transparent"
      case "secondary":
        return colors.card
      case "destructive":
        return colors.destructive
      default:
        return colors.primary
    }
  }

  const getBorderColor = (): string => {
    if (variant === "outline" || variant === "secondary") {
      return colors.border
    }
    return "transparent"
  }

  const getTextColor = (): string => {
    if (disabled) return colors.mutedForeground

    switch (variant) {
      case "default":
      case "destructive":
        return "#FFFFFF"
      case "outline":
      case "secondary":
      case "ghost":
        return colors.foreground
      case "link":
        return colors.primary
      default:
        return "#FFFFFF"
    }
  }

  const getHeight = (): number => {
    switch (size) {
      case "sm":
        return 32
      case "default":
        return 36
      case "lg":
        return 40
      case "icon":
        return 36
      default:
        return 36
    }
  }

  const getPaddingHorizontal = (): number => {
    if (size === "icon") return 0
    if (size === "sm") return 12
    return 16
  }

  const fontSize = size === "sm" ? 14 : 15

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth:
            variant === "outline" || variant === "secondary" ? 1.5 : 0,
          height: getHeight(),
          paddingHorizontal: getPaddingHorizontal(),
          borderRadius: variant === "link" ? 0 : 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed && !disabled ? 0.85 : disabled ? 0.5 : 1,
          transform: pressed && !disabled ? [{ scale: 0.98 }] : undefined,
          shadowColor:
            variant === "default" || variant === "destructive"
              ? "#000"
              : "transparent",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity:
            variant === "default" ? 0.15 : variant === "destructive" ? 0.2 : 0,
          shadowRadius: 8,
          elevation:
            variant === "default" ? 4 : variant === "destructive" ? 6 : 0,
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            color: getTextColor(),
            fontSize,
            fontWeight: variant === "link" ? "600" : "700",
            letterSpacing: variant === "link" ? 0.1 : 0.3,
          },
          textStyle,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  )
}
