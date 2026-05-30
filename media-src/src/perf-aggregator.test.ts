import { describe, it, expect } from 'vitest'
import { PerfAggregator, RING } from './perf-aggregator'

describe('PerfAggregator', () => {
  it('reports lifetime count, mean, percentiles and max for a span', () => {
    const agg = new PerfAggregator()
    // 1..100 ms
    for (let i = 1; i <= 100; i++) {
      agg.recordSpan('getValue', i)
    }
    const { spans } = agg.snapshot()
    const s = spans.getValue
    expect(s.count).toBe(100)
    expect(s.mean).toBeCloseTo(50.5, 5)
    expect(s.max).toBe(100)
    // nearest-rank: p50 -> index floor(0.5*100)=50 -> sorted[50] = 51
    expect(s.p50).toBe(51)
    // p95 -> index 95 -> sorted[95] = 96
    expect(s.p95).toBe(96)
  })

  it('bounds the percentile window to RING but keeps the lifetime count', () => {
    const agg = new PerfAggregator()
    const total = RING + 50
    for (let i = 0; i < total; i++) {
      agg.recordSpan('setValue', i)
    }
    const s = agg.snapshot().spans.setValue
    expect(s.count).toBe(total) // lifetime count is exact
    // only the most recent RING samples survive: max is the last value pushed
    expect(s.max).toBe(total - 1)
    // the oldest 50 (values 0..49) were dropped, so the min is >= 50
    expect(s.p50).toBeGreaterThanOrEqual(50)
  })

  it('tallies renderText fast-path / regex / matched counters', () => {
    const agg = new PerfAggregator()
    // 97 nodes without brackets, 3 with brackets (1 of them matched)
    for (let i = 0; i < 97; i++) {
      agg.recordRenderText({ selfMs: 0.01, hadBrackets: false, matched: false })
    }
    agg.recordRenderText({ selfMs: 0.5, hadBrackets: true, matched: true })
    agg.recordRenderText({ selfMs: 0.2, hadBrackets: true, matched: false })
    agg.recordRenderText({ selfMs: 0.2, hadBrackets: true, matched: false })

    const rt = agg.snapshot().renderText
    expect(rt.calls).toBe(100)
    expect(rt.fastPathEligible).toBe(97)
    expect(rt.regexPath).toBe(3)
    expect(rt.matched).toBe(1)
    expect(rt.totalSelfMs).toBeCloseTo(97 * 0.01 + 0.5 + 0.4, 5)
  })

  it('tracks the latest docSize and reports hasData', () => {
    const agg = new PerfAggregator()
    expect(agg.hasData()).toBe(false)
    agg.recordSpan('init', 90, 1000)
    agg.recordSpan('getValue', 5, 1200)
    expect(agg.hasData()).toBe(true)
    expect(agg.snapshot().docSize).toBe(1200)
  })

  it('reset clears spans and renderText but keeps docSize', () => {
    const agg = new PerfAggregator()
    agg.recordSpan('init', 90, 4096)
    agg.recordRenderText({ selfMs: 1, hadBrackets: true, matched: true })
    agg.reset()
    const snap = agg.snapshot()
    expect(agg.hasData()).toBe(false)
    expect(Object.keys(snap.spans)).toHaveLength(0)
    expect(snap.renderText.calls).toBe(0)
    expect(snap.docSize).toBe(4096) // describes the current document, retained
  })
})
