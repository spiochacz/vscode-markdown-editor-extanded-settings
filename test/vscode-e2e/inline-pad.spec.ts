import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// REAL-webview guard: inline-code h-padding must MATCH between IR and WYSIWYG. The harness
// can't catch this — Vditor's index.css (which zeroes WYSIWYG inline-code h-padding, then our
// build patch restores it) is served from the webview's asset cache with NO cache-buster, so
// the patch can arrive stale → WYSIWYG inline code drops to 0px h-padding in the REAL editor
// while IR (theme file, loaded fresh) keeps it. The fix owns the WYSIWYG padding in main.css
// (loaded fresh): this proves IR == WYSIWYG in the actual VS Code webview.
const FIXTURE = path.join(__dirname, 'fixtures', 'inline.md')

function webviewFrame(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('inline-code h-padding matches IR vs WYSIWYG (real webview)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(async (vscode, uri) => {
    await vscode.workspace
      .getConfiguration('vmarkd')
      .update('theme.content', 'vscode-dark-2026', true)
    await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.file(uri),
      'vmarkd.editor',
    )
  }, FIXTURE)

  const frame = webviewFrame(workbox)
  const body = frame.locator('body')
  await body.locator('.vditor-reset code').first().waitFor({ timeout: 45_000 })
  await workbox.waitForTimeout(1500)

  const pad = () =>
    body.evaluate(() => {
      const code = (
        Array.from(document.querySelectorAll('code')) as HTMLElement[]
      )
        .filter((c) => !c.classList.contains('hljs'))
        .find((c) => (c.offsetWidth || 0) > 0)
      if (!code) return 'NO-INLINE-CODE'
      const cs = getComputedStyle(code)
      return `${cs.paddingLeft}/${cs.paddingRight}`
    })

  const ir = await pad()
  await body
    .locator('button[data-mode="wysiwyg"]')
    .evaluate((b) => (b as HTMLElement).click())
  await workbox.waitForTimeout(1500)
  const wys = await pad()

  expect(ir).toBe('3px/3px') // vscode-2026: VS Code's 1px 3px
  expect(wys).toBe(ir) // WYSIWYG must match IR (not Vditor's cached 0px)
})
