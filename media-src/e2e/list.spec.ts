import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

/**
 * E2e for Vditor's listToggle bugs (task 56), exercised against a real editor.
 *   - Crash: the uncheck path iterates ALL sibling <li> and called `.remove()` on
 *     a missing <input> — a checkbox-less sibling threw. Fixed with `?.` (the
 *     fixListToggle patch). This spec asserts the toggle no longer throws.
 *   - Sibling scope: toggling "check" on one item must make ONLY that item a task,
 *     not all of its siblings. (Open follow-up — see assertions below.)
 */
async function gotoList(page: Page, list: 'plain' | 'mixed') {
  await page.goto(`/list.html?list=${list}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

// Toggle list type on the Nth <li>; returns {ok,error} from the harness.
function toggle(page: Page, liIndex: number, type: string) {
  return page.evaluate(
    ({ liIndex, type }) => (window as any).__listToggle(liIndex, type),
    { liIndex, type },
  )
}

// Per-item checkbox presence after a toggle.
function checkboxes(page: Page) {
  return page.evaluate(() => {
    const ir = (window as any).vditor.vditor.ir.element as HTMLElement
    return Array.from(ir.querySelectorAll('li')).map(
      (li) => !!li.querySelector('input[type="checkbox"]'),
    )
  })
}

test.describe('listToggle — crash fix (task 56)', () => {
  test('toggling list type on a mixed list does not throw on a checkbox-less sibling', async ({
    page,
  }) => {
    await gotoList(page, 'mixed')
    // Item 0 has a checkbox; the uncheck path iterates every sibling incl. the
    // plain bullet (index 2). Pre-fix this threw on `.remove()` of null.
    const res = await toggle(page, 0, 'list')
    expect(res.ok).toBe(true)
    expect(res.error).toBeNull()
  })
})

test.describe('listToggle — sibling scope (task 56 follow-up)', () => {
  // KNOWN OPEN ISSUE (test.fixme): Vditor's listToggle mutates EVERY sibling <li>
  // (`itemElement.parentElement.querySelectorAll("li")`), so toggling "check" on
  // one item turns all of them into tasks. The proper fix is the Aloklok "split
  // the item into its own sibling list" rewrite — entangled with the whole-list
  // replaceChild, so it's deferred. NOTE: a faithful repro must drive the toolbar
  // (ir/process.ts re-parses the DOM after listToggle); calling listToggle in
  // isolation leaves the IR mid-transform (no stable <li>), so this assertion is a
  // placeholder for the real fix's spec.
  test.fixme('toggling "check" on one plain item should make ONLY that item a task', async ({
    page,
  }) => {
    await gotoList(page, 'plain')
    await toggle(page, 1, 'check')
    const after = await checkboxes(page)
    expect(after).toEqual([false, true, false])
  })
})
