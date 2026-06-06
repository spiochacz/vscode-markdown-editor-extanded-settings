import { beforeEach, describe, expect, it } from 'vitest'
import {
  collectWikiMarkdownFiles,
  getWikiDocumentContext,
  getWikiRoot,
  isWikiFile,
} from '../../src/wiki'
import { FileType, mock, Uri } from './vscode-mock'

function mountFs(tree: Record<string, [string, number][]>) {
  mock.setReadDirectory(async (uri: Uri) => tree[uri.fsPath] ?? [])
}

const F = FileType.File
const D = FileType.Directory

describe('wiki', () => {
  beforeEach(() => {
    mock.reset()
    mock.setWorkspaceFolder('/ws')
  })

  describe('getWikiRoot', () => {
    it('returns the nearest ancestor named "wiki" for a markdown file', () => {
      const root = getWikiRoot(Uri.file('/ws/wiki/sub/Page.md'))
      expect(root?.fsPath).toBe('/ws/wiki')
    })
    it('is case-insensitive on the folder name', () => {
      expect(getWikiRoot(Uri.file('/ws/WIKI/Page.md'))?.fsPath).toBe('/ws/WIKI')
    })
    it('returns undefined when no wiki ancestor exists', () => {
      expect(getWikiRoot(Uri.file('/ws/docs/Page.md'))).toBeUndefined()
    })
    it('returns undefined for non-markdown files', () => {
      expect(getWikiRoot(Uri.file('/ws/wiki/note.txt'))).toBeUndefined()
    })
    it('returns undefined for a non-file scheme', () => {
      expect(getWikiRoot(Uri.parse('untitled:/ws/wiki/x.md'))).toBeUndefined()
    })
  })

  describe('isWikiFile', () => {
    it('is true for a markdown file under a wiki folder', () => {
      expect(isWikiFile(Uri.file('/ws/wiki/Page.md'))).toBe(true)
    })
    it('is false outside a wiki folder, for non-md, and for undefined', () => {
      expect(isWikiFile(Uri.file('/ws/docs/Page.md'))).toBe(false)
      expect(isWikiFile(Uri.file('/ws/wiki/note.txt'))).toBe(false)
      expect(isWikiFile(undefined)).toBe(false)
    })
  })

  describe('getWikiDocumentContext', () => {
    it('is enabled with a root label inside a wiki', () => {
      const ctx = getWikiDocumentContext(Uri.file('/ws/wiki/Page.md'))
      expect(ctx.enabled).toBe(true)
      expect(ctx.rootLabel).toBeTruthy()
    })
    it('is disabled outside a wiki or for undefined', () => {
      expect(getWikiDocumentContext(Uri.file('/ws/docs/x.md')).enabled).toBe(
        false,
      )
      expect(getWikiDocumentContext(undefined).enabled).toBe(false)
    })
  })

  describe('collectWikiMarkdownFiles', () => {
    it('recursively collects .md/.markdown and skips other files', async () => {
      mountFs({
        '/ws/wiki': [
          ['Home.md', F],
          ['readme.markdown', F],
          ['note.txt', F],
          ['sub', D],
        ],
        '/ws/wiki/sub': [['Deep.md', F]],
      })
      const files = await collectWikiMarkdownFiles(Uri.file('/ws/wiki'))
      expect(files.map((f) => f.fsPath).sort()).toEqual([
        '/ws/wiki/Home.md',
        '/ws/wiki/readme.markdown',
        '/ws/wiki/sub/Deep.md',
      ])
    })
  })
})
