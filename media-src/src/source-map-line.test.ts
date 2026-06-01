import { describe, it, expect } from 'vitest'
import { lineAndTextForOffset } from './source-map'

// Pure: offset → { line, lineText } in the SAME string. Reveal-in-source sends
// both to the host so it can match by content (robust to Vditor's on-load
// reflow) instead of trusting a raw offset across two text spaces.
describe('lineAndTextForOffset', () => {
  const md = '# Title\n\nFirst para.\nSecond para.\n'

  it('returns the line and its text for an offset', () => {
    // offset of "Second" = after "# Title\n\nFirst para.\n"
    const off = md.indexOf('Second')
    expect(lineAndTextForOffset(md, off)).toEqual({
      line: 3,
      lineText: 'Second para.',
    })
  })

  it('returns the heading line with its marker', () => {
    expect(lineAndTextForOffset(md, 2)).toEqual({
      line: 0,
      lineText: '# Title',
    })
  })

  it('clamps a negative offset to line 0', () => {
    expect(lineAndTextForOffset(md, -5).line).toBe(0)
  })

  it('clamps an out-of-range offset to the last line', () => {
    const res = lineAndTextForOffset(md, 9999)
    expect(res.line).toBe(4) // trailing empty line after the final \n
    expect(res.lineText).toBe('')
  })
})
