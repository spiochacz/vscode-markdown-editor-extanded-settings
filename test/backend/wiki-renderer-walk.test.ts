import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { wikiTextToHtml } from '../../media-src/src/custom-renderer'

// Regression for the wiki custom-renderer walk-status bug: setupCustomRenderer
// registered Lute JS renderers (renderText) that returned a hardcoded status of 0.
// Lute's enum is WalkStop = 0, WalkSkipChildren = 1, WalkContinue = 2 — so 0 actually
// STOPPED the AST walk after our text node, dropping every sibling rendered after it.
// Single-text-node paragraphs survived (only the auto-closed </p> was lost), which hid
// the bug, but reference links — a real Lute node that splits the paragraph — truncated
// the whole block (`[CommonMark][cm]` → `<p>Top: ` with the link and trailing text gone).
//
// This loads the vendored Lute (the same engine the webview runs), registers a renderText
// that mirrors custom-renderer.ts (wikiTextToHtml + the real WalkContinue), and asserts a
// reference link survives. It also pins Lute.WalkContinue so an engine bump can't silently
// reintroduce the wrong constant.

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const LUTE_PATH = `${ROOT}/media-src/vendor/lute/lute.min.js`

let Lute: any

beforeAll(() => {
  // Lute (GopherJS) expects browser globals; the webview shims these the same way.
  ;(globalThis as any).window ??= globalThis
  ;(globalThis as any).self ??= globalThis
  new Function(readFileSync(LUTE_PATH, 'utf8'))()
  Lute = (globalThis as any).Lute
})

// Build a Lute with the same renderers custom-renderer.ts installs when wiki links are on.
function luteWithWikiRenderers(walkStatus: number) {
  const lute = Lute.New()
  const renderText = (node: any, entering: boolean) =>
    entering
      ? [wikiTextToHtml(node.TokensStr(), true), walkStatus]
      : ['', walkStatus]
  lute.SetJSRenderers({
    renderers: {
      Md2VditorIRDOM: { renderText },
      Md2HTML: { renderText },
    },
  })
  return lute
}

describe('wiki custom-renderer walk status', () => {
  it('uses the correct Lute.WalkContinue constant (2)', () => {
    expect(Lute.WalkContinue).toBe(2)
    expect(Lute.WalkStop).toBe(0)
  })

  const refDoc =
    'Top: [CommonMark][cm] x.\n\n[cm]: https://spec.commonmark.org/ "t"'

  it('renders a reference link in preview (Md2HTML) without truncating the block', () => {
    const html = luteWithWikiRenderers(Lute.WalkContinue).Md2HTML(refDoc)
    expect(html).toContain('<a href="https://spec.commonmark.org/"')
    expect(html).toContain('>CommonMark</a>')
    expect(html).toContain('x.') // trailing text after the link survives
  })

  it('renders a reference link in the editor (Md2VditorIRDOM) as a link-ref node', () => {
    const dom = luteWithWikiRenderers(Lute.WalkContinue).Md2VditorIRDOM(refDoc)
    expect(dom).toContain('data-type="link-ref"')
    expect(dom).toContain('x.')
  })

  it('still renders [[wiki]] chips', () => {
    const html = luteWithWikiRenderers(Lute.WalkContinue).Md2HTML(
      'See [[Page Name]] here',
    )
    expect(html).toContain('class="wiki-link-chip"')
    expect(html).toContain('here')
  })

  it('documents the bug: WalkStop (0) truncates the block at the reference link', () => {
    const html = luteWithWikiRenderers(Lute.WalkStop).Md2HTML(refDoc)
    expect(html).not.toContain('<a href') // link dropped — the regression we fixed
  })
})
