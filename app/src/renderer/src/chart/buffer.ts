// Point storage for the active chart: [time, value] pairs per field (the shape ECharts
// takes directly) plus running statistics for the value panel.

export interface FieldStats {
  cur: number | null
  min: number
  max: number
  sum: number
  n: number
}

const emptyStats = (): FieldStats => ({ cur: null, min: Infinity, max: -Infinity, sum: 0, n: 0 })

export class ChartBuffer {
  times: number[] = []
  pairs: [number, number | null][][] = []
  stats: FieldStats[] = []

  constructor(fieldCount: number) {
    this.reset(fieldCount)
  }

  reset(fieldCount: number): void {
    this.times = []
    this.pairs = Array.from({ length: fieldCount }, () => [])
    this.stats = Array.from({ length: fieldCount }, emptyStats)
  }

  get length(): number {
    return this.times.length
  }

  get lastTime(): number | undefined {
    return this.times[this.times.length - 1]
  }

  push(t: number, values: (number | null)[], maxPoints: number): void {
    this.times.push(t)
    values.forEach((v, i) => {
      const list = this.pairs[i]
      if (!list) return
      list.push([t, v])
      if (v === null) return
      const s = this.stats[i]
      s.cur = v
      s.min = Math.min(s.min, v)
      s.max = Math.max(s.max, v)
      s.sum += v
      s.n++
    })
    // Trim in chunks (10%) so splicing does not happen on every point.
    if (this.times.length > maxPoints * 1.1) {
      const drop = this.times.length - maxPoints
      this.times.splice(0, drop)
      this.pairs.forEach((p) => p.splice(0, drop))
    }
  }

  /** Index of the first point at or after time t (binary search; times are ascending). */
  indexAt(t: number): number {
    let lo = 0
    let hi = this.times.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.times[mid] < t) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  /** Points per second over the last 5 seconds. */
  rate(now = Date.now()): number {
    return (this.times.length - this.indexAt(now - 5000)) / 5
  }
}
