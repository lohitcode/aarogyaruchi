import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Location from "expo-location"
import * as TaskManager from "expo-task-manager"
import { api } from "./api"

/**
 * GPS sharing for active delivery runs.
 *
 * - Foreground: watchPosition streams fixes through the run screen.
 * - Background: an Expo task keeps collecting while the app is backgrounded
 *   (Android foreground service).
 * - Offline: fixes buffer in AsyncStorage and replay in order through the
 *   HTTP batch endpoint after reconnecting.
 */

const BUFFER_KEY = "ar_partner_gps_buffer"
const MAX_BUFFER = 500

export type GpsSample = {
  latitude: number
  longitude: number
  accuracy_m?: number
  speed_mps?: number
  heading_deg?: number
  recorded_at: string // RFC3339
}

export const LOCATION_TASK = "ar-partner-location"

let buffer: GpsSample[] | null = null

async function loadBuffer(): Promise<GpsSample[]> {
  if (buffer) return buffer
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY)
    buffer = raw ? (JSON.parse(raw) as GpsSample[]) : []
  } catch {
    buffer = []
  }
  return buffer
}

async function persistBuffer() {
  if (!buffer) return
  try {
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(buffer))
  } catch {
    // Storage full: drop the oldest half rather than lose fresh fixes.
    buffer = buffer.slice(Math.floor(buffer.length / 2))
  }
}

function toSample(loc: Location.LocationObject): GpsSample {
  const sample: GpsSample = {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracy_m: loc.coords.accuracy ?? undefined,
    speed_mps: loc.coords.speed ?? undefined,
    heading_deg: loc.coords.heading ?? undefined,
    recorded_at: new Date(loc.timestamp).toISOString(),
  }
  return sample
}

/** Queue a fix; when online (flush succeeds) samples go straight to the API. */
export async function enqueueSample(sample: GpsSample) {
  const buf = await loadBuffer()
  buf.push(sample)
  if (buf.length > MAX_BUFFER) {
    buffer = buf.slice(buf.length - MAX_BUFFER)
  }
  await persistBuffer()
  await flushBuffer()
}

/**
 * Upload buffered samples in chronological order. On success the buffer
 * clears; on failure everything stays for the next attempt.
 */
export async function flushBuffer() {
  const buf = await loadBuffer()
  if (buf.length === 0) return
  // Oldest first; the server replays in order.
  const sorted = [...buf].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  try {
    const res = await api.post<{ accepted: number }>("/v1/partner/location/batch", {
      samples: sorted.slice(0, 200),
    })
    const sent = Math.min(res.accepted, sorted.length)
    buffer = sorted.slice(sent)
    await persistBuffer()
    if (sorted.length > sent) {
      // More than one batch was pending; keep flushing.
      await flushBuffer()
    }
  } catch {
    // Offline or unauthorized: keep buffering.
  }
}

export async function bufferedCount(): Promise<number> {
  return (await loadBuffer()).length
}

// Background task definition (module scope, registered once).
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ error, data }) => {
    if (error) return
    // Expo hands the task `{ locations: LocationObject[] }` — usually one
    // fix, but iterate everything it gives us.
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] }
    for (const loc of locations ?? []) {
      if (loc?.coords) {
        await enqueueSample(toSample(loc))
      }
    }
  })
}

// The foreground watcher's subscription — retained so it can be removed;
// dropping it leaks an active GPS watcher (battery + duplicate uploads).
let watchSubscription: Location.LocationSubscription | null = null

/** Start foreground watching + background task for an active run. */
export async function startTracking(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== "granted") return false
  // Background permission is optional; foreground service still works.
  await Location.requestBackgroundPermissionsAsync().catch(() => null)

  watchSubscription?.remove()
  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 20,
    },
    async (loc) => {
      await enqueueSample(toSample(loc))
    },
  )

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,
      distanceInterval: 40,
      deferredUpdatesInterval: 30000,
    })
  } catch {
    // Background task unavailable (e.g. iOS simulator): foreground only.
  }
  return true
}

/** Stop all sharing when the run completes or the partner signs out. */
export async function stopTracking() {
  watchSubscription?.remove()
  watchSubscription = null
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK)
    }
  } catch {
    // Not started.
  }
  // Best-effort flush of anything still buffered.
  await flushBuffer()
}
