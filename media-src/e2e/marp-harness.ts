import { loadMarp, injectDeck } from '../src/marp-preview'
import {
  mountMarpPanel,
  slideIndexForOffset,
  offsetForSlideIndex,
  type MarpPanel,
} from '../src/marp-panel'

;(window as any).__vmarkdMarpSrc = '/marp-chunk.js'

const panel = document.getElementById('panel') as HTMLElement
const mount = document.getElementById('mount') as HTMLElement

;(window as any).__renderDeck = async (source: string): Promise<number> => {
  const marp = await loadMarp()
  return injectDeck(panel, source, marp)
}
;(window as any).__marpLoaded = () => !!(window as any).__vmarkdMarp

// Panel mount over a fake editor element. We stub window.vditor.getValue() so the panel's
// reverse-nav reads the current source; the spec sets it per render.
let currentSource = ''
;(window as any).vditor = { getValue: () => currentSource }

let lastNavOffset = -1
;(window as any).__vmarkdMarpNav = (off: number) => {
  lastNavOffset = off
}
;(window as any).__lastNavOffset = () => lastNavOffset

let mp: MarpPanel | null = null
;(window as any).__mountPanel = async (source: string): Promise<void> => {
  currentSource = source
  mp?.dispose()
  const editorRoot = document.createElement('div')
  editorRoot.className = 'vditor'
  mount.appendChild(editorRoot)
  mp = mountMarpPanel(editorRoot, source)
  await loadMarp() // ensure the deck has rendered before the spec asserts
  await new Promise((r) => setTimeout(r, 50))
}
;(window as any).__setCaretToSlide = (idx: number) => {
  const off = offsetForSlideIndex(currentSource, idx)
  mp?.highlightForOffset(currentSource, off)
}
;(window as any).__activeSlideIndex = () => mp?.activeIndex() ?? -1
;(window as any).__slideIndexForOffset = (off: number) =>
  slideIndexForOffset(currentSource, off)

;(window as any).__ready = true
