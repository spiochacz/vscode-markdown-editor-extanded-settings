// Pure, DOM- and vscode-free aggregator for the rendering profiling harness
// (tasks/42). Holds no timers and touches no globals so it can be unit-tested
// in isolation; the singleton that wires it to performance.now()/postMessage
// lives in ./perf.

export interface SpanStats {
  /** lifetime count (may exceed the percentile sample window) */
  count: number
  /** mean over the recent sample window */
  mean: number
  p50: number
  p95: number
  max: number
}

export interface RenderTextStats {
  calls: number
  totalSelfMs: number
  /** text.indexOf('[[') === -1 — a fast-path would skip the regex here */
  fastPathEligible: number
  /** contained '[[' so the regex ran */
  regexPath: number
  /** the regex actually matched a wiki link */
  matched: number
}

export interface PerfSnapshot {
  spans: Record<string, SpanStats>
  renderText: RenderTextStats
  docSize: number
}

// Bound on the per-op percentile sample window. Percentiles come from the most
// recent RING durations; `count` still reflects the lifetime total.
export const RING = 256

function emptyRenderText(): RenderTextStats {
  return {
    calls: 0,
    totalSelfMs: 0,
    fastPathEligible: 0,
    regexPath: 0,
    matched: 0,
  }
}

function summarize(buf: number[], count: number): SpanStats {
  const n = buf.length
  if (n === 0) {
    return { count, mean: 0, p50: 0, p95: 0, max: 0 }
  }
  const sorted = [...buf].sort((a, b) => a - b)
  // nearest-rank percentile: clamp the index into the sorted window
  const pct = (p: number) => sorted[Math.min(n - 1, Math.floor((p / 100) * n))]
  const mean = buf.reduce((a, b) => a + b, 0) / n
  return { count, mean, p50: pct(50), p95: pct(95), max: sorted[n - 1] }
}

export class PerfAggregator {
  // ring buffer of recent durations per op (for percentiles)
  private spans = new Map<string, number[]>()
  // lifetime sample count per op (the ring may have dropped older samples)
  private counts = new Map<string, number>()
  private rt: RenderTextStats = emptyRenderText()
  private docSize = 0

  recordSpan(op: string, ms: number, docSize?: number): void {
    let buf = this.spans.get(op)
    if (!buf) {
      buf = []
      this.spans.set(op, buf)
    }
    buf.push(ms)
    if (buf.length > RING) {
      buf.shift()
    }
    this.counts.set(op, (this.counts.get(op) ?? 0) + 1)
    if (typeof docSize === 'number') {
      this.docSize = docSize
    }
  }

  recordRenderText(sample: {
    selfMs: number
    hadBrackets: boolean
    matched: boolean
  }): void {
    this.rt.calls++
    this.rt.totalSelfMs += sample.selfMs
    if (sample.hadBrackets) {
      this.rt.regexPath++
      if (sample.matched) {
        this.rt.matched++
      }
    } else {
      this.rt.fastPathEligible++
    }
  }

  hasData(): boolean {
    return this.spans.size > 0 || this.rt.calls > 0
  }

  snapshot(): PerfSnapshot {
    const spans: Record<string, SpanStats> = {}
    for (const [op, buf] of this.spans) {
      spans[op] = summarize(buf, this.counts.get(op) ?? buf.length)
    }
    return { spans, renderText: { ...this.rt }, docSize: this.docSize }
  }

  reset(): void {
    this.spans.clear()
    this.counts.clear()
    this.rt = emptyRenderText()
    // docSize is intentionally retained across flushes — it describes the
    // current document, not the flushed window.
  }
}
