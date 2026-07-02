let pendingOpenUserId: string | null = null;

export function setPendingChatOpenUserId(userId: string): void {
  pendingOpenUserId = String(userId);
}

export function peekPendingChatOpenUserId(): string | null {
  return pendingOpenUserId;
}

export function consumePendingChatOpenUserId(): string | null {
  const id = pendingOpenUserId;
  pendingOpenUserId = null;
  return id;
}
