import { test, expect } from './coverage-fixture'

/**
 * E2e for KaTeX error resilience (task 57). With the fixMathRender patch
 * (strict:false, throwOnError:false), a broken formula renders as KaTeX's inline
 * error (.katex-error) instead of throwing — so valid formulas around it still
 * render and the editor stays usable. .katex-error specifically proves the patch
 * is active (the unpatched code path produces a plain `vditor-reset--error`
 * message from the catch, not KaTeX's own error markup).
 */
test('a broken formula renders as an inline KaTeX error; valid math still renders', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/math.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  // Math renders asynchronously after init.
  await page.waitForSelector('.katex, .katex-error', { timeout: 5000 })

  const counts = await page.evaluate(() => ({
    katex: document.querySelectorAll('.katex').length,
    katexError: document.querySelectorAll('.katex-error').length,
  }))

  // Valid formulas rendered…
  expect(counts.katex).toBeGreaterThan(0)
  // …and the broken one rendered as a KaTeX inline error (proves throwOnError:false)…
  expect(counts.katexError).toBeGreaterThan(0)
  // …without any uncaught error tearing down the page.
  expect(errors).toEqual([])
})
