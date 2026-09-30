const suppressedDeletes = new Map<string, number>();

export function suppressPersistentDeletion(messageId: string): void {
  suppressedDeletes.set(messageId, Date.now() + 15_000);
}

export function consumePersistentDeletionSuppression(messageId: string): boolean {
  const until = suppressedDeletes.get(messageId);
  suppressedDeletes.delete(messageId);
  return Boolean(until && until > Date.now());
}
