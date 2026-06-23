const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveAuditUser(actorId: string | null | undefined): { userId: string | null; detailsExtra: any } {
  if (!actorId) {
    return { userId: null, detailsExtra: {} };
  }
  if (uuidRegex.test(actorId)) {
    return { userId: actorId, detailsExtra: {} };
  }
  return { userId: null, detailsExtra: { actor: actorId } };
}
