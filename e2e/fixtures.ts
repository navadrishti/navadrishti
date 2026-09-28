import { test as base, expect, type Page } from '@playwright/test'

type PageProblems = {
  pageErrors: string[]
  consoleErrors: string[]
  failedScripts: string[]
}

const IGNORED_CONSOLE_ERRORS = [
  /Failed to load resource: the server responded with a status of 401/,
  /va\.vercel-scripts\.com|vitals\.vercel-insights\.com|_vercel\/(insights|speed-insights)/,
]

function watchPage(page: Page): PageProblems {
  const problems: PageProblems = { pageErrors: [], consoleErrors: [], failedScripts: [] }

  page.on('pageerror', (error) => {
    problems.pageErrors.push(error.message)
  })

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const location = message.location().url
    if (IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text) || pattern.test(location))) return
    problems.consoleErrors.push(text)
  })

  page.on('requestfailed', (request) => {
    if (request.resourceType() !== 'script') return
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    problems.failedScripts.push(`${request.url()} (${request.failure()?.errorText})`)
  })

  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return
    if (response.url().includes('/_vercel/')) return
    if (response.status() >= 400) {
      problems.failedScripts.push(`${response.url()} (${response.status()})`)
    }
  })

  return problems
}

export const test = base.extend<{ pageProblems: PageProblems }>({
  pageProblems: async ({ page }, use) => {
    await use(watchPage(page))
  },
})

export function expectNoPageProblems(problems: PageProblems) {
  expect(problems.pageErrors, 'uncaught page errors').toEqual([])
  expect(problems.failedScripts, 'failed JS requests').toEqual([])
  expect(problems.consoleErrors, 'console errors').toEqual([])
}

export function fakeEmail(prefix = 'e2e-nonexistent') {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${suffix}@example.invalid`
}

export { expect }
