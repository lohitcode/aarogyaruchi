import type React from "react"
import { StyleSheet, View, type ViewStyle } from "react-native"
import { colors } from "../theme"

interface CardProps {
  children: React.ReactNode
  style?: ViewStyle
}

export const Card: React.FC<CardProps> = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>
}

interface CardHeaderProps {
  children: React.ReactNode
  style?: ViewStyle
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, style }) => {
  return <View style={[styles.cardHeader, style]}>{children}</View>
}

interface CardContentProps {
  children: React.ReactNode
  style?: ViewStyle
}

export const CardContent: React.FC<CardContentProps> = ({
  children,
  style,
}) => {
  return <View style={[styles.cardContent, style]}>{children}</View>
}

interface CardFooterProps {
  children: React.ReactNode
  style?: ViewStyle
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, style }) => {
  return <View style={[styles.cardFooter, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: "hidden",
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardContent: {
    padding: 16,
  },
  cardFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
})
