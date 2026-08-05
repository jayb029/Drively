import * as Haptics from 'expo-haptics';

const ignoreUnavailableHaptics = (promise) => promise.catch(() => undefined);

export const haptics = {
  selection: () => ignoreUnavailableHaptics(Haptics.selectionAsync()),
  action: () => ignoreUnavailableHaptics(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  important: () => ignoreUnavailableHaptics(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => ignoreUnavailableHaptics(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => ignoreUnavailableHaptics(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

export function withHaptic(onPress, feedback = haptics.action) {
  if (!onPress) return undefined;
  return (...args) => {
    feedback();
    return onPress(...args);
  };
}
