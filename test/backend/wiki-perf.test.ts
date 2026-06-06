import { beforeEach, describe, expect, it } from 'vitest'
import { collectWikiMarkdownFiles } from '../../src/wiki'
import {
  WikiCache,
  _resetCacheMap,
  getOrBuildCache,
  resolveVisibleTargets,
} from '../../src/wiki-cache'
import { extractWikiTargets } from '../../src/wiki-core'
import { FileType, mock, Uri } from './vscode-mock'

// Performance characterization of the wiki page-scan path. These tests don't
// assert wall-clock times (flaky on CI) — they COUNT how many fs.readDirectory
// calls the code makes, exposing the O(dirs) + "no cache" cost model. A future
// cache/watcher should bring the repeat-call counts to 0.

const F = FileType.File
const D = FileType.Directory

// Build a virtual wiki filesystem with `nDirs` subdirectories, each containing
// `filesPerDir` markdown files. Returns { tree, totalFiles, totalDirs }.
function buildLargeWiki(nDirs: number, filesPerDir: number) {
  const tree: Record<string, [string, number][]> = {}
  const rootEntries: [string, number][] = []
  let totalFiles = 0

  for (let d = 0; d < nDirs; d++) {
    const dirName = `section-${String(d).padStart(3, '0')}`
    rootEntries.push([dirName, D])
    const dirEntries: [string, number][] = []
    for (let f = 0; f < filesPerDir; f++) {
      dirEntries.push([`page-${String(f).padStart(3, '0')}.md`, F])
      totalFiles++
    }
    tree[`/ws/wiki/${dirName}`] = dirEntries
  }
  tree['/ws/wiki'] = rootEntries

  return { tree, totalFiles, totalDirs: nDirs + 1 }
}

describe('wiki scan performance characterization', () => {
  let readDirCallCount: number

  beforeEach(() => {
    mock.reset()
    _resetCacheMap()
    mock.setWorkspaceFolder('/ws')
    readDirCallCount = 0
  })

  function mountAndCount(tree: Record<string, [string, number][]>) {
    mock.setReadDirectory(async (uri: Uri) => {
      readDirCallCount++
      return tree[uri.fsPath] ?? []
    })
  }

  describe('collectWikiMarkdownFiles — O(dirs) readDirectory calls', () => {
    it('small wiki (5 dirs × 10 files = 50 files): readDirectory calls = dirs + 1', async () => {
      const { tree, totalFiles, totalDirs } = buildLargeWiki(5, 10)
      mountAndCount(tree)

      const files = await collectWikiMarkdownFiles(Uri.file('/ws/wiki'))

      expect(files).toHaveLength(totalFiles)
      expect(readDirCallCount).toBe(totalDirs) // 1 root + 5 subdirs
    })

    it('medium wiki (50 dirs × 20 files = 1000 files): readDirectory calls = 51', async () => {
      const { tree, totalFiles, totalDirs } = buildLargeWiki(50, 20)
      mountAndCount(tree)

      const files = await collectWikiMarkdownFiles(Uri.file('/ws/wiki'))

      expect(files).toHaveLength(totalFiles)
      expect(readDirCallCount).toBe(totalDirs)
    })

    it('large wiki (200 dirs × 50 files = 10000 files): readDirectory calls = 201', async () => {
      const { tree, totalFiles, totalDirs } = buildLargeWiki(200, 50)
      mountAndCount(tree)

      const files = await collectWikiMarkdownFiles(Uri.file('/ws/wiki'))

      expect(files).toHaveLength(totalFiles)
      expect(readDirCallCount).toBe(totalDirs)
    })
  })

  describe('WikiCache — cached lookups eliminate repeated scans', () => {
    it('first build scans once, subsequent has/resolve = 0 readDirectory', async () => {
      const { tree, totalDirs } = buildLargeWiki(50, 20)
      mountAndCount(tree)

      const cache = await WikiCache.build(Uri.file('/ws/wiki'))
      const afterBuild = readDirCallCount

      // 1000 resolve lookups — zero additional scans
      for (let i = 0; i < 1000; i++) {
        cache.has(`section-${String(i % 50).padStart(3, '0')}/page-000`)
        cache.resolve(`page-${String(i % 20).padStart(3, '0')}`)
      }
      expect(readDirCallCount).toBe(afterBuild) // unchanged

      cache.dispose()
      expect(afterBuild).toBe(totalDirs) // one scan total
    })

    it('getOrBuildCache: second editor open = 0 scans', async () => {
      const { tree, totalDirs } = buildLargeWiki(10, 10)
      mountAndCount(tree)

      await getOrBuildCache(Uri.file('/ws/wiki'))
      const afterFirst = readDirCallCount

      await getOrBuildCache(Uri.file('/ws/wiki'))
      expect(readDirCallCount).toBe(afterFirst) // no re-scan
      expect(afterFirst).toBe(totalDirs)
    })

    it('resolveVisibleTargets: O(targets) not O(files)', async () => {
      const { tree } = buildLargeWiki(50, 20)
      mountAndCount(tree)

      const cache = await WikiCache.build(Uri.file('/ws/wiki'))
      const afterBuild = readDirCallCount

      const targets = extractWikiTargets(
        'See [[section-000/page-000]] and [[page-005]] and [[missing]].',
      )
      const resolved = resolveVisibleTargets(cache, targets)

      expect(resolved).toContain('section-000/page-000')
      expect(resolved).toContain('page-005')
      expect(resolved).not.toContain('missing')
      expect(readDirCallCount).toBe(afterBuild) // zero scans for resolve

      cache.dispose()
    })
  })
})
