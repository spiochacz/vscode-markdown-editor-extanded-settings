// Callouts harness (task 106). Builds the blockquote shapes Lute emits for `> [!TYPE]`
// (`<blockquote><p>[!NOTE]<br>body</p></blockquote>`) inside a non-editable `.vditor-reset`,
// plus a plain quote, a foldable, and one inside a contenteditable host (must be skipped).
// Exposes applyCallouts so the spec can run + assert.
import { applyCallouts } from '../src/callouts'

const app = document.getElementById('app') as HTMLElement
app.innerHTML = `
  <div class="vditor-reset" contenteditable="false">
    <blockquote id="note"><p>[!NOTE]<br>Body of the note.</p></blockquote>
    <blockquote id="warning"><p>[!WARNING] Careful<br>Watch out.</p></blockquote>
    <blockquote id="fold"><p>[!tip]-<br>Hidden tip.</p></blockquote>
    <blockquote id="plain"><p>Just a normal quote.</p></blockquote>
  </div>
  <div class="vditor-reset" contenteditable="true">
    <blockquote id="editable"><p>[!NOTE]<br>Live-edited, must NOT transform.</p></blockquote>
  </div>
`
;(window as any).__apply = () => applyCallouts(document.body)
;(window as any).__ready = true
