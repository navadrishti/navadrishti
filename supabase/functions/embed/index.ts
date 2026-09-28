import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// gte-small runs inside the edge runtime (384-dimension vectors), so no API key is needed.
const session = new Supabase.ai.Session('gte-small')

const MAX_INPUT_CHARS = 8000

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let input = ''
  try {
    const body = await req.json()
    input = typeof body?.input === 'string' ? body.input.trim() : ''
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!input) {
    return Response.json({ error: 'input is required' }, { status: 400 })
  }

  try {
    const embedding = await session.run(input.slice(0, MAX_INPUT_CHARS), { mean_pool: true, normalize: true })
    return Response.json({ embedding })
  } catch (error) {
    console.error('embed failed', error)
    return Response.json({ error: 'Embedding failed' }, { status: 500 })
  }
})
