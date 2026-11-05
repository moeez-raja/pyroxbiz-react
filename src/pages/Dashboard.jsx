import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Menu,
  PackagePlus,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'
import EmptyState from '@/components/dashboard/EmptyState'
import MetricCard from '@/components/dashboard/MetricCard'
import { isFirebaseConfigured } from '@/lib/firebase-config'
import { useDashboardData } from '@/hooks/useDashboardData'
import TransactionsModule from '@/pages/TransactionsModule'
import DirectoryModule from '@/pages/DirectoryModule'
import FinanceModule from '@/pages/FinanceModule'
import SettingsModule from '@/pages/SettingsModule'
import HelpModule from '@/pages/HelpModule'
import AdminModule from '@/pages/AdminModule'

const chartRanges = ['7 days', '30 days', '12 months']
const transactionFilters = ['All', 'Sales', 'Purchases']
const formatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function recordDate(record, candidates = ['createdAt', 'date', 'timestamp']) {
  for (const key of candidates) {
    const date = toDate(record[key])
    if (date) return date
  }
  return null
}

function amountOf(record) {
  return Number(record.grandTotal) || Number(record.amount) || 0
}

function formatCurrency(value) {
  return formatter.format(Number(value) || 0)
}

function formatTime(value) {
  const date = toDate(value)
  if (!date) return 'Date unavailable'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getInitials(value) {
  return String(value || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function isLowStock(product) {
  const stock = Number(product.stock) || 0
  const minimum = Number(product.reorderLevel ?? product.minStock ?? product.minimumStock) || 0
  return stock <= minimum
}

function PanelHeading({ eyebrow, title, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function buildChartData(sales, purchases, range) {
  const activePurchases = purchases.filter((purchase) => purchase.status !== 'Cancelled')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let buckets

  if (range === '12 months') {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - 11 + index, 1)
      return {
        date,
        label: date.toLocaleDateString('en', { month: 'short' }),
        sales: 0,
        purchases: 0,
      }
    })

    for (const [records, key] of [[sales, 'sales'], [activePurchases, 'purchases']]) {
      records.forEach((record) => {
        const date = recordDate(record)
        if (!date) return
        const index = (date.getFullYear() - buckets[0].date.getFullYear()) * 12
          + date.getMonth() - buckets[0].date.getMonth()
        if (index >= 0 && index < buckets.length) buckets[index][key] += amountOf(record)
      })
    }
    return buckets
  }

  const count = range === '7 days' ? 7 : 10
  const intervalDays = range === '7 days' ? 1 : 3
  buckets = Array.from({ length: count }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (count * intervalDays - 1) + index * intervalDays)
    return {
      date,
      label: range === '7 days'
        ? date.toLocaleDateString('en', { weekday: 'short' })
        : date.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      sales: 0,
      purchases: 0,
    }
  })

  const firstDay = buckets[0].date.getTime()
  const dayInMs = 24 * 60 * 60 * 1000
  for (const [records, key] of [[sales, 'sales'], [activePurchases, 'purchases']]) {
    records.forEach((record) => {
      const date = recordDate(record)
      if (!date) return
      const recordDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const offset = Math.floor((recordDay - firstDay) / dayInMs)
      const index = range === '7 days' ? offset : Math.floor(offset / intervalDays)
      if (index >= 0 && index < buckets.length) buckets[index][key] += amountOf(record)
    })
  }

  return buckets
}

