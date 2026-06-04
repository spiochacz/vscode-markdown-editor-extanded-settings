import { test, expect } from './coverage-fixture'
import type { Page } from '@playwright/test'

/**
 * E2e for the streaming / incremental IR render (task 49). The harness streams a
 * multi-chunk document in chunk-by-chunk via streamRenderIR (exactly as main.ts does
 * for large files). We verify the correctness properties the task hinges on:
 *
 *  1. Cross-chunk reference resolution — a `[CommonMark][cm]` ref + `[^fn1]` footnote
 *     are CITED in the first chunk but DEFINED in the last; the referenced-only def
 *     injection must make them resolve to real IR nodes (not degrade to literal text).
 *  2. No truncation — after the stream completes, getValue() returns the FULL document
 *     (the data-loss guard: a mid-stream getValue would be truncated).
 *  3. A streamed-in ```mermaid``` block is post-processed (upstream Vditor #1906).
 */
async function gotoStream(page: Page) {
  await page.goto('/stream.html')
  await page.waitForFunction(() => (window as any).__ready === true)
  // streamRenderIR is async (yields between chunks) — wait for completion.
  await page.waitForFunction(() => (window as any).__streamDone === true, {
    timeout: 15000,
  })
  const err = await page.evaluate(() => (window as any).__streamError)
  expect(err, 'streamRenderIR must not throw').toBeFalsy()
}

test('cross-chunk reference link + footnote resolve to IR nodes (def injection)', async ({
  page,
}) => {
  await gotoStream(page)
  const state = await page.evaluate(() => {
    const ir = (window as any).vditor.vditor.ir.element as HTMLElement
    const refNodes = Array.from(ir.querySelectorAll('[data-type="link-ref"]'))
    return {
      // The citation became a recognized link-ref node (NOT literal text in a bare
      // <p> — that's what a failed cross-chunk injection would leave). In IR the node
      // legitimately still shows the `[text][label]` markers, so the signal is the
      // NODE existing, not the absence of the marker text.
      commonmarkRef: refNodes.some((n) =>
        (n.textContent || '').includes('CommonMark'),
      ),
      footnoteRef: ir.querySelectorAll('[data-type="footnotes-ref"]').length,
    }
  })
  expect(state.commonmarkRef).toBe(true) // resolved to a link-ref node
  expect(state.footnoteRef).toBeGreaterThan(0)
})

test('the full document is saved after streaming (no truncation)', async ({
  page,
}) => {
  await gotoStream(page)
  const r = await page.evaluate(() => {
    const v = (window as any).vditor
    const full: string = (window as any).__doc
    const got: string = v.getValue()
    return {
      ratio: got.length / full.length,
      hasTopCitation: got.includes('[CommonMark][cm]'),
      hasTailDef: got.includes('spec.commonmark.org'),
      hasMermaid: got.includes('flowchart TD'),
    }
  })
  // Round-trip may not be byte-identical, but the whole doc must be present:
  // the first-chunk citation AND the last-chunk definition both survive.
  expect(r.hasTopCitation).toBe(true)
  expect(r.hasTailDef).toBe(true)
  expect(r.hasMermaid).toBe(true)
  expect(r.ratio).toBeGreaterThan(0.9)
})

test('a streamed-in mermaid block is post-processed (renders, not raw code) — #1906', async ({
  page,
}) => {
  await gotoStream(page)
  // The mermaid block must have been appended + handed to code-render in its chunk.
  const present = await page.evaluate(() => {
    const ir = (window as any).vditor.vditor.ir.element as HTMLElement
    const infoMermaid = Array.from(
      ir.querySelectorAll('.vditor-ir__marker--info'),
    ).some((e) => (e.textContent || '').includes('mermaid'))
    return infoMermaid || ir.innerHTML.includes('language-mermaid')
  })
  expect(present, 'mermaid code block streamed into the IR').toBe(true)

  // And it actually renders to an SVG (mermaid.js loaded from the served cdn). This
  // is the exact upstream #1906 pain point — verify it on a streamed chunk.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const ir = (window as any).vditor.vditor.ir.element as HTMLElement
          return ir.querySelectorAll('.vditor-ir__preview svg').length
        }),
      { timeout: 12000 },
    )
    .toBeGreaterThan(0)
})
