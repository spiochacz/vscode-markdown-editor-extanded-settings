import { test, expect, describe } from 'vitest'
import { buildVditorOptions, codeHljsStyle } from './vditor-options.ts'

describe('codeHljsStyle', () => {
  test('follows the VS Code theme when codeTheme is auto/unset', () => {
    expect(codeHljsStyle('dark', {})).toBe('github-dark')
    expect(codeHljsStyle('light', {})).toBe('github')
    expect(codeHljsStyle('dark', { codeTheme: 'auto' })).toBe('github-dark')
  })

  test('uses an explicit codeTheme when set', () => {
    expect(codeHljsStyle('light', { codeTheme: 'dracula' })).toBe('dracula')
  })
})

describe('buildVditorOptions — codeLineNumbers is authoritative', () => {
  test('setting on enables the line-number gutter', () => {
    const opts = buildVditorOptions({
      options: { codeBlockLineNumbers: true },
    })
    expect(opts.preview.hljs.lineNumber).toBe(true)
  })

  test('setting off disables the line-number gutter', () => {
    const opts = buildVditorOptions({
      options: { codeBlockLineNumbers: false },
    })
    expect(opts.preview.hljs.lineNumber).toBe(false)
  })

  test('setting unset defaults the gutter off', () => {
    const opts = buildVditorOptions({ options: {} })
    expect(opts.preview.hljs.lineNumber).toBe(false)
  })

  test('setting off OVERRIDES a stale saved preview.hljs.lineNumber:true (the bug)', () => {
    // saveVditorOptions persists the whole preview object, so a session that once
    // had line numbers on spreads lineNumber:true back into msg.options. The
    // current (off) setting must win, not the saved value.
    const opts = buildVditorOptions({
      options: {
        codeBlockLineNumbers: false,
        preview: { hljs: { lineNumber: true } },
      },
    })
    expect(opts.preview.hljs.lineNumber).toBe(false)
  })

  test('a non-boolean truthy saved value cannot leak through as on', () => {
    const opts = buildVditorOptions({
      options: {
        codeBlockLineNumbers: undefined,
        preview: { hljs: { lineNumber: true } },
      },
    })
    expect(opts.preview.hljs.lineNumber).toBe(false)
  })

  test('preserves the resolved hljs style alongside the line-number flag', () => {
    const opts = buildVditorOptions({
      theme: 'dark',
      options: { codeBlockLineNumbers: true, codeTheme: 'nord' },
    })
    expect(opts.preview.hljs.style).toBe('nord')
    expect(opts.preview.hljs.lineNumber).toBe(true)
  })
})
