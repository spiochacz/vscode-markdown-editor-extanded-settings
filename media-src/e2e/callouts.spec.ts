import { test, expect } from './coverage-fixture'

// Task 106 — `[!TYPE]` blockquotes become styled callouts (display-only, round-trip safe).

test.beforeEach(async ({ page }) => {
  await page.goto('/callouts.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.evaluate(() => (window as any).__apply())
})

test('a [!NOTE] blockquote becomes a callout (type + title, marker stripped)', async ({
  page,
}) => {
  const bq = page.locator('#note')
  await expect(bq).toHaveAttribute('data-callout', 'note')
  await expect(bq.locator('.vmarkd-callout__title')).toHaveText('Note')
  // the raw [!NOTE] marker is gone; the body remains
  await expect(bq).not.toContainText('[!NOTE]')
  await expect(bq).toContainText('Body of the note.')
})

test('captures an explicit title', async ({ page }) => {
  await expect(page.locator('#warning')).toHaveAttribute(
    'data-callout',
    'warning',
  )
  await expect(page.locator('#warning .vmarkd-callout__title')).toHaveText(
    'Careful',
  )
})

test('foldable [!tip]- is marked collapsed', async ({ page }) => {
  const bq = page.locator('#fold')
  await expect(bq).toHaveAttribute('data-callout', 'tip')
  await expect(bq).toHaveAttribute('data-callout-foldable', 'closed')
})

test('a normal blockquote is left untouched', async ({ page }) => {
  await expect(page.locator('#plain')).not.toHaveAttribute('data-callout', /.*/)
  await expect(page.locator('#plain')).toContainText('Just a normal quote.')
})

test('a blockquote inside contenteditable is NOT transformed (round-trip safe)', async ({
  page,
}) => {
  const bq = page.locator('#editable')
  await expect(bq).not.toHaveAttribute('data-callout', /.*/)
  await expect(bq).toContainText('[!NOTE]') // marker preserved in the source
})

test('the callout box is styled (left border + tinted background)', async ({
  page,
}) => {
  const styles = await page.locator('#note').evaluate((el) => {
    const s = getComputedStyle(el)
    return { border: s.borderLeftWidth, bg: s.backgroundColor }
  })
  expect(parseFloat(styles.border)).toBeGreaterThan(0)
  expect(styles.bg).not.toBe('rgba(0, 0, 0, 0)') // has a tint
})
