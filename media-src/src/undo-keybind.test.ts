import { describe, it, expect, vi } from 'vitest'
import {
  historyActionFor,
  runVditorHistory,
  setupHistoryKeybind,
} from './undo-keybind'

const ev = (o: Partial<KeyboardEvent>) =>
  ({
    key: 'z',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...o,
  } as KeyboardEvent)

describe('historyActionFor (non-mac: Ctrl is the history modifier)', () => {
  it('Ctrl+Z → undo', () => {
    expect(historyActionFor(ev({ key: 'z', ctrlKey: true }), false)).toBe('undo')
  })
  it('Ctrl+Shift+Z → redo', () => {
    expect(
      historyActionFor(ev({ key: 'z', ctrlKey: true, shiftKey: true }), false)
    ).toBe('redo')
  })
  it('Ctrl+Y → redo', () => {
    expect(historyActionFor(ev({ key: 'y', ctrlKey: true }), false)).toBe('redo')
  })
  it('handles an uppercase key (caps/shift) the same', () => {
    expect(historyActionFor(ev({ key: 'Z', ctrlKey: true }), false)).toBe('undo')
  })
  it('bare z (no modifier) is not a history shortcut', () => {
    expect(historyActionFor(ev({ key: 'z' }), false)).toBeNull()
  })
  it('Ctrl+Alt+Z is ignored (Alt is the edit-in-vscode combo, not history)', () => {
    expect(
      historyActionFor(ev({ key: 'z', ctrlKey: true, altKey: true }), false)
    ).toBeNull()
  })
  it('Cmd+Z on a non-mac platform does nothing (wrong modifier)', () => {
    expect(historyActionFor(ev({ key: 'z', metaKey: true }), false)).toBeNull()
  })
})

describe('historyActionFor (mac: Cmd is the history modifier)', () => {
  it('Cmd+Z → undo', () => {
    expect(historyActionFor(ev({ key: 'z', metaKey: true }), true)).toBe('undo')
  })
  it('Cmd+Shift+Z → redo', () => {
    expect(
      historyActionFor(ev({ key: 'z', metaKey: true, shiftKey: true }), true)
    ).toBe('redo')
  })
  it('Ctrl+Z on mac does nothing (Ctrl is not the mac history modifier)', () => {
    expect(historyActionFor(ev({ key: 'z', ctrlKey: true }), true)).toBeNull()
  })
  it('Cmd+Ctrl+Z is ignored (that is the edit-in-vscode combo on mac)', () => {
    expect(
      historyActionFor(ev({ key: 'z', metaKey: true, ctrlKey: true }), true)
    ).toBeNull()
  })
})

describe('runVditorHistory', () => {
  it('calls the Vditor undo engine with the inner instance', () => {
    const inner = { undo: { undo: vi.fn(), redo: vi.fn() } }
    const win = { vditor: { vditor: inner } }
    runVditorHistory(win, 'undo')
    runVditorHistory(win, 'redo')
    expect(inner.undo.undo).toHaveBeenCalledWith(inner)
    expect(inner.undo.redo).toHaveBeenCalledWith(inner)
  })
  it('no-ops safely when Vditor or its undo engine is not ready', () => {
    expect(() => runVditorHistory({}, 'undo')).not.toThrow()
    expect(() =>
      runVditorHistory({ vditor: { vditor: {} } }, 'undo')
    ).not.toThrow()
  })
})

describe('setupHistoryKeybind', () => {
  function makeWin(platform: string, inner: any) {
    let handler: (e: any) => void = () => {}
    return {
      navigator: { platform },
      vditor: { vditor: inner },
      addEventListener: (type: string, h: any) => {
        if (type === 'keydown') handler = h
      },
      fire: (e: any) => handler(e),
    } as any
  }

  it('routes Ctrl+Z to undo and prevents the default + propagation', () => {
    const inner = { undo: { undo: vi.fn(), redo: vi.fn() } }
    const win = makeWin('Linux x86_64', inner)
    setupHistoryKeybind(win)
    const e = {
      ...ev({ key: 'z', ctrlKey: true }),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    win.fire(e)
    expect(inner.undo.undo).toHaveBeenCalledWith(inner)
    expect(e.preventDefault).toHaveBeenCalled() // native + VS Code undo suppressed
    expect(e.stopPropagation).toHaveBeenCalled()
  })

  it('leaves a plain keystroke untouched (no prevent, no engine call)', () => {
    const inner = { undo: { undo: vi.fn(), redo: vi.fn() } }
    const win = makeWin('Linux x86_64', inner)
    setupHistoryKeybind(win)
    const e = {
      ...ev({ key: 'z' }),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    win.fire(e)
    expect(inner.undo.undo).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled() // typing 'z' must still insert
  })
})
