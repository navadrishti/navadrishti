import fs from 'fs'

const path = 'reference/completeschema.txt'
let s = fs.readFileSync(path, 'utf8')

const start = s.indexOf('CREATE TABLE public.service_requests (')
const end = s.indexOf('CREATE TABLE public.service_offers (')
if (start < 0 || end < 0) {
  console.error('Could not locate service_requests block')
  process.exit(1)
}

let block = s.slice(start, end)
block = block.replace(/  priority USER-DEFINED DEFAULT 'medium'::priority_enum,\r?\n/, '')
block = block.replace(/  volunteer_limit integer DEFAULT 1,\r?\n/, '')
block = block.replace(/  deadline_at timestamp with time zone,\r?\n/, '')
s = s.slice(0, start) + block + s.slice(end)

if (!s.includes('pass3')) {
  if (s.startsWith('-- TARGET')) {
    s = s.replace(
      /(-- TARGET CONTRACT[^\n]*\n)/,
      '$1-- Pass 3 dropped: service_requests.volunteer_limit, priority, deadline_at.\n'
    )
  } else {
    s =
      '-- TARGET CONTRACT after pass1 + pass2 + pass3 (safe cleanup).\n' +
      '-- Pass 3 dropped: service_requests.volunteer_limit, priority, deadline_at.\n' +
      s
  }
}

fs.writeFileSync(path, s)
const sr = s.slice(s.indexOf('CREATE TABLE public.service_requests ('), s.indexOf('CREATE TABLE public.service_offers ('))
console.log({
  hasPriority: /priority USER-DEFINED/.test(sr),
  hasVolunteerLimit: /volunteer_limit/.test(sr),
  hasDeadlineAt: /deadline_at/.test(sr),
})
