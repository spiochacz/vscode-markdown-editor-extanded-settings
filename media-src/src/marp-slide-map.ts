// Pure slide↔source map (task 107). Counts top-level `---` slide-break lines, skipping a leading
// YAML frontmatter block. Shared by the preview-deck sync (caret→slide + click→source). Assumes
// LF line endings (the editor source is LF). Monotonic: frontmatter end is computed from the FULL
// source and breaks are compared by line-start offset, so the index never flips across a boundary.

/** First content line AFTER a leading `--- … ---`/`...` frontmatter block; 0 when none. */
export function frontmatterStartLine(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  for (let k = 1; k < lines.length; k++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[k])) return k + 1
  }
  return 0
}

export function slideIndexForOffset(source: string, offset: number): number {
  const lines = source.split(/\r?\n/)
  const start = frontmatterStartLine(lines)
  const clamped = Math.max(0, offset)
  let slide = 0
  let pos = 0
  for (let i = 0; i < lines.length; i++) {
    if (i >= start && lines[i].trim() === '---' && pos < clamped) slide++
    pos += lines[i].length + 1
  }
  return slide
}

export function offsetForSlideIndex(source: string, index: number): number {
  const lines = source.split(/\r?\n/)
  const start = frontmatterStartLine(lines)
  if (index <= 0) return charOffsetOfLine(lines, firstContentLine(lines, start))
  let slide = 0
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      slide++
      if (slide === index)
        return charOffsetOfLine(lines, firstContentLine(lines, i + 1))
    }
  }
  return charOffsetOfLine(lines, lines.length)
}

// Skip blank lines after a frontmatter/slide boundary so the offset lands on the slide's first
// CONTENT line (the caret target), not the blank gap line that follows the `---`.
function firstContentLine(lines: string[], from: number): number {
  let i = from
  while (i < lines.length && lines[i].trim() === '') i++
  return i
}

// Assumes LF line endings (`+1` per line for the stripped `\n`); the editor source is LF.
function charOffsetOfLine(lines: string[], line: number): number {
  let off = 0
  for (let i = 0; i < Math.min(line, lines.length); i++)
    off += lines[i].length + 1
  return off
}
