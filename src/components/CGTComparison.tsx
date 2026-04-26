import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'

// ─── Constants ───────────────────────────────────────────────────────────────

const TAX_BRACKETS = [
  { label: '0% (≤ $18,200)', value: 0 },
  { label: '21% (≤ $45,000 incl. Medicare)', value: 21 },
  { label: '34.5% (≤ $120,000 incl. Medicare)', value: 34.5 },
  { label: '39% (≤ $180,000 incl. Medicare)', value: 39 },
  { label: '47% (> $180,000 incl. Medicare)', value: 47 },
]

const COLORS = {
  current: '#3b82f6',
  proposed: '#f97316',
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
})

const pct = (v: number) => `${v.toFixed(1)}%`

function formatAxisCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`
  return fmt.format(value)
}

// ─── Calculation ─────────────────────────────────────────────────────────────

function calculateData(
  costBase: number,
  growthRate: number,
  inflationRate: number,
  marginalTaxRate: number,
  maxYears: number
) {
  const g = growthRate / 100
  const i = inflationRate / 100
  const t = marginalTaxRate / 100

  return Array.from({ length: maxYears }, (_, idx) => {
    const year = idx + 1
    const finalValue = costBase * Math.pow(1 + g, year)
    const grossGain = finalValue - costBase

    const taxCurrent = grossGain * 0.5 * t
    const netProfitCurrent = grossGain - taxCurrent
    const effectiveTaxRateCurrent = grossGain > 0 ? (taxCurrent / grossGain) * 100 : 0

    const inflatedCostBase = costBase * Math.pow(1 + i, year)
    const realGain = Math.max(0, finalValue - inflatedCostBase)
    const taxProposed = realGain * t
    const netProfitProposed = grossGain - taxProposed
    const effectiveTaxRateProposed = grossGain > 0 ? (taxProposed / grossGain) * 100 : 0

    // Total proceeds (what you walk away with after tax)
    const proceedsCurrent = Math.round(costBase + netProfitCurrent)
    const proceedsProposed = Math.round(costBase + netProfitProposed)
    const inflationFloor = Math.round(inflatedCostBase) // purchasing power breakeven

    return {
      year,
      proceedsCurrent,
      proceedsProposed,
      inflationFloor,
      taxCurrent: Math.round(taxCurrent),
      taxProposed: Math.round(taxProposed),
      effectiveTaxRateCurrent: parseFloat(effectiveTaxRateCurrent.toFixed(2)),
      effectiveTaxRateProposed: parseFloat(effectiveTaxRateProposed.toFixed(2)),
    }
  })
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string
  value: number
  color: string
}

function CustomTooltip({
  active,
  payload,
  label,
  isCurrency = true,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  isCurrency?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">Year {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-medium">
            {isCurrency ? fmt.format(entry.value) : pct(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CGTComparison() {
  const [costBase, setCostBase] = useState(500_000)
  const [growthRate, setGrowthRate] = useState(5)
  const [inflationRate, setInflationRate] = useState(2.7)
  const [marginalTaxRate, setMarginalTaxRate] = useState(47)
  const [maxYears, setMaxYears] = useState(15)
  const [customTaxRate, setCustomTaxRate] = useState(false)
  const [customTaxValue, setCustomTaxValue] = useState(47)

  const effectiveTaxRate = customTaxRate ? customTaxValue : marginalTaxRate

  const data = useMemo(
    () => calculateData(costBase, growthRate, inflationRate, effectiveTaxRate, maxYears),
    [costBase, growthRate, inflationRate, effectiveTaxRate, maxYears]
  )

  const proceedsChartData = data.map((d) => ({
    year: d.year,
    'Current (50% discount)': d.proceedsCurrent,
    'Proposed (indexation)': d.proceedsProposed,
    'Inflation': d.inflationFloor,
  }))

  const taxPaidChartData = data.map((d) => ({
    year: d.year,
    'Current (50% discount)': d.taxCurrent,
    'Proposed (indexation)': d.taxProposed,
  }))

  const taxRateChartData = data.map((d) => ({
    year: d.year,
    'Current (50% discount)': d.effectiveTaxRateCurrent,
    'Proposed (indexation)': d.effectiveTaxRateProposed,
  }))

  // Find the year where the two systems cross (taxCurrent - taxProposed changes sign)
  const breakEvenYear = useMemo(() => {
    for (let idx = 1; idx < data.length; idx++) {
      const prev = data[idx - 1]
      const curr = data[idx]
      const prevDiff = prev.taxCurrent - prev.taxProposed
      const currDiff = curr.taxCurrent - curr.taxProposed
      if (prevDiff * currDiff < 0) return curr.year
    }
    return null
  }, [data])

  const showBreakEven =
    breakEvenYear !== null &&
    breakEvenYear > data[0].year &&
    breakEvenYear < data[data.length - 1].year

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="px-5 pt-4 pb-2 flex-none">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-bold text-gray-900">Australian CGT Reform Modeller</h1>
          <p className="text-sm text-gray-500">
            50% discount vs. inflation indexation — May 2026 budget proposal
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <Badge variant="default">Current: 50% discount on gains</Badge>
          <Badge variant="secondary">Proposed: Tax only real (inflation-adjusted) gains</Badge>
        </div>
      </div>

      {/* Main content: controls left, charts right */}
      <div className="flex flex-1 gap-4 px-5 pb-4 min-h-0">

        {/* Controls panel */}
        <Card className="w-72 flex-none flex flex-col">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm">Scenario Inputs</CardTitle>
            <CardDescription className="text-xs">Adjust to model your scenario</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4 overflow-y-auto flex-1">

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Purchase Price</Label>
                <span className="text-xs font-semibold text-blue-600">{fmt.format(costBase)}</span>
              </div>
              <Slider min={50_000} max={5_000_000} step={50_000} value={costBase} onValueChange={setCostBase} />
              <div className="flex justify-between text-xs text-gray-400">
                <span>$50k</span><span>$5M</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Asset Growth Rate</Label>
                <span className="text-xs font-semibold text-blue-600">{growthRate}%</span>
              </div>
              <Slider min={1} max={20} step={0.1} value={growthRate} onValueChange={setGrowthRate} />
              <div className="flex justify-between text-xs text-gray-400">
                <span>1%</span><span>20%</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Inflation Rate (CPI)</Label>
                <span className="text-xs font-semibold text-orange-600">{inflationRate}%</span>
              </div>
              <Slider min={0.5} max={10} step={0.1} value={inflationRate} onValueChange={setInflationRate} />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0.5%</span><span>10%</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Marginal Tax Rate</Label>
                <span className="text-xs font-semibold text-blue-600">{effectiveTaxRate}%</span>
              </div>
              {!customTaxRate ? (
                <select
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={marginalTaxRate}
                  onChange={(e) => setMarginalTaxRate(Number(e.target.value))}
                >
                  {TAX_BRACKETS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <Slider min={0} max={50} step={0.5} value={customTaxValue} onValueChange={setCustomTaxValue} />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0%</span><span>50%</span>
                  </div>
                </div>
              )}
              <button
                onClick={() => setCustomTaxRate(!customTaxRate)}
                className="text-xs text-blue-500 hover:underline"
              >
                {customTaxRate ? '← Use tax bracket presets' : 'Enter custom rate →'}
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-xs">Time Horizon</Label>
                <span className="text-xs font-semibold text-blue-600">{maxYears} years</span>
              </div>
              <Slider min={5} max={40} step={1} value={maxYears} onValueChange={setMaxYears} />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5 yrs</span><span>40 yrs</span>
              </div>
            </div>

            <div className="pt-2 border-t text-xs text-gray-400 space-y-1 leading-relaxed">
              <p className="font-medium text-gray-500">Notes</p>
              <p>Current system: 50% of gain is excluded from tax for assets held ≥ 12 months.</p>
              <p>Proposed: cost base indexed by CPI annually; only the real gain is taxed.</p>
              <p>Figures are nominal. Based on rumours and speculation and not formally announced.</p>
              <p>Vibe-coded. Run your own numbers.</p>
            </div>

          </CardContent>
        </Card>

        {/* Charts panel — 2×2 grid */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-w-0 min-h-0">

          <Card className="flex flex-col min-h-0">
            <CardHeader className="pb-2 pt-3 px-4 flex-none">
              <CardTitle className="text-sm">After-tax Proceeds</CardTitle>
              <CardDescription className="text-xs">Total in hand after CGT</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={proceedsChartData} margin={{ top: 5, right: 15, left: 5, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" label={{ value: 'Years held', position: 'insideBottom', offset: -8, fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Current (50% discount)" stroke={COLORS.current} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Proposed (indexation)" stroke={COLORS.proposed} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Inflation" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                  {showBreakEven && <ReferenceLine x={breakEvenYear!} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Yr ${breakEvenYear}: equal`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="flex flex-col min-h-0">
            <CardHeader className="pb-2 pt-3 px-4 flex-none">
              <CardTitle className="text-sm">Tax Paid</CardTitle>
              <CardDescription className="text-xs">Total CGT payable on sale</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={taxPaidChartData} margin={{ top: 5, right: 15, left: 5, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" label={{ value: 'Years held', position: 'insideBottom', offset: -8, fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Current (50% discount)" stroke={COLORS.current} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Proposed (indexation)" stroke={COLORS.proposed} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  {showBreakEven && <ReferenceLine x={breakEvenYear!} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Yr ${breakEvenYear}: equal`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="flex flex-col min-h-0">
            <CardHeader className="pb-2 pt-3 px-4 flex-none">
              <CardTitle className="text-sm">Effective Tax Rate</CardTitle>
              <CardDescription className="text-xs">CGT as a % of gross capital gain</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={taxRateChartData} margin={{ top: 5, right: 15, left: 5, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" label={{ value: 'Years held', position: 'insideBottom', offset: -8, fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} width={36} />
                  <Tooltip content={<CustomTooltip isCurrency={false} />} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Current (50% discount)" stroke={COLORS.current} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Proposed (indexation)" stroke={COLORS.proposed} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  {showBreakEven && <ReferenceLine x={breakEvenYear!} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Yr ${breakEvenYear}: equal`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="flex flex-col min-h-0">
            <CardHeader className="pb-2 pt-3 px-4 flex-none">
              <CardTitle className="text-sm">After-tax Profit</CardTitle>
              <CardDescription className="text-xs">Net gain after CGT (proceeds minus cost base)</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.map((d) => ({
                    year: d.year,
                    'Current (50% discount)': d.proceedsCurrent - costBase,
                    'Proposed (indexation)': d.proceedsProposed - costBase,
                  }))}
                  margin={{ top: 5, right: 15, left: 5, bottom: 15 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" label={{ value: 'Years held', position: 'insideBottom', offset: -8, fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Current (50% discount)" stroke={COLORS.current} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Proposed (indexation)" stroke={COLORS.proposed} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  {showBreakEven && <ReferenceLine x={breakEvenYear!} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Yr ${breakEvenYear}: equal`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
