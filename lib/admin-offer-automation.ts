export async function autoRejectExpiredServiceOffers() {
  return {
    rejectedCount: 0,
    rejectedOffers: [] as { id: number; title: string; organization: string | null }[],
  }
}