function SalesChart({ sales, purchases, pending, error }) {
  const [range, setRange] = useState('30 days')
  const chartData = useMemo(() => buildChartData(sales, purchases, range), [sales, purchases, range])
  const hasData = chartData.some((item) => item.sales > 0 || item.purchases > 0)
  const chartPoints = chartData.map((item, index) => {
    const max = Math.max(...chartData.flatMap((point) => [point.sales, point.purchases]), 1)
    return {
      ...item,
      x: 48 + (index * 624) / Math.max(chartData.length - 1, 1),
      salesY: 174 - (item.sales / max) * 142,
      purchasesY: 174 - (item.purchases / max) * 142,
    }
  })
  const salesPath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.salesY}`).join(' ')
  const purchasesPath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.purchasesY}`).join(' ')
  const areaPath = `${salesPath} L 672 184 L 48 184 Z`
  const periodSales = chartData.reduce((total, item) => total + item.sales, 0)
  const periodPurchases = chartData.reduce((total, item) => total + item.purchases, 0)

  return (
    <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <PanelHeading
        eyebrow="Performance"
        title="Sales & purchases"
        action={
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Chart date range">
            {chartRanges.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={range === item}
                onClick={() => setRange(item)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  range === item
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <EmptyState
          icon={ChartNoAxesCombined}
          title="Chart data unavailable"
          description="Check the Firestore read permissions for sales and purchases."
          className="min-h-[310px]"
        />
      ) : pending ? (
        <EmptyState icon={ChartNoAxesCombined} title="Loading sales" description="Fetching your latest sales data." className="min-h-[310px]" />
      ) : hasData ? (
        <div className="px-4 pb-4 pt-5 sm:px-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(periodSales)}</p>
              <span className="text-xs text-slate-500">sales in the selected period</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(periodPurchases)}</p>
              <span className="text-[11px] text-slate-500">purchases</span>
            </div>
          </div>
          <div className="w-full overflow-hidden">
            <svg
              viewBox="0 0 720 220"
              className="h-[210px] w-full overflow-visible"
              role="img"
              aria-label={`Sales and purchase comparison chart for the last ${range}`}
            >
              <defs>
                <linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {[32, 82, 132, 184].map((y) => (
                <line key={y} x1="48" x2="672" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
              ))}
              <path d={areaPath} fill="url(#sales-area-fill)" />
              <path d={salesPath} fill="none" stroke="#059669" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              <path d={purchasesPath} fill="none" stroke="#94a3b8" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
              {chartPoints.map((point) => (
                <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.salesY} r="3.5" fill="#fff" stroke="#059669" strokeWidth="2" />
              ))}
              {chartPoints.map((point) => (
                <circle key={`purchase-${point.label}-${point.x}`} cx={point.x} cy={point.purchasesY} r="2.5" fill="#fff" stroke="#94a3b8" strokeWidth="1.5" />
              ))}
              {chartPoints.map((point, index) => (
                (index % (range === '7 days' ? 1 : 2) === 0 || index === chartPoints.length - 1) && (
                  <text key={`label-${point.label}-${point.x}`} x={point.x} y="210" fill="#94a3b8" fontSize="10" textAnchor="middle">
                    {point.label}
                  </text>
                )
              ))}
            </svg>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ChartNoAxesCombined}
          title="No transactions in this period"
          description={`Actual sales and purchases for the last ${range} will be charted here.`}
          className="min-h-[310px]"
        />
      )}
      <div className="flex items-center justify-center gap-5 border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-600" />
          Sales
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-slate-400" />
          Purchases
        </span>
      </div>
    </section>
  )
}

function getTransactionItems(sales, purchases) {
  const saleItems = sales.map((sale) => ({
    id: `sale-${sale.id}`,
    type: 'Sales',
    name: sale.customerName || sale.customer || 'Walk-in customer',
    reference: sale.saleNumber || sale.invoiceNumber || sale.invoice || sale.id,
    amount: amountOf(sale),
    status: sale.paymentStatus || sale.saleStatus || 'Unpaid',
    date: recordDate(sale),
  }))
  const purchaseItems = purchases.map((purchase) => ({
    id: `purchase-${purchase.id}`,
    type: 'Purchases',
    name: purchase.supplierName || purchase.supplier || 'Supplier',
    reference: purchase.purchaseNumber || purchase.id,
    amount: amountOf(purchase),
    status: purchase.paymentStatus || purchase.status || 'Unpaid',
    date: recordDate(purchase),
  }))
  return [...saleItems, ...purchaseItems].sort(
    (first, second) => (second.date?.getTime() || 0) - (first.date?.getTime() || 0),
  )
}

