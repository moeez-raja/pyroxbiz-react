import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import MetricCard from '@/components/dashboard/MetricCard'
import { createPurchase, createSale } from '@/lib/transaction-writes'

const moneyFormat = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})
const pageSize = 10
const blankLine = () => ({
  productId: '',
  quantity: 1,
  unitPrice: 0,
  discountRate: 0,
  taxRate: 0,
  batchNumber: '',
  expiryDate: '',
  manufacturingDate: '',
})

function money(value) {
  return moneyFormat.format(Number(value) || 0)
}

function timestamp(record) {
  const date = record.createdAt || record.date
  if (date && typeof date.toDate === 'function') return date.toDate().getTime()
  const parsed = new Date(date || 0).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function lineTotal(line) {
  const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0)
  const discounted = gross - gross * Number(line.discountRate || 0) / 100
  return discounted + discounted * Number(line.taxRate || 0) / 100
}

function getTotals(lines) {
  return lines.reduce((totals, line) => {
    const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0)
    const discount = gross * Number(line.discountRate || 0) / 100
    const tax = (gross - discount) * Number(line.taxRate || 0) / 100
    totals.subtotal += gross
    totals.discount += discount
    totals.tax += tax
    totals.total += gross - discount + tax
    return totals
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 })
}

function recordAmount(record) {
  return Number(record.grandTotal) || Number(record.amount) || 0
}

function getReference(record, kind) {
  return kind === 'Sales'
    ? record.saleNumber || record.invoiceNumber || record.id
    : record.purchaseNumber || record.id
}

