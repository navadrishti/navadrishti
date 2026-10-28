export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertProductionConfig } = await import('@/lib/runtime-services')
  assertProductionConfig()
}