function RecentTransactions({ sales, purchases, pending, errors }) {
  const [filter, setFilter] = useState('All')
  const transactions = useMemo(
    () => getTransactionItems(sales, purchases),
    [sales, purchases],
  )
  const visibleTransactions = filter === 'All'
    ? transactions
    : transactions.filter((item) => item.type === filter)
  const hasError = errors.sales || errors.purchases
  const isPending = pending.sales || pending.purchases

  return (
    <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <PanelHeading
        eyebrow="Latest activity"
        title="Recent transactions"
        action={
          <div className="flex items-center gap-1" role="tablist" aria-label="Transaction type">
            {transactionFilters.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                onClick={() => setFilter(item)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === item
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        }
      />
      {hasError ? (
        <EmptyState icon={ShoppingBag} title="Transaction data unavailable" description="Check the Firestore read permissions for sales and purchases." className="min-h-[236px]" />
      ) : isPending ? (
        <EmptyState icon={ShoppingBag} title="Loading transactions" description="Fetching your latest sales and purchases." className="min-h-[236px]" />
      ) : visibleTransactions.length ? (
        <ul className="divide-y divide-slate-100">
          {visibleTransactions.slice(0, 8).map((transaction) => {
            const isSale = transaction.type === 'Sales'
            return (
              <li key={transaction.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isSale ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  {getInitials(transaction.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{transaction.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {isSale ? 'Sale' : 'Purchase'} {transaction.reference} · {formatTime(transaction.date)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[13px] font-semibold ${isSale ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {isSale ? '+' : '−'}{formatCurrency(transaction.amount)}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">{transaction.status}</span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon={ShoppingBag}
          title={filter === 'All' ? 'No transactions yet' : `No ${filter.toLowerCase()} yet`}
          description="Sales and purchases will appear here as they are recorded."
          className="min-h-[236px]"
        />
      )}
    </section>
  )
}

function getActivityItems({ sales, purchases, expenses, products }) {
  const items = [
    ...sales.map((sale) => ({
      id: `sale-${sale.id}`,
      title: `Sale to ${sale.customerName || sale.customer || 'Walk-in customer'}`,
      detail: formatCurrency(amountOf(sale)),
      date: recordDate(sale),
      icon: ShoppingBag,
      color: 'bg-emerald-50 text-emerald-700',
    })),
    ...purchases.map((purchase) => ({
      id: `purchase-${purchase.id}`,
      title: `Purchase from ${purchase.supplierName || purchase.supplier || 'supplier'}`,
      detail: formatCurrency(amountOf(purchase)),
      date: recordDate(purchase),
      icon: ShoppingCart,
      color: 'bg-amber-50 text-amber-700',
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      title: `Expense: ${expense.category || expense.description || 'General'}`,
      detail: formatCurrency(Number(expense.amount) || Number(expense.total) || 0),
      date: recordDate(expense, ['date', 'createdAt']),
      icon: Wallet,
      color: 'bg-slate-100 text-slate-600',
    })),
    ...products.filter(isLowStock).map((product) => ({
      id: `stock-${product.id}`,
      title: `Low stock: ${product.name || 'Product'}`,
      detail: `${Number(product.stock) || 0} remaining`,
      date: recordDate(product, ['updatedAt', 'createdAt']),
      icon: Boxes,
      color: 'bg-rose-50 text-rose-700',
    })),
  ]

  return items
    .sort((first, second) => (second.date?.getTime() || 0) - (first.date?.getTime() || 0))
    .slice(0, 6)
}

function ActivityOverview({ data, pending, errors }) {
  const items = useMemo(() => getActivityItems(data), [data])
  const error = Object.values(errors).some(Boolean)
  const loading = Object.values(pending).some(Boolean)

  return (
    <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <PanelHeading
        eyebrow="Business pulse"
        title="Activity overview"
        action={<Clock3 className="size-4 text-slate-400" aria-hidden="true" />}
      />
      {error ? (
        <EmptyState icon={Clock3} title="Activity data unavailable" description="One or more activity collections could not be read." className="min-h-[220px]" />
      ) : loading ? (
        <EmptyState icon={Clock3} title="Loading activity" description="Collecting recent business updates." className="min-h-[220px]" />
      ) : items.length ? (
        <ul className="space-y-4 p-5 sm:p-6">
          {items.map(({ id, title, detail, date, icon: Icon, color }) => (
            <li key={id} className="flex items-start gap-3">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-800">{title}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{detail} · {formatTime(date)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Clock3} title="Nothing to report yet" description="Sales, purchases, and inventory updates will be summarized here." className="min-h-[220px]" />
      )}
    </section>
  )
}

function InventoryOverview({ products, pending, error }) {
  const lowStock = products.filter(isLowStock)
  return (
    <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <PanelHeading eyebrow="Inventory" title="Stock overview" action={<Boxes className="size-4 text-slate-400" aria-hidden="true" />} />
      {error ? (
        <EmptyState icon={Boxes} title="Inventory unavailable" description="Check the Firestore read permissions for products." className="min-h-[180px]" />
      ) : pending ? (
        <EmptyState icon={Boxes} title="Loading inventory" description="Fetching product stock levels." className="min-h-[180px]" />
      ) : lowStock.length ? (
        <ul className="divide-y divide-slate-100">
          {lowStock.slice(0, 4).map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="truncate text-xs font-medium text-slate-800">{product.name || 'Unnamed product'}</span>
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-800">
                {Number(product.stock) || 0} left
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Boxes}
          title={products.length ? 'All stocked up' : 'No products yet'}
          description={products.length ? 'No products are currently at or below their reorder level.' : 'Products will appear here when added to your inventory.'}
          className="min-h-[180px]"
        />
      )}
    </section>
  )
}

const quickActions = [
  { label: 'Create a sale', description: 'Record a customer sale', icon: ShoppingCart, target: 'Sales' },
  { label: 'Add a product', description: 'Update your catalog', icon: PackagePlus, target: 'Products' },
  { label: 'Record a purchase', description: 'Log supplier purchases', icon: ArrowDownLeft, target: 'Purchases' },
  { label: 'Add an expense', description: 'Track business spending', icon: Wallet, target: 'Expenses' },
]

function QuickActions({ onNavigate }) {
  return (
    <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <PanelHeading eyebrow="Shortcuts" title="Quick actions" />
      <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
        {quickActions.map(({ label, description, icon: Icon, target }) => {
          return (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(target)}
            title={`Open ${target.toLowerCase()}`}
            className="group flex min-h-[68px] items-center gap-3 rounded-lg border border-slate-100 px-3 text-left transition-colors hover:border-emerald-200 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon className="size-[17px]" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-slate-800">{label}</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{description}</span>
            </span>
            <ArrowRight className="size-4 text-slate-300" />
          </button>
          )
        })}
      </div>
      <p className="px-5 pb-4 text-[11px] text-slate-400">
        Each shortcut opens its corresponding business module.
      </p>
    </section>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm text-slate-600" role="status">
        <RefreshCw className="size-4 animate-spin text-emerald-700" />
        Connecting to Pyrox Biz…
      </div>
    </div>
  )
}

function SignInScreen({ authError, onSignIn }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-700 text-sm font-bold text-white">
          PB
        </div>
        <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate-900">Sign in to Pyrox Biz</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">
          Sign in with the Google account connected to your business data.
        </p>
        {authError && (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {authError}
          </p>
        )}
        <Button className="mt-6 h-11 w-full" onClick={onSignIn} disabled={!isFirebaseConfigured}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.75 3.27-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.15a11 11 0 0 0 0 9.9l3.69-2.84Z" />
            <path fill="#EA4335" d="M12 4.36c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0A11 11 0 0 0 2.15 7.05l3.69 2.84C6.71 7.29 9.14 4.36 12 4.36Z" />
          </svg>
          Continue with Google
        </Button>
      </section>
    </main>
  )
}

function MembershipScreen({ status, authError, onRetry, onLogOut }) {
  const copy = {
    pending: ['Membership pending', 'Your account is awaiting approval. The dashboard will unlock after your membership is approved.'],
    payment_submitted: ['Payment under review', 'Your payment has been submitted. The dashboard will unlock after it is reviewed.'],
    rejected: ['Membership needs attention', 'Your membership is not approved. Contact your administrator for help.'],
    expired: ['Membership expired', 'Your membership has expired. Contact your administrator to restore access.'],
    unknown: ['Membership status unavailable', 'We could not verify your membership. Check Firestore access and try again.'],
  }
  const [title, description] = copy[status] || copy.pending

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <CreditCard className="size-5" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {authError && <p className="mt-4 text-left text-sm text-rose-700" role="alert">{authError}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onRetry}>Refresh status</Button>
          <Button variant="ghost" onClick={onLogOut}>Sign out</Button>
        </div>
      </section>
    </main>
  )
}

function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [activePage, setActivePage] = useState('Dashboard')
  const {
    user,
    authLoading,
    authError,
    dashboard,
    signIn,
    logOut,
    retry,
  } = useDashboardData()
  const { data, pending, errors, membershipStatus } = dashboard

  if (authLoading) return <LoadingScreen />
  if (!user) return <SignInScreen authError={authError} onSignIn={signIn} />
  if (membershipStatus === 'loading') return <LoadingScreen />
  if (membershipStatus !== 'approved') {
    return (
      <MembershipScreen
        status={membershipStatus}
        authError={errors.membership}
        onRetry={retry}
        onLogOut={logOut}
      />
    )
  }

  const currentDate = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
  const salesError = errors.sales
  const purchasesError = errors.purchases
  const totalRevenue = data.sales.reduce((total, sale) => total + amountOf(sale), 0)
  const totalPurchases = data.purchases
    .filter((purchase) => purchase.status !== 'Cancelled')
    .reduce((total, purchase) => total + amountOf(purchase), 0)
  const outstanding = data.sales.reduce((total, sale) => total + Math.max(0, Number(sale.balance) || 0), 0)
  const lowStock = data.products.filter(isLowStock)
  const collectionError = Object.values(errors).find(Boolean)
  const dataSyncing = Object.values(pending).some(Boolean)
  const dataStatus = collectionError
    ? 'Data needs attention'
    : dataSyncing
      ? 'Syncing business data'
      : 'Live business data'
  const fullName = user.displayName || user.email || 'Account'
  const initials = getInitials(user.displayName || user.email || 'PB')
  const notifications = [
    ...(lowStock.length ? [`${lowStock.length} products are at or below their reorder level.`] : []),
    ...(outstanding > 0 ? [`Outstanding customer balances total ${formatCurrency(outstanding)}.`] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1720px]">
        <DashboardSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentPage={activePage}
          onNavigate={setActivePage}
        />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 shadow-[0_8px_24px_-22px_rgba(15,23,42,0.35)] backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-slate-600 md:hidden"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="size-5" />
              </Button>
              <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
                <span>Workspace</span><span aria-hidden="true">/</span>
                <span className="font-medium text-slate-700">{activePage}</span>
              </div>
              <span className="text-sm font-semibold text-slate-800 sm:hidden">{activePage}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
                <CalendarDays className="size-4 text-slate-400" /><time>{currentDate}</time>
              </div>
              <span className="hidden h-6 border-l border-slate-200 md:block" />
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-9 text-slate-500"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => setNotificationsOpen((open) => !open)}
                >
                  <Bell className="size-[18px]" />
                  {notifications.length > 0 && (
                    <span className="absolute right-1 top-1 size-2 rounded-full bg-emerald-600" />
                  )}
                </Button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                    <p className="text-sm font-semibold text-slate-900">Business alerts</p>
                    {notifications.length ? (
                      <ul className="mt-3 space-y-3">
                        {notifications.map((notification) => (
                          <li key={notification} className="text-xs leading-5 text-slate-600">{notification}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">No current alerts.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden text-right sm:block">
                <p className="max-w-40 truncate text-xs font-medium text-slate-700">{fullName}</p>
                <p className="text-[10px] text-slate-400">Business account</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full border border-emerald-100 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                aria-label={`Sign out ${fullName}`}
                title="Sign out"
                onClick={logOut}
              >
                {initials}
              </Button>
            </div>
          </header>

          {activePage === 'Dashboard' ? (
          <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <section className="page-hero flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800"><span className="size-2 rounded-full bg-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.55)]" />{getGreeting()}, {user.displayName?.split(' ')[0] || 'there'}</p>
                <h1 className="mt-2 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Your business, in motion.</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  A live view of performance, cash flow, and what needs your attention.
                </p>
              </div>
              <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                collectionError
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : dataSyncing
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}>
                <span className={`size-1.5 rounded-full ${
                  collectionError ? 'bg-rose-500' : dataSyncing ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                }`} />
                {dataStatus}
              </div>
            </section>

            {collectionError && (
              <section className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
                <p className="text-sm text-rose-800">{collectionError}</p>
                <Button variant="outline" size="sm" onClick={retry}>
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </section>
            )}

            <section aria-label="Business metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total revenue"
                icon={CircleDollarSign}
                value={salesError ? 'Unavailable' : formatCurrency(totalRevenue)}
                description="Lifetime sales value"
                loading={pending.sales}
                error={Boolean(salesError)}
              />
              <MetricCard
                label="Total sales"
                icon={ShoppingBag}
                value={salesError ? 'Unavailable' : data.sales.length.toLocaleString()}
                description="Recorded sale transactions"
                loading={pending.sales}
                error={Boolean(salesError)}
              />
              <MetricCard
                label="Total purchases"
                icon={ShoppingCart}
                value={purchasesError ? 'Unavailable' : formatCurrency(totalPurchases)}
                description="Excludes cancelled purchases"
                loading={pending.purchases}
                error={Boolean(purchasesError)}
              />
              <MetricCard
                label="Outstanding payments"
                icon={CreditCard}
                value={salesError ? 'Unavailable' : formatCurrency(outstanding)}
                description="Sum of recorded sale balances"
                loading={pending.sales}
                error={Boolean(salesError)}
              />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
              <SalesChart
                sales={data.sales}
                purchases={data.purchases}
                pending={pending.sales || pending.purchases}
                error={Boolean(salesError || purchasesError)}
              />
              <QuickActions onNavigate={setActivePage} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
              <RecentTransactions
                sales={data.sales}
                purchases={data.purchases}
                pending={pending}
                errors={errors}
              />
              <div className="space-y-5">
                <ActivityOverview data={data} pending={pending} errors={errors} />
                <InventoryOverview
                  products={data.products}
                  pending={pending.products}
                  error={Boolean(errors.products)}
                />
              </div>
            </div>

            <section className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-5 py-4 sm:flex-row sm:items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
                <ArrowUpRight className="size-[18px]" />
              </span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-slate-800">Dashboard connected</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Dashboard figures update from your business records. Sales and purchase forms create new transactions.
                </p>
              </div>
            </section>
          </main>
          ) : ['Sales', 'Purchases'].includes(activePage) ? (
            <TransactionsModule
              kind={activePage}
              user={user}
              data={data}
              pending={pending}
              errors={errors}
              onRetry={retry}
            />
          ) : ['Invoices', 'Expenses', 'FlowAI'].includes(activePage) ? (
            <FinanceModule
              key={activePage}
              kind={activePage}
              user={user}
              data={data}
              pending={pending}
              errors={errors}
              onRetry={retry}
            />
          ) : activePage === 'Settings' ? (
            <SettingsModule user={user} onLogOut={logOut} />
          ) : activePage === 'Help & support' ? (
            <HelpModule />
          ) : activePage === 'Admin' ? (
            <AdminModule user={user} onLogOut={logOut} />
          ) : (
            <DirectoryModule
              key={activePage}
              kind={activePage}
              user={user}
              data={data}
              pending={pending}
              errors={errors}
              onRetry={retry}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
