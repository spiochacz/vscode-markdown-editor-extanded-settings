import { describe, it, expect, beforeEach } from 'vitest'
import { MarkdownEditorProvider } from '../../src/extension'
import { formatPerf } from '../../src/perf-format'
import { mock } from './vscode-mock'

function resolveProvider(fsPath = '/workspace/note.md', text = '# doc\n') {
  mock.setWorkspaceFolder('/workspace')
  const context = mock.createExtensionContext()
  const document = mock.createTextDocument(fsPath, text)
  const panel = mock.createWebviewPanel()
  new MarkdownEditorProvider(context as any).resolveCustomTextEditor(
    document as any,
    panel as any
  )
  return { document, panel }
}

function lastInit() {
  return mock.calls.postMessage.filter((m) => m.type === 'init').at(-1)
}

const SAMPLE_PAYLOAD = {
  spans: {
    init: { count: 1, mean: 88.4, p50: 88.4, p95: 88.4, max: 88.4 },
    getValue: { count: 37, mean: 6.1, p50: 5.2, p95: 14.8, max: 22.0 },
  },
  renderText: {
    calls: 5120,
    totalSelfMs: 31.2,
    fastPathEligible: 4998,
    regexPath: 122,
    matched: 40,
  },
  docSize: 48210,
}

describe('profiling: init option', () => {
  beforeEach(() => mock.reset())

  it('passes the profiling setting into the init payload', async () => {
    mock.setConfig({ profiling: true })
    const { panel } = resolveProvider()
    await panel._receiveMessage({ command: 'ready' })
    expect(lastInit()?.options.profiling).toBe(true)
  })

  it('defaults profiling to undefined/false when the setting is unset', async () => {
    const { panel } = resolveProvider()
    await panel._receiveMessage({ command: 'ready' })
    expect(lastInit()?.options.profiling).toBeFalsy()
  })
})

describe('profiling: perf message routing', () => {
  beforeEach(() => mock.reset())

  it('appends a formatted line to the "vMarkd Perf" output channel', async () => {
    const { panel } = resolveProvider('/workspace/note.md')
    await panel._receiveMessage({ command: 'perf', payload: SAMPLE_PAYLOAD })

    const lines = mock.calls.outputChannels.get('vMarkd Perf')
    expect(lines).toBeDefined()
    const text = lines!.join('\n')
    expect(text).toContain('note.md')
    expect(text).toContain('docSize 48,210 chars')
    expect(text).toContain('getValue')
    // the hypothesis-1 confirmation line
    expect(text).toContain('bracket-eligible 4,998 (97.6%)')
  })
})

describe('formatPerf', () => {
  it('renders the header, span table and renderText counters', () => {
    const out = formatPerf(SAMPLE_PAYLOAD, 'big.md', '10:42:01')
    expect(out).toContain('[10:42:01] big.md  (docSize 48,210 chars)')
    expect(out).toMatch(/init\s+1\s+88\.4ms/)
    expect(out).toContain(
      'renderText: 5,120 calls  totalSelf 31.2ms  | bracket-eligible 4,998 (97.6%)  regex-run 122  matched 40'
    )
  })

  it('omits the span table when there are no spans', () => {
    const out = formatPerf({ docSize: 0 }, 'empty.md', '00:00:00')
    expect(out).toBe('[00:00:00] empty.md  (docSize 0 chars)')
  })
})