function StatusBadge({ value }) {
  const status = String(value || 'Unpaid')
  const color = status === 'Paid' || status === 'Completed'
    ? 'bg-emerald-50 text-emerald-800'
    : status === 'Partially Paid'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${color}`}>{status}</span>
}

function TransactionForm({ kind, data, user, onClose, onCreated }) {
  const isSale = kind === 'Sales'
  const counterparties = isSale ? data.customers : data.suppliers
  const [counterpartyId, setCounterpartyId] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState([blankLine()])
  const [amountPaid, setAmountPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const totals = getTotals(lines)
  const selectedCounterparty = counterparties.find((item) => item.id === counterpartyId)

  function updateLine(index, field, value) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line
      if (field !== 'productId') return { ...line, [field]: value }
      const product = data.products.find((item) => item.id === value)
      const suggestedPrice = isSale
        ? product?.sellingPrice ?? product?.salePrice ?? product?.price ?? 0
        : product?.purchasePrice ?? product?.costPrice ?? product?.price ?? 0
      return { ...line, productId: value, unitPrice: Number(suggestedPrice) || 0 }
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!selectedCounterparty) {
      setError(`Select a ${isSale ? 'customer' : 'supplier'}.`)
      return
    }

    const preparedItems = lines.map((line) => ({
      ...line,
      product: data.products.find((product) => product.id === line.productId),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountRate: Number(line.discountRate) || 0,
      taxRate: Number(line.taxRate) || 0,
    }))
    const invalidLine = preparedItems.find((line) => (
      !line.product
      || !Number.isInteger(line.quantity)
      || line.quantity < 1
      || line.unitPrice < 0
      || line.discountRate < 0
      || line.discountRate > 100
      || line.taxRate < 0
    ))
    if (invalidLine) {
      setError('Choose a product and enter a whole quantity, non-negative price, and valid rates for every line.')
      return
    }
    if (new Set(preparedItems.map((line) => line.product.id)).size !== preparedItems.length) {
      setError('Add each product once; combine its quantity on the same line.')
      return
    }
    if (isSale && preparedItems.some((line) => Number(line.product.stock) < line.quantity)) {
      setError('One or more products do not have enough stock.')
      return
    }

    setSaving(true)
    try {
      const create = isSale ? createSale : createPurchase
      const id = await create({
        uid: user.uid,
        [isSale ? 'customer' : 'supplier']: selectedCounterparty,
        items: preparedItems,
        amountPaid: Number(amountPaid) || 0,
        paymentMethod,
        reference,
      })
      onCreated(id)
    } catch (saveError) {
      console.error(`Create ${kind.toLowerCase()} failed:`, saveError)
      setError(saveError.message || `Could not create ${kind.toLowerCase().slice(0, -1)}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-form-title"
        className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">
              {isSale ? 'Sales' : 'Purchases'}
            </p>
            <h2 id="transaction-form-title" className="mt-1 text-lg font-semibold text-slate-900">
              {isSale ? 'Create sale' : 'Record purchase'}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-6 p-5 sm:p-6">
          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              {isSale ? 'Customer' : 'Supplier'} <span className="text-rose-600">*</span>
              <select required value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                <option value="">Select {isSale ? 'customer' : 'supplier'}</option>
                {counterparties.map((item) => (
                  <option key={item.id} value={item.id}>{item.name || item.displayName || item.id}</option>
                ))}
              </select>
              {!counterparties.length && <span className="font-normal text-amber-700">No {isSale ? 'customers' : 'suppliers'} are available for this account.</span>}
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              {isSale ? 'Payment method' : 'Purchase order / reference'}
              {isSale ? (
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                  {['Cash', 'Bank Transfer', 'Card', 'Other'].map((method) => <option key={method}>{method}</option>)}
                </select>
              ) : (
                <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional reference" className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
              )}
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Products</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, blankLine()])}>
                <Plus className="size-3.5" /> Add product
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => {
                const product = data.products.find((item) => item.id === line.productId)
                return (
                  <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1.5fr)_90px_120px_80px_80px_auto] sm:items-end">
                    <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                      Product
                      <select required value={line.productId} onChange={(event) => updateLine(index, 'productId', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-emerald-600">
                        <option value="">Select product</option>
                        {data.products.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name || item.id}{isSale ? ` · ${Number(item.stock) || 0} in stock` : ''}
                          </option>
                        ))}
                      </select>
                      {product?.sku && <span className="truncate font-normal">{product.sku}</span>}
                    </label>
                    <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                      Qty
                      <input type="number" min="1" step="1" required value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-600" />
                    </label>
                    <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                      Unit price
                      <input type="number" min="0" step="0.01" required value={line.unitPrice} onChange={(event) => updateLine(index, 'unitPrice', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-600" />
                    </label>
                    <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                      Discount %
                      <input type="number" min="0" max="100" step="0.01" value={line.discountRate} onChange={(event) => updateLine(index, 'discountRate', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-600" />
                    </label>
                    <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                      Tax %
                      <input type="number" min="0" step="0.01" value={line.taxRate} onChange={(event) => updateLine(index, 'taxRate', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-800 outline-none focus:border-emerald-600" />
                    </label>
                    <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                      <span className="text-[11px] text-slate-500 sm:hidden">Line total</span>
                      <span className="text-xs font-semibold text-slate-800">{money(lineTotal(line))}</span>
                      {lines.length > 1 && (
                        <button type="button" aria-label="Remove product line" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="ml-1 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700">
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    {!isSale && (
                      <div className="grid gap-3 sm:col-span-6 sm:grid-cols-3">
                        <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                          Batch number (optional)
                          <input value={line.batchNumber} onChange={(event) => updateLine(index, 'batchNumber', event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-emerald-600" />
                        </label>
                        <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                          Expiry date (optional)
                          <input type="date" value={line.expiryDate} onChange={(event) => updateLine(index, 'expiryDate', event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-emerald-600" />
                        </label>
                        <label className="grid gap-1 text-[11px] font-medium text-slate-500">
                          Manufacturing date (optional)
                          <input type="date" value={line.manufacturingDate} onChange={(event) => updateLine(index, 'manufacturingDate', event.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-emerald-600" />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {!data.products.length && <p className="text-xs text-amber-700">Add products before recording this transaction.</p>}
          </div>

          <div className="grid gap-5 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_260px]">
            <label className="grid h-fit gap-1.5 text-xs font-medium text-slate-600">
              Amount paid
              <input type="number" min="0" max={totals.total} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} placeholder="0.00" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600" />
              <span className="font-normal text-slate-400">Balance due: {money(Math.max(0, totals.total - (Number(amountPaid) || 0)))}</span>
            </label>
            {!isSale && (
              <label className="grid h-fit gap-1.5 text-xs font-medium text-slate-600">
                Payment method
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600">
                  {['Cash', 'Bank Transfer', 'Card', 'Other'].map((method) => <option key={method}>{method}</option>)}
                </select>
              </label>
            )}
            <div className="space-y-1 text-xs sm:col-start-2">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Discount</span><span>−{money(totals.discount)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(totals.tax)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900"><span>Total</span><span>{money(totals.total)}</span></div>
            </div>
          </div>

          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !counterparties.length || !data.products.length}>
              {saving ? 'Saving…' : isSale ? 'Complete sale' : 'Complete purchase'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function TransactionDetails({ kind, record, onClose }) {
  const isSale = kind === 'Sales'
  const lines = record.items || []
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="transaction-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">{kind} details</p>
            <h2 id="transaction-details-title" className="mt-1 text-lg font-semibold text-slate-900">{getReference(record, kind)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </header>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-slate-400">{isSale ? 'Customer' : 'Supplier'}</p><p className="mt-1 font-medium text-slate-800">{isSale ? record.customerName : record.supplierName}</p></div>
            <div><p className="text-slate-400">Date</p><p className="mt-1 font-medium text-slate-800">{new Date(record.createdAt || record.date || 0).toLocaleDateString()}</p></div>
            <div><p className="text-slate-400">Payment status</p><div className="mt-1"><StatusBadge value={record.paymentStatus} /></div></div>
            <div><p className="text-slate-400">Payment method</p><p className="mt-1 font-medium text-slate-800">{record.paymentMethod || '—'}</p></div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => (
                  <tr key={`${line.productId || line.sku || line.name}-${index}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-800">{line.productName || line.name || 'Product'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{line.quantity ?? line.qty ?? 0}</td>
                    <td className="px-3 py-2.5 text-right text-slate-800">{money(line.total ?? line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-xs space-y-2 border-t border-slate-100 pt-4 text-xs">
            <div className="flex justify-between text-slate-500"><span>Grand total</span><span>{money(record.grandTotal || record.amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Paid</span><span>{money(record.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold text-slate-900"><span>Balance</span><span>{money(record.balance)}</span></div>
          </div>
        </div>
      </section>
    </div>
  )
}

function TransactionsModule({ kind, user, data, pending, errors, onRetry }) {
  const isSale = kind === 'Sales'
  const records = isSale ? data.sales : data.purchases
  const resourceError = isSale ? errors.sales : errors.purchases
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [notice, setNotice] = useState(null)

  const filteredRecords = useMemo(() => records
    .filter((record) => {
      const searchText = isSale
        ? `${record.saleNumber || ''} ${record.customerName || ''} ${record.customerPhone || ''}`
        : `${record.purchaseNumber || ''} ${record.supplierName || ''} ${record.reference || ''}`
      if (search && !searchText.toLowerCase().includes(search.toLowerCase())) return false
      if (paymentFilter && record.paymentStatus !== paymentFilter) return false
      const created = new Date(timestamp(record)).toISOString().slice(0, 10)
      if (dateFrom && created < dateFrom) return false
      if (dateTo && created > dateTo) return false
      return true
    })
    .sort((a, b) => timestamp(b) - timestamp(a)), [records, search, paymentFilter, dateFrom, dateTo, isSale])
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const pageRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize)
  const financialRecords = isSale ? records : records.filter((record) => record.status !== 'Cancelled')
  const totalAmount = financialRecords.reduce((sum, record) => sum + recordAmount(record), 0)
  const amountPaid = financialRecords.reduce((sum, record) => sum + (Number(record.amountPaid) || 0), 0)
  const balance = financialRecords.reduce((sum, record) => sum + (Number(record.balance) || 0), 0)
  const filtersChanged = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-emerald-700">Workspace / {kind}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">{kind}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {isSale ? 'Track customer sales, collected payments, and outstanding balances.' : 'Track supplier purchases, inventory receipts, and payment balances.'}
            </p>
          </div>
          <Button onClick={() => { setNotice(null); setShowForm(true) }} disabled={pending.products || (isSale ? pending.customers : pending.suppliers)}>
            <Plus className="size-4" /> {isSale ? 'Create sale' : 'Record purchase'}
          </Button>
        </section>

        {notice && (
          <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${
            notice.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}>{notice.message}</p>
        )}

        {(errors.products || (isSale ? errors.customers : errors.suppliers)) && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Product or {isSale ? 'customer' : 'supplier'} records could not be loaded. Check Firestore access before creating transactions.
          </p>
        )}

        <section aria-label={`${kind} metrics`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={isSale ? 'Sales' : 'Purchases'} icon={isSale ? ArrowUpRight : ArrowDownLeft} value={records.length.toLocaleString()} description="All recorded transactions" loading={pending[isSale ? 'sales' : 'purchases']} error={Boolean(resourceError)} />
          <MetricCard label="Total value" icon={isSale ? ArrowUpRight : ArrowDownLeft} value={money(totalAmount)} description={isSale ? 'Gross from sales' : 'Excludes cancelled purchases'} loading={pending[isSale ? 'sales' : 'purchases']} error={Boolean(resourceError)} />
          <MetricCard label="Amount paid" icon={ArrowUpRight} value={money(amountPaid)} description="Collected / paid to date" loading={pending[isSale ? 'sales' : 'purchases']} error={Boolean(resourceError)} />
          <MetricCard label="Outstanding" icon={ArrowDownLeft} value={money(balance)} description="Recorded open balances" loading={pending[isSale ? 'sales' : 'purchases']} error={Boolean(resourceError)} />
        </section>

        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={filtersChanged(setSearch)} placeholder={`Search ${kind.toLowerCase()}…`} aria-label={`Search ${kind.toLowerCase()}`} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <select value={paymentFilter} onChange={filtersChanged(setPaymentFilter)} aria-label="Filter by payment status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-emerald-600">
              <option value="">All payment statuses</option>
              {['Paid', 'Partially Paid', 'Unpaid'].map((status) => <option key={status}>{status}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={filtersChanged(setDateFrom)} aria-label="Start date" className="h-10 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 outline-none focus:border-emerald-600" />
            <input type="date" value={dateTo} onChange={filtersChanged(setDateTo)} aria-label="End date" className="h-10 rounded-lg border border-slate-200 px-3 text-xs text-slate-700 outline-none focus:border-emerald-600" />
          </div>

          {resourceError ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-rose-800">Could not load {kind.toLowerCase()}.</p>
              <p className="mt-1 text-xs text-slate-500">{resourceError}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
            </div>
          ) : pending[isSale ? 'sales' : 'purchases'] ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading {kind.toLowerCase()}…</div>
          ) : pageRecords.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{isSale ? 'Sale #' : 'Purchase #'}</th>
                      <th className="px-5 py-3">{isSale ? 'Customer' : 'Supplier'}</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3">Total</th>
                      <th className="px-5 py-3">Paid</th>
                      <th className="px-5 py-3">Balance</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRecords.map((record) => {
                      const lineCount = (record.items || []).reduce((count, item) => count + (Number(item.quantity ?? item.qty) || 0), 0)
                      const created = record.createdAt || record.date
                      const date = created && typeof created.toDate === 'function' ? created.toDate() : new Date(created || 0)
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-slate-800">{getReference(record, kind)}</td>
                          <td className="max-w-48 truncate px-5 py-3.5 text-slate-700">{isSale ? record.customerName || 'Walk-in' : record.supplierName || 'Supplier'}</td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">{Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()}</td>
                          <td className="px-5 py-3.5 text-slate-600">{lineCount}</td>
                          <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-800">{money(recordAmount(record))}</td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{money(record.amountPaid)}</td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{money(record.balance)}</td>
                          <td className="px-5 py-3.5"><StatusBadge value={record.status === 'Cancelled' ? record.status : record.paymentStatus} /></td>
                          <td className="px-5 py-3.5 text-right">
                            <button type="button" onClick={() => setSelectedRecord(record)} aria-label={`View ${getReference(record, kind)}`} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800">
                              <Eye className="size-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredRecords.length)} of {filteredRecords.length}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
                  <span>{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button>
                </div>
              </footer>
            </>
          ) : (
            <div className="p-10 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                {isSale ? <ArrowUpRight className="size-5" /> : <ArrowDownLeft className="size-5" />}
              </div>
              <h2 className="mt-3 text-sm font-semibold text-slate-800">{records.length ? `No matching ${kind.toLowerCase()}` : `No ${kind.toLowerCase()} yet`}</h2>
              <p className="mt-1 text-xs text-slate-500">{records.length ? 'Try adjusting your search or filters.' : `Recorded ${kind.toLowerCase()} will appear here.`}</p>
              {!records.length && <Button className="mt-4" size="sm" onClick={() => setShowForm(true)}><Plus className="size-3.5" /> {isSale ? 'Create sale' : 'Record purchase'}</Button>}
            </div>
          )}
        </section>
      </main>

      {showForm && (
        <TransactionForm
          kind={kind}
          data={data}
          user={user}
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false)
            setNotice({ type: 'success', message: `${kind === 'Sales' ? 'Sale' : 'Purchase'} recorded successfully (${id}).` })
          }}
        />
      )}
      {selectedRecord && <TransactionDetails kind={kind} record={selectedRecord} onClose={() => setSelectedRecord(null)} />}
    </>
  )
}

export default TransactionsModule
