// Host-side formatter for the rendering profiling harness (tasks/42). Pure and
// dependency-free so it can be unit-tested; extension.ts feeds its output to the
// 'vMarkd Perf' OutputChannel.

interface SpanStats {
  count: number
  mean: number
  p50: number
  p95: number
  max: number
}

interface PerfPayload {
  spans?: Record<string, SpanStats>
  renderText?: {
    calls: number
    totalSelfMs: number
    fastPathEligible: number
    regexPath: number
    matched: number
  }
  docSize?: number
}

function num(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatPerf(
  payload: PerfPayload,
  file: string,
  timeStr: string
): string {
  const lines: string[] = []
  lines.push(`[${timeStr}] ${file}  (docSize ${num(payload.docSize ?? 0)} chars)`)

  const spans = payload.spans ?? {}
  const ops = Object.keys(spans)
  if (ops.length) {
    lines.push(
      '  op'.padEnd(13) +
        'count'.padStart(7) +
        'mean'.padStart(9) +
        'p50'.padStart(8) +
        'p95'.padStart(8) +
        'max'.padStart(8)
    )
    for (const op of ops) {
      const s = spans[op]
      lines.push(
        ('  ' + op).padEnd(13) +
          String(s.count).padStart(7) +
          `${s.mean.toFixed(1)}ms`.padStart(9) +
          s.p50.toFixed(1).padStart(8) +
          s.p95.toFixed(1).padStart(8) +
          s.max.toFixed(1).padStart(8)
      )
    }
  }

  const rt = payload.renderText
  if (rt && rt.calls) {
    const pct = ((100 * rt.fastPathEligible) / rt.calls).toFixed(1)
    lines.push(
      `  renderText: ${num(rt.calls)} calls  totalSelf ${rt.totalSelfMs.toFixed(
        1
      )}ms  | bracket-eligible ${num(rt.fastPathEligible)} (${pct}%)  ` +
        `regex-run ${num(rt.regexPath)}  matched ${num(rt.matched)}`
    )
  }

  return lines.join('\n')
}
