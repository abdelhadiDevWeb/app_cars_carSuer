import AsyncStorage from '@react-native-async-storage/async-storage';

export const STARTER_PLAN_WELCOME_PENDING_KEY = 'starter_plan_welcome_pending';

export function starterPlanWelcomeShownKey(userId: string): string {
  return `starter_plan_welcome_shown_${userId}`;
}

export type StarterPlanInfo = {
  name: string;
  price: number;
  time: number;
  isFree: boolean;
};

export function parseStarterPlanFromVerify(data: Record<string, unknown> | null | undefined): {
  assigned: boolean;
  plan: StarterPlanInfo | null;
} {
  const assigned = data?.starterPlanAssigned === true;
  const raw = data?.starterPlan;
  if (!assigned || raw == null || typeof raw !== 'object') {
    return { assigned, plan: null };
  }
  const plan = raw as Record<string, unknown>;
  const name = typeof plan.name === 'string' ? plan.name : 'Starter Plan';
  const price = typeof plan.price === 'number' ? plan.price : Number(plan.price) || 0;
  const time = typeof plan.time === 'number' ? plan.time : Number(plan.time) || 365;
  const isFree = plan.isFree === true || price === 0;
  return { assigned, plan: { name, price, time, isFree } };
}

export function isStarterPlanName(name: unknown): boolean {
  return typeof name === 'string' && name.toLowerCase().includes('starter');
}

export async function markStarterWelcomePending(): Promise<void> {
  await AsyncStorage.setItem(STARTER_PLAN_WELCOME_PENDING_KEY, '1');
}

export async function consumeStarterWelcomePending(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STARTER_PLAN_WELCOME_PENDING_KEY);
  if (v === '1') {
    await AsyncStorage.removeItem(STARTER_PLAN_WELCOME_PENDING_KEY);
    return true;
  }
  return false;
}

export async function hasShownStarterWelcome(userId: string): Promise<boolean> {
  const v = await AsyncStorage.getItem(starterPlanWelcomeShownKey(userId));
  return v === '1';
}

export async function markStarterWelcomeShown(userId: string): Promise<void> {
  await AsyncStorage.setItem(starterPlanWelcomeShownKey(userId), '1');
}
