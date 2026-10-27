function present(key: string) {
  return Boolean(String(process.env[key] || '').trim())
}

export type RuntimeServiceFlags = {
  supabase: boolean
  jwt: boolean
  uploads: boolean
  payments: boolean
  webhook: boolean
  cron: boolean
  ocr: boolean
  shipping: boolean
  app_url: boolean
}

export function getRuntimeServiceFlags(): RuntimeServiceFlags {
  return {
    supabase:
      present('NEXT_PUBLIC_SUPABASE_URL') &&
      present('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') &&
      present('SUPABASE_SECRET_KEY'),
    jwt: present('JWT_SECRET'),
    uploads:
      present('CLOUDINARY_CLOUD_NAME') &&
      present('CLOUDINARY_API_KEY') &&
      present('CLOUDINARY_API_SECRET'),
    payments: present('NEXT_PUBLIC_RAZORPAY_KEY_ID') && present('RAZORPAY_KEY_SECRET'),
    webhook: present('RAZORPAY_WEBHOOK_SECRET'),
    cron: present('CRON_SECRET'),
    ocr: present('GEMINI_API_KEY'),
    shipping: present('DELHIVERY_API_TOKEN'),
    app_url: present('NEXT_PUBLIC_APP_URL') || present('APP_URL'),
  }
}

export function requiredServicesReady(flags: RuntimeServiceFlags) {
  return flags.supabase && flags.jwt
}
