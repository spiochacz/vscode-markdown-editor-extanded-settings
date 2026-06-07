import '../src/preload'
import Vditor from 'vditor'
import { buildVditorOptions } from '../src/vditor-options'

// Code-block line-number harness. Drives Vditor through the REAL buildVditorOptions
// (the same option mapping main.ts uses) so the spec can prove the `codeLineNumbers`
// setting actually governs the rendered line-number gutter — including the
// regression where a stale SAVED `preview.hljs.lineNumber` (saveVditorOptions
// persists the whole preview object) pinned line numbers on even with the setting off.
//
// Query params let each test pick a scenario without re-init gymnastics:
//   ?setting=1|0   -> msg.options.codeBlockLineNumbers (the live setting)
//   ?saved=1       -> simulate a saved Vditor-options blob carrying lineNumber:true
//   ?mode=ir|wysiwyg|sv  -> editor mode (default ir)
const params = new URLSearchParams(location.search)
const settingOn = params.get('setting') === '1'
const savedOn = params.get('saved') === '1'
const mode = params.get('mode') || 'ir'

const msg: any = {
  cdn: `${location.origin}/vditor`,
  theme: 'light',
  options: {
    codeBlockLineNumbers: settingOn,
    // The webview saves the ENTIRE preview object (utils.ts saveVditorOptions),
    // so a session that once had line numbers on persists hljs.lineNumber:true.
    // On the next open the host spreads that saved blob into msg.options.
    ...(savedOn ? { preview: { hljs: { lineNumber: true } } } : {}),
  },
}

const opts = buildVditorOptions(msg)

const value = [
  'Intro paragraph before the code.',
  '',
  '```js',
  'const a = 1',
  'const b = 2',
  'const c = 3',
  'const d = 4',
  '```',
  '',
  'Trailing paragraph after the code.',
  '',
].join('\n')

const editor = new Vditor('app', {
  ...opts,
  mode,
  cache: { enable: false },
  value,
  after() {
    ;(window as any).vditor = editor
    // Read the effective option Vditor merged in — lets the spec assert the
    // option mapping independently of async highlight rendering.
    ;(window as any).__effectiveLineNumber =
      editor.vditor.options.preview.hljs.lineNumber === true
    ;(window as any).__lineNumberCount = () =>
      document.querySelectorAll('.vditor-linenumber__rows').length
    ;(window as any).__ready = true
  },
})
