// lib/embeddings/queryMaker.ts

export interface NGOQueryPayload {
  category: string;
  location: string;
  budget: number;
  milestones: number;
  start_date: Date;
  end_date: Date;
}

export function makeQuery(payload: NGOQueryPayload): string {
  return (
    `CSR requirement for Category: ${payload.category} in Location: ${payload.location}. ` +
    `Budget: ${payload.budget}. ` +
    `Timeline: ${payload.start_date} to ${payload.end_date}. ` +
    `Milestones: ${payload.milestones}. ` +
    `Support beneficiaries under Category: ${payload.category} in Location: ${payload.location}.`
  );
}