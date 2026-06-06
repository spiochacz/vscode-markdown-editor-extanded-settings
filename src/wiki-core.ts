// Pure wiki-link primitives shared by host (src/) and webview (media-src/src/).
// ZERO dependencies on vscode, Node, or browser APIs — just strings and regexes.
// Both sides import this module so normalization is guaranteed identical.

export const WikiLinkPattern = /\[\[([^[\]\n]+?)\]\]/g

export function extractWikiTarget(raw: string): string {
  const [target] = raw.split('|', 1)
  return target.trim()
}

export function parseWikiPayload(raw: string): {
  target: string
  label: string
} {
  const [target, label] = raw.split('|', 2).map((p) => p.trim())
  return { target, label: label || '' }
}

export function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(?:md|markdown)$/i, '')
}

export function normalizeWikiSegment(value: string): string {
  return stripMarkdownExtension(value)
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeWikiLookupKey(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => normalizeWikiSegment(segment))
    .filter(Boolean)
    .join('/')
}

// Compute lookup keys for a wiki file given its relative path from the wiki root.
// Returns [relativeKey, basenameKey] (deduplicated). Pure string operation — the
// caller passes the relative path (forward-slashed, with extension).
export function wikiKeysForRelativePath(relativePath: string): string[] {
  const ext = relativePath.match(/\.[^./\\]+$/)?.[0] ?? ''
  const withoutExt = relativePath.slice(0, -ext.length || undefined)
  const basename = withoutExt.split('/').pop() ?? withoutExt

  return Array.from(
    new Set(
      [
        normalizeWikiLookupKey(withoutExt),
        normalizeWikiLookupKey(basename),
      ].filter(Boolean),
    ),
  )
}

// Extract all wiki link targets from a markdown string. Returns normalized,
// deduplicated keys. Used by the host to resolve only the targets the current
// document needs (fast-path init).
export function extractWikiTargets(markdown: string): string[] {
  WikiLinkPattern.lastIndex = 0
  const keys = new Set<string>()
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex exec loop
  while ((m = WikiLinkPattern.exec(markdown)) !== null) {
    const key = normalizeWikiLookupKey(extractWikiTarget(m[1]))
    if (key) keys.add(key)
  }
  return Array.from(keys)
}
