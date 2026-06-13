import { describe, it, expect } from 'vitest'
import { parseMarpEnabled } from '../../src/marp-detect'

describe('parseMarpEnabled', () => {
  it('true when frontmatter has marp: true', () => {
    expect(parseMarpEnabled('---\nmarp: true\n---\n\n# Slide')).toBe(true)
  })

  it('tolerates surrounding whitespace and trailing comment', () => {
    expect(parseMarpEnabled('---\n  marp:   true   \n---\n')).toBe(true)
    expect(parseMarpEnabled('---\nmarp: true # deck\n---\n')).toBe(true)
  })

  it('true alongside other frontmatter keys, any order', () => {
    expect(
      parseMarpEnabled('---\ntheme: gaia\nmarp: true\npaginate: true\n---\n'),
    ).toBe(true)
  })

  it('false when marp is false', () => {
    expect(parseMarpEnabled('---\nmarp: false\n---\n# x')).toBe(false)
  })

  it('false when marp key absent', () => {
    expect(parseMarpEnabled('---\ntitle: Doc\n---\n# x')).toBe(false)
  })

  it('false when there is no frontmatter at all', () => {
    expect(parseMarpEnabled('# Just a heading\n\nmarp: true in body')).toBe(
      false,
    )
  })

  it('false on empty / non-string input', () => {
    expect(parseMarpEnabled('')).toBe(false)
    expect(parseMarpEnabled(undefined as unknown as string)).toBe(false)
  })

  it('only reads the FIRST frontmatter block (must start at offset 0)', () => {
    // A leading blank line means no frontmatter (CommonMark/Marp require it at the top).
    expect(parseMarpEnabled('\n---\nmarp: true\n---\n')).toBe(false)
  })

  it('handles CRLF line endings', () => {
    expect(parseMarpEnabled('---\r\nmarp: true\r\n---\r\n# x')).toBe(true)
  })
})
