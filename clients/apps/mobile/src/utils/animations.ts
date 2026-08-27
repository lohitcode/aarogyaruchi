import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated"

/**
 * Fade in animation
 */
export function useFadeIn(delay: number = 0) {
  const opacity = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const startAnimation = () => {
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      }),
    )
  }

  return { animatedStyle, startAnimation }
}

/**
 * Slide up animation
 */
export function useSlideUp(delay: number = 0) {
  const translateY = useSharedValue(50)
  const opacity = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  const startAnimation = () => {
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.ease),
      }),
    )
    translateY.value = withDelay(
      delay,
      withSpring(0, {
        damping: 15,
        stiffness: 150,
      }),
    )
  }

  return { animatedStyle, startAnimation }
}

/**
 * Scale animation for press feedback
 */
export function useScaleAnimation() {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const onPressIn = () => {
    scale.value = withSpring(0.95, {
      damping: 10,
      stiffness: 400,
    })
  }

  const onPressOut = () => {
    scale.value = withSpring(1, {
      damping: 10,
      stiffness: 400,
    })
  }

  return { animatedStyle, onPressIn, onPressOut }
}

/**
 * Stagger animation for lists
 */
export function useStaggerAnimation(index: number, delay: number = 50) {
  const translateY = useSharedValue(30)
  const opacity = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  const startAnimation = () => {
    opacity.value = withDelay(
      index * delay,
      withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.ease),
      }),
    )
    translateY.value = withDelay(
      index * delay,
      withSpring(0, {
        damping: 12,
        stiffness: 150,
      }),
    )
  }

  return { animatedStyle, startAnimation }
}

/**
 * Floating animation for hero elements
 */
export function useFloatingAnimation() {
  const translateY = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const startAnimation = () => {
    translateY.value = withSequence(
      withTiming(-10, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      withTiming(10, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
    )
  }

  return { animatedStyle, startAnimation }
}
