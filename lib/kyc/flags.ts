/**
 * Cycle 1.2a KYC confidentiality feature flags (server-side only).
 *
 * KYC_AUTHENTICATED_UPLOAD=1
 *   New KYC uploads use Cloudinary delivery type `authenticated` and return
 *   structured refs instead of durable public CDN URLs. Default: off (legacy
 *   public upload behavior) so existing workflows are unchanged until enabled.
 *
 * KYC_CONTENT_PROXY=1
 *   Enables GET /api/verification/documents/[id]/file to stream authenticated
 *   (and authorized legacy) KYC bytes after server-side authZ. Default: off.
 *
 * Flags never bypass authorization. Do not expose Cloudinary secrets via these.
 */
export function kycAuthenticatedUploadEnabled(): boolean {
  return process.env.KYC_AUTHENTICATED_UPLOAD === '1'
}

export function kycContentProxyEnabled(): boolean {
  return process.env.KYC_CONTENT_PROXY === '1'
}
