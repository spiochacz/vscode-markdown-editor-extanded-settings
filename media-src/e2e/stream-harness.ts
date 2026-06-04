// E2e harness for the streaming/incremental IR render (task 49). Imports Vditor from
// SOURCE (so our esbuild patches apply) and drives streamRenderIR exactly like main.ts:
// construct the editor empty, then stream a multi-chunk document in chunk-by-chunk.
//
// The document is built so it spans several ~4 KB chunks, with the litmus cases for
// the task placed deliberately:
//   - a reference link [CommonMark][cm] + a footnote[^fn1] cited in the FIRST chunk,
//     with their DEFINITIONS in the LAST chunk → exercises cross-chunk def injection
//     (without it both degrade to literal text).
//   - a ```mermaid``` block in the middle → exercises diagram post-processing on a
//     streamed-in chunk (upstream Vditor #1906).
import Vditor from 'vditor/src/index'
import { streamRenderIR } from '../src/stream-render'

const FILLER = 'The quick brown fox jumps over the lazy dog. '.repeat(50)

function buildDoc(): string {
  const p: string[] = []
  p.push('# Stream test')
  p.push('Top citations: reference link [CommonMark][cm] and a footnote[^fn1].')
  for (let i = 0; i < 3; i++) p.push(FILLER)
  p.push(
    '```mermaid\nflowchart TD\n  A[Start] --> B{ok?}\n  B -->|yes| C[Done]\n  B -->|no| A\n```',
  )
  for (let i = 0; i < 3; i++) p.push(FILLER)
  // Definitions land in the final chunk — far from their citations above.
  p.push('[cm]: https://spec.commonmark.org/ "CommonMark spec"')
  p.push('[^fn1]: Footnote defined at the very end (cross-chunk).')
  return p.join('\n\n')
}

const doc = buildDoc()
;(window as any).__doc = doc

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  // Streaming path: Vditor is constructed empty, then filled by streamRenderIR.
  value: '',
  after() {
    ;(window as any).vditor = editor
    streamRenderIR(editor, doc, {
      onDone: () => {
        ;(window as any).__streamDone = true
      },
    }).catch((e: unknown) => {
      ;(window as any).__streamError = String(e)
    })
    ;(window as any).__ready = true
  },
})
