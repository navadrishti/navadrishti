export type RoutePaymentKind =
  | 'ngo_network'
  | 'financial_need'
  | 'csr_milestone'
  | 'service_offer'
  | 'engagement_settlement'
  | 'company_ca'
  | 'csr_capability_rental';

export function isRazorpayRouteEnabled(): boolean {
  return String(process.env.RAZORPAY_ROUTE_ENABLED || '').toLowerCase() === 'true';
}

export function shouldHoldTransferForKind(kind: RoutePaymentKind): boolean {
  return kind === 'financial_need';
}
