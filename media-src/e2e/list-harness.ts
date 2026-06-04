import '../src/preload'
// Source import so the fixListToggle esbuild patch is applied (see link-harness).
import Vditor from 'vditor/src/index'
import { listToggle } from 'vditor/src/ts/util/fixBrowserBehavior'

// Real Vditor (IR) to exercise the listToggle bugs (task 56): the null-deref
// crash on a checkbox-less sibling, and the sibling-scope mutation (toggling one
// item must not affect the others). The list shape is read from the URL
// (`?list=plain|mixed`) so the spec can pick the right fixture per assertion.
const lists: Record<string, string> = {
  // Plain bullets — toggling "check" on one item should make ONLY that item a task.
  plain: ['- one', '- two', '- three', ''].join('\n'),
  // Some items have a checkbox, some don't — the uncheck path used to null-deref
  // on the checkbox-less sibling.
  mixed: [
    '- [ ] task one',
    '- [x] task two done',
    '- plain bullet, no checkbox',
    '- [ ] task four',
    '',
  ].join('\n'),
}
const value =
  lists[new URLSearchParams(location.search).get('list') || 'plain'] ||
  lists.plain

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    ;(window as any).vditorTest = editor

    // Toggle list type on the Nth <li> in the IR editor, mirroring what the
    // toolbar list/check buttons do (ir/process.ts → listToggle). Returns
    // {ok, error} so the spec can assert "no crash".
    ;(window as any).__listToggle = (liIndex: number, type: string) => {
      try {
        const irEl = (editor as any).vditor.ir.element as HTMLElement
        const li = irEl.querySelectorAll('li')[liIndex] as HTMLElement
        const range = document.createRange()
        range.selectNodeContents(li)
        range.collapse(true)
        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)
        listToggle((editor as any).vditor, range, type)
        return { ok: true, error: null }
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) }
      }
    }
    ;(window as any).__ready = true
  },
})
