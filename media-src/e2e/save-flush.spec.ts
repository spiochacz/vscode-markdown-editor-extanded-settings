import { test, expect } from './coverage-fixture'

/**
 * E2e for the Ctrl/Cmd+S flush (task 58). A save fired right after typing must
 * persist the just-typed content. This is the strict case the harness surfaced:
 * Vditor only calls its input hook after its own ~800ms throttle, so when we save
 * immediately NOTHING is pending yet — flush must still post the editor's live
 * value (not save stale content waiting on Vditor's/our debounce).
 */
test('Ctrl+S right after typing posts the live content (even before any debounce armed)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    ;(window as any).__posted = []
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (m: any) => (window as any).__posted.push(m),
      getState: () => undefined,
      setState: () => {},
    })
  })
  await page.goto('/save-flush.html')
  await page.waitForFunction(() => (window as any).__ready === true)

  // Click into the IR editor at real coordinates (natural focus + selection so
  // Vditor's input handler fires), then type a unique marker.
  const box = await page.evaluate(() => {
    const el = (window as any).vditor.vditor.ir.element as HTMLElement
    const r = el.getBoundingClientRect()
    return { x: r.x + 8, y: r.y + 8 }
  })
  await page.mouse.click(box.x, box.y)
  await page.keyboard.type('ZZZ58')
  // Save immediately — far inside Vditor's ~800ms input throttle, so nothing is
  // pending. The flush must still post the live value.
  await page.keyboard.press('Control+s')

  const edits = await page.evaluate(() =>
    (window as any).__posted.filter((m: any) => m.command === 'edit'),
  )
  expect(edits.length).toBeGreaterThan(0)
  expect(edits[edits.length - 1].content).toContain('ZZZ58')
})
