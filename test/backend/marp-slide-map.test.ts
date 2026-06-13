import { describe, it, expect } from 'vitest'
import {
  slideIndexForOffset,
  offsetForSlideIndex,
} from '../../media-src/src/marp-slide-map'

const DECK = '---\nmarp: true\n---\n\n# A\n\n---\n\n# B\n\n---\n\n# C\n'

describe('slideIndexForOffset', () => {
  it('offset 0 (start, inside frontmatter region) is slide 0', () => {
    expect(slideIndexForOffset(DECK, 0)).toBe(0)
  })
  it('frontmatter closing --- is NOT a slide break', () => {
    // offset just after the frontmatter close, in "# A" → still slide 0
    const aIdx = DECK.indexOf('# A')
    expect(slideIndexForOffset(DECK, aIdx)).toBe(0)
  })
  it('counts top-level --- before the offset', () => {
    expect(slideIndexForOffset(DECK, DECK.indexOf('# B'))).toBe(1)
    expect(slideIndexForOffset(DECK, DECK.indexOf('# C'))).toBe(2)
  })
  it('is monotonic across a --- boundary (never flips up then down)', () => {
    let prev = -1
    for (let o = 0; o <= DECK.length; o++) {
      const idx = slideIndexForOffset(DECK, o)
      expect(idx).toBeGreaterThanOrEqual(prev)
      prev = idx
    }
  })
})

describe('offsetForSlideIndex', () => {
  it('index 0 → start of first slide content (after frontmatter)', () => {
    expect(offsetForSlideIndex(DECK, 0)).toBe(DECK.indexOf('# A'))
  })
  it('index K → start of the Kth slide content', () => {
    expect(offsetForSlideIndex(DECK, 1)).toBe(DECK.indexOf('# B'))
    expect(offsetForSlideIndex(DECK, 2)).toBe(DECK.indexOf('# C'))
  })
})
