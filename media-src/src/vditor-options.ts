// Build the Vditor constructor options from the host's init/update message.
// Extracted from main.ts so the option mapping (theme, code highlight style,
// code-block line numbers, outline) is unit/e2e testable in isolation.
//
// Why this matters: `msg.options` carries BOTH the config-derived settings
// (collectConfigOptions) AND the webview's previously-SAVED Vditor options
// (saveVditorOptions persists the whole `preview` object). Config-derived
// settings must therefore be applied as the FINAL, authoritative merge so a
// stale saved value can't override the current setting — otherwise a setting
// becomes a one-way switch (e.g. line numbers that turn on but never off).

import { deepMerge } from './deep-merge'

// Resolve the code-block highlight style: the `codeTheme` setting, or — when
// 'auto'/unset — github/github-dark following the VS Code light/dark theme.
export function codeHljsStyle(theme: 'dark' | 'light', options: any): string {
  const ct = options?.codeTheme
  if (!ct || ct === 'auto') return theme === 'dark' ? 'github-dark' : 'github'
  return ct
}

export function buildVditorOptions(msg: any): any {
  let opts: any = msg.cdn ? { cdn: msg.cdn } : {}
  const codeStyle = codeHljsStyle(
    msg.theme === 'dark' ? 'dark' : 'light',
    msg.options,
  )
  if (msg.theme === 'dark') {
    opts = deepMerge(opts, {
      theme: 'dark',
      preview: { theme: { current: 'dark' }, hljs: { style: codeStyle } },
    })
  } else {
    opts = deepMerge(opts, { preview: { hljs: { style: codeStyle } } })
  }
  opts = deepMerge(opts, msg.options, {
    preview: { math: { inlineDigit: true }, actions: [] },
  })
  // The code-block line-number gutter follows the `codeLineNumbers` setting.
  // Apply it LAST and ALWAYS (true AND false) so it overrides any stale
  // `preview.hljs.lineNumber` spread in from msg.options above (the webview's
  // saveVditorOptions persists the whole preview object). Without the explicit
  // false branch, a value saved while the setting was on would pin line numbers
  // on forever, making the setting a one-way switch (the "always there" bug).
  opts = deepMerge(opts, {
    preview: {
      hljs: { lineNumber: msg.options?.codeBlockLineNumbers === true },
    },
  })
  opts = deepMerge(opts, {
    outline: {
      enable: msg.options?.showOutlineByDefault === true,
      position: msg.options?.outlinePosition === 'left' ? 'left' : 'right',
    },
  })
  return opts
}
