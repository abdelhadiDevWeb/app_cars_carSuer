import { Alert } from 'react-native';
import type { Router } from 'expo-router';
import { setPendingChatOpenUserId } from '@/utils/pendingChatOpen';

type TranslateFn = (key: string) => string;

export function getUserIdString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === '[object Object]') return null;
    return trimmed;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const id = obj._id ?? obj.id;
    if (id != null) return String(id);
  }
  const asString = String(value).trim();
  return asString.length > 0 && asString !== '[object Object]' ? asString : null;
}

export function getRouteParamId(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return getUserIdString(value);
}

export function openChatWithUser(options: {
  router: Router;
  isAuthenticated: boolean;
  currentUserId?: string | null;
  otherUserId: unknown;
  t: TranslateFn;
}) {
  const { router, isAuthenticated, currentUserId, otherUserId, t } = options;
  const targetId = getUserIdString(otherUserId);

  if (!targetId) return;

  if (!isAuthenticated) {
    Alert.alert(t('car.contactRequiredTitle'), t('car.contactRequiredBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.login'), onPress: () => router.push('/login') },
    ]);
    return;
  }

  if (currentUserId && String(currentUserId) === targetId) {
    return;
  }

  setPendingChatOpenUserId(targetId);

  router.push({
    pathname: '/(tabs)/chat',
    params: { userId: targetId },
  } as never);
}
