import '../src/preload'
// Source import so the fixMathRender patch (strict:false, throwOnError:false) is
// applied — the whole point of this harness.
import Vditor from 'vditor/src/index'

// Real Vditor (IR) with a VALID and a deliberately BROKEN formula side by side
// (task 57). With the patch, KaTeX renders the broken one as an inline error
// (.katex-error) instead of throwing, so the valid one still renders and the
// editor stays usable.
const value = [
  'Valid inline math: $E = mc^2$ and more text.',
  '',
  'Broken inline math: $\\frac{1}{$ should not break the page.',
  '',
  'Another valid one: $a^2 + b^2 = c^2$.',
  '',
].join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  preview: { math: { inlineDigit: true } },
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    ;(window as any).vditorTest = editor
    ;(window as any).__ready = true
  },
})
