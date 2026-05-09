// lib/embeddings/queryMaker.ts

export interface NGOQueryPayload {
  category: string;
  location: string;
  budget: number;
  milestones: number;
  start_date: Date;
  end_date: Date;
}

export interface ServiceOfferQueryPayload {
  title: string;
  description: string;
  category: string;
  city: string;
  state_province?: string;
  budget: number;
  start_date: Date;
  end_date: Date;
  requirementDetails: string;
}

export function makeCampaignQuery(payload: NGOQueryPayload): string {
  return [
    payload.category,
    payload.location,
    `Budget: ${payload.budget}`,
    `Milestones: ${payload.milestones}`,
    `${payload.start_date} to ${payload.end_date}`,
  ].filter(Boolean).join(" | ");
}

export function makeServiceOfferQuery(payload: ServiceOfferQueryPayload): string {
  return [
    payload.title,
    payload.description,
    payload.category,
    `${payload.city}${payload.state_province ? `, ${payload.state_province}` : ""}`,
    payload.requirementDetails,
    `${payload.start_date} to ${payload.end_date}`,
  ].filter(Boolean).join(" | ");
}