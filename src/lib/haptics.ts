import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export async function vibrateLight(): Promise<void> {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Silently fail on web/non-native
  }
}

export async function vibrateError(): Promise<void> {
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Silently fail on web/non-native
  }
}

export async function vibrateSuccess(): Promise<void> {
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Silently fail on web/non-native
  }
}
