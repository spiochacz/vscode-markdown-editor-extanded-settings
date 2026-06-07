import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectWikiMarkdownFiles,
  getWikiDocumentContext,
  getWikiRoot,
  isWikiFile,
} from '../../src/wiki'
import { FileType, mock, Uri, workspace } from './vscode-mock'

function mountFs(tree: Record<string, [string, number][]>) {
  mock.setReadDirectory(async (uri: Uri) => tree[uri.fsPath] ?? [])
}

const F = FileType.File
const D = FileType.Directory

describe('wiki', () => {
  beforeEach(() => {
    mock.reset()
    mock.setWorkspaceFolder('/ws')
    mock.setConfig({ enabled: true, root: '' })
  })

  describe('getWikiRoot', () => {
    it('returns the workspace root when enabled with empty root', () => {
      const root = getWikiRoot(Uri.file('/ws/docs/Page.md'))
      expect(root?.fsPath).toBe('/ws')
    })
    it('returns the configured subfolder when root is set', () => {
      mock.setConfig({ enabled: true, root: 'docs/wiki' })
      const root = getWikiRoot(Uri.file('/ws/docs/wiki/Page.md'))
      expect(root?.fsPath).toBe('/ws/docs/wiki')
    })
    it('returns undefined when disabled', () => {
      mock.setConfig({ enabled: false })
      expect(getWikiRoot(Uri.file('/ws/Page.md'))).toBeUndefined()
    })
    it('returns undefined for non-markdown files', () => {
      expect(getWikiRoot(Uri.file('/ws/note.txt'))).toBeUndefined()
    })
    it('returns undefined for a non-file scheme', () => {
      expect(getWikiRoot(Uri.parse('untitled:/ws/x.md'))).toBeUndefined()
    })
    it('returns undefined when file has no workspace folder', () => {
      workspace.getWorkspaceFolder.mockReturnValueOnce(undefined)
      expect(getWikiRoot(Uri.file('/orphan/Page.md'))).toBeUndefined()
    })
  })

  describe('isWikiFile', () => {
    it('is true for a markdown file when wiki is enabled', () => {
      expect(isWikiFile(Uri.file('/ws/Page.md'))).toBe(true)
    })
    it('is false when disabled', () => {
      mock.setConfig({ enabled: false })
      expect(isWikiFile(Uri.file('/ws/Page.md'))).toBe(false)
    })
    it('is false for non-md and undefined', () => {
      expect(isWikiFile(Uri.file('/ws/note.txt'))).toBe(false)
      expect(isWikiFile(undefined)).toBe(false)
    })
  })

  describe('getWikiDocumentContext', () => {
    it('is enabled with a root label when wiki is on', () => {
      const ctx = getWikiDocumentContext(Uri.file('/ws/Page.md'))
      expect(ctx.enabled).toBe(true)
      expect(ctx.rootLabel).toBeTruthy()
    })
    it('is disabled when wiki is off or for undefined', () => {
      mock.setConfig({ enabled: false })
      expect(getWikiDocumentContext(Uri.file('/ws/x.md')).enabled).toBe(false)
      expect(getWikiDocumentContext(undefined).enabled).toBe(false)
    })
  })

  describe('collectWikiMarkdownFiles', () => {
    it('recursively collects .md/.markdown and skips other files', async () => {
      mountFs({
        '/ws': [
          ['Home.md', F],
          ['readme.markdown', F],
          ['note.txt', F],
          ['sub', D],
        ],
        '/ws/sub': [['Deep.md', F]],
      })
      const files = await collectWikiMarkdownFiles(Uri.file('/ws'))
      expect(files.map((f) => f.fsPath).sort()).toEqual([
        '/ws/Home.md',
        '/ws/readme.markdown',
        '/ws/sub/Deep.md',
      ])
    })

    it('returns [] when the wiki root is missing (configured path deleted) — no throw', async () => {
      // `vmarkd.wiki.root` points at a directory that no longer exists.
      mock.setReadDirectory(async () => {
        throw new Error('ENOENT: no such file or directory')
      })
      await expect(
        collectWikiMarkdownFiles(Uri.file('/ws/gone')),
      ).resolves.toEqual([])
    })

    it('skips a subfolder that vanishes mid-scan instead of aborting', async () => {
      mock.setReadDirectory(async (uri: Uri) => {
        if (uri.fsPath === '/ws')
          return [['Home.md', F] as [string, number], ['ghost', D]]
        throw new Error('ENOENT') // /ws/ghost disappeared between listing and scan
      })
      const files = await collectWikiMarkdownFiles(Uri.file('/ws'))
      expect(files.map((f) => f.fsPath)).toEqual(['/ws/Home.md'])
    })
  })
})
