import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import EmptyState from '@/components/dashboard/EmptyState'
import MetricCard from '@/components/dashboard/MetricCard'
import { db } from '@/lib/firebase'
import { deleteExpense, expenseCategories, generateInvoice, saveExpense } from '@/lib/finance-writes'

const pageSize = 10
const formatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

function money(value) {
  return formatter.format(Number(value) || 0)
}

function asDate(value) {
  if (!value) return null
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateLabel(value) {
  return asDate(value)?.toLocaleDateString() || '—'
}

function expensePaymentStatus(expense) {
  if (expense.paymentStatus) return expense.paymentStatus
  const amount = Number(expense.amount) || 0
  const paid = Number(expense.amountPaid) || 0
  if (amount > 0 && paid >= amount) return 'Paid'
  return paid > 0 ? 'Partially Paid' : 'Unpaid'
}

function Badge({ children }) {
  const value = String(children || 'Unpaid')
  const color = ['Paid', 'Sales'].includes(value)
    ? 'bg-emerald-50 text-emerald-800'
    : ['Partially Paid', 'Purchase'].includes(value)
      ? 'bg-amber-50 text-amber-800'
      : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${color}`}>{value}</span>
}

function ExpenseForm({ user, expense, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    title: expense?.title || '',
    category: expense?.category || expenseCategories[0],
    amount: expense?.amount ?? '',
    date: expense?.date || new Date().toISOString().slice(0, 10),
    amountPaid: expense?.amountPaid ?? 0,
    paymentMethod: expense?.paymentMethod || 'Cash',
    payee: expense?.payee || '',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await saveExpense({ uid: user.uid, id: expense?.id, fields: values })
      onSaved(expense ? 'Expense updated.' : 'Expense recorded.')
    } catch (saveError) {
      console.error('Save expense failed:', saveError)
      setError(saveError.message || 'Could not save this expense.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="expense-form-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">Expenses</p>
            <h2 id="expense-form-title" className="mt-1 text-lg font-semibold text-slate-900">{expense ? 'Edit expense' : 'Record expense'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </header>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Expense title *
              <input required value={values.title} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Category *
              <select required value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))} className={inputClass}>
                {expenseCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Date *
              <input required type="date" value={values.date} onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Total amount *
              <input required type="number" min="0.01" step="0.01" value={values.amount} onChange={(event) => setValues((current) => ({ ...current, amount: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Amount paid
              <input type="number" min="0" step="0.01" value={values.amountPaid} onChange={(event) => setValues((current) => ({ ...current, amountPaid: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Payment method
              <select value={values.paymentMethod} onChange={(event) => setValues((current) => ({ ...current, paymentMethod: event.target.value }))} className={inputClass}>
                {['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'].map((method) => <option key={method}>{method}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Payee
              <input value={values.payee} onChange={(event) => setValues((current) => ({ ...current, payee: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">Reference
              <input value={values.reference} onChange={(event) => setValues((current) => ({ ...current, reference: event.target.value }))} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Notes
              <textarea rows="3" value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : expense ? 'Save changes' : 'Record expense'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function invoiceMoney(invoice, value) {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: invoice.currency || 'PKR',
      maximumFractionDigits: 2,
    }).format(Number(value) || 0)
  } catch {
    return money(value)
  }
}

function InvoiceDetails({ invoice, businessProfile, onClose }) {
  const businessName = businessProfile.businessName || 'Pyrox Biz'
  const showBusinessInfo = businessProfile.showBusinessInfoOnInvoice !== false
  return (
    <div className="invoice-print-root fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="invoice-details-title" className="invoice-print-paper max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="invoice-print-actions sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">Invoice details</p>
            <h2 id="invoice-details-title" className="mt-1 text-lg font-semibold text-slate-900">{invoice.invoiceNumber || 'Invoice'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => window.print()}><Printer className="size-4" />Print invoice</Button>
            <button type="button" onClick={onClose} aria-label="Close invoice details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
          </div>
        </header>
        <div className="space-y-7 p-5 sm:p-9">
          <div className="flex flex-col justify-between gap-5 border-b-2 border-emerald-700 pb-6 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-sm font-bold tracking-tight text-white print:rounded-none">{businessName.slice(0, 2).toUpperCase()}</span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">{businessName}</h2>
                {showBusinessInfo && <div className="mt-1 space-y-0.5 text-xs leading-5 text-slate-500">
                  {businessProfile.ownerName && <p>{businessProfile.ownerName}</p>}
                  {businessProfile.address && <p className="whitespace-pre-line">{businessProfile.address}</p>}
                  {businessProfile.phone && <p>{businessProfile.phone}</p>}
                  {businessProfile.email && <p>{businessProfile.email}</p>}
                </div>}
                {!businessProfile.businessName && <p className="mt-1 text-[10px] text-slate-400 invoice-print-actions">Add your business details in Settings before printing.</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-700">{invoice.type === 'Purchase' ? 'Purchase invoice' : 'Sales invoice'}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{invoice.invoiceNumber || 'Invoice'}</p>
              <p className="mt-1 text-xs text-slate-500">Issued {dateLabel(invoice.date)}</p>
              <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">{invoice.paymentStatus || 'Payment status unavailable'}</p>
            </div>
          </div>
          <div className="invoice-print-block grid gap-5 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Bill to</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{invoice.partyName || 'Customer / supplier'}</p>
              <p className="mt-1 text-xs text-slate-500">{invoice.partyType === 'supplier' || invoice.type === 'Purchase' ? 'Supplier' : 'Customer'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 p-4 text-xs">
              <p className="text-slate-500">Invoice date<span className="mt-1 block font-semibold text-slate-800">{dateLabel(invoice.date)}</span></p>
              <p className="text-slate-500">Reference<span className="mt-1 block font-semibold text-slate-800">{invoice.sourceNumber || '—'}</span></p>
              <p className="text-slate-500">Payment method<span className="mt-1 block font-semibold text-slate-800">{invoice.paymentMethod || '—'}</span></p>
              <p className="text-slate-500">Currency<span className="mt-1 block font-semibold text-slate-800">{invoice.currency || 'PKR'}</span></p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-emerald-50 text-[10px] font-bold uppercase tracking-wide text-emerald-900"><tr><th className="px-4 py-3">Description</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(invoice.items || []).map((item, index) => (
                  <tr key={`${item.productId || item.name}-${index}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.name || 'Item'}{item.sku && <span className="block text-[10px] text-slate-400">{item.sku}</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{Number(item.qty ?? item.quantity) || 0}</td>
                    <td className="px-4 py-3 text-slate-600">{invoiceMoney(invoice, item.unitPrice ?? item.purchasePrice)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{invoiceMoney(invoice, item.lineTotal ?? item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="invoice-print-block flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div className="max-w-sm text-xs leading-5 text-slate-500">
              <p className="font-semibold text-slate-800">Thank you for your business.</p>
              {businessProfile.invoiceNotes && <p className="mt-2 whitespace-pre-line">{businessProfile.invoiceNotes}</p>}
            </div>
            <div className="w-full max-w-xs space-y-2 border-t border-slate-100 pt-4 text-xs">
              <p className="flex justify-between text-slate-500"><span>Subtotal</span><span>{invoiceMoney(invoice, invoice.subtotal)}</span></p>
              <p className="flex justify-between text-slate-500"><span>Discount</span><span>{invoiceMoney(invoice, invoice.discountTotal)}</span></p>
              <p className="flex justify-between text-slate-500"><span>Tax</span><span>{invoiceMoney(invoice, invoice.taxTotal)}</span></p>
              <p className="flex justify-between border-t border-emerald-200 pt-3 text-sm font-bold text-emerald-900"><span>Total due</span><span>{invoiceMoney(invoice, invoice.grandTotal)}</span></p>
              <p className="flex justify-between text-slate-500"><span>Paid</span><span>{invoiceMoney(invoice, invoice.amountPaid)}</span></p>
              <p className="flex justify-between font-semibold text-slate-700"><span>Balance</span><span>{invoiceMoney(invoice, invoice.balance)}</span></p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function InvoicesModule({ user, data, pending, errors, onRetry }) {
  const [businessProfile, setBusinessProfile] = useState({})
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [busySource, setBusySource] = useState('')
  const [notice, setNotice] = useState(null)
  const invoiceError = errors.invoices
  const invoices = data.invoices
  const candidates = [
    ...data.sales.map((record) => ({ ...record, _kind: 'Sales' })),
    ...data.purchases.filter((record) => record.status !== 'Cancelled').map((record) => ({ ...record, _kind: 'Purchases' })),
  ].filter((record) => !record.invoiceId)
  const list = useMemo(() => invoices.filter((invoice) => {
    const text = `${invoice.invoiceNumber || ''} ${invoice.partyName || ''} ${invoice.sourceNumber || ''}`.toLowerCase()
    return (!search || text.includes(search.toLowerCase())) && (!typeFilter || invoice.type === typeFilter)
  }).sort((a, b) => (asDate(b.createdAt || b.date)?.getTime() || 0) - (asDate(a.createdAt || a.date)?.getTime() || 0)), [invoices, search, typeFilter])
  const pages = Math.max(1, Math.ceil(list.length / pageSize))
  const pageItems = list.slice((page - 1) * pageSize, page * pageSize)
  const invoicedTotal = invoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0)
  const outstanding = invoices.reduce((sum, invoice) => sum + (Number(invoice.balance) || 0), 0)

  useEffect(() => {
    let active = true
    getDoc(doc(db, 'businesses', user.uid, 'settings', 'profile'))
      .then((snapshot) => {
        if (active && snapshot.exists()) setBusinessProfile(snapshot.data())
      })
      .catch((error) => {
        console.error('Load business details for invoice printing failed:', error)
      })

    return () => { active = false }
  }, [user.uid])

  async function create(source) {
    setBusySource(source.id)
    setNotice(null)
    try {
      const result = await generateInvoice({ uid: user.uid, transactionKind: source._kind, transactionId: source.id })
      setNotice({ type: 'success', message: result.alreadyExists ? `Invoice ${result.invoiceNumber || ''} already exists.` : `Invoice ${result.invoiceNumber} generated.` })
    } catch (error) {
      console.error('Generate invoice failed:', error)
      setNotice({ type: 'error', message: error.message || 'Could not generate invoice.' })
    } finally {
      setBusySource('')
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm font-medium text-emerald-700">Manage / Invoices</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Invoices</h1><p className="mt-1.5 text-sm text-slate-500">View invoices and generate one from a recorded sale or purchase.</p></div>
        </section>
        {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</p>}
        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Invoices" icon={FileText} value={invoices.length.toLocaleString()} description="Saved invoice records" loading={pending.invoices} error={Boolean(invoiceError)} />
          <MetricCard label="Invoiced total" icon={ArrowUpRight} value={money(invoicedTotal)} description="Sum of saved invoice values" loading={pending.invoices} error={Boolean(invoiceError)} />
          <MetricCard label="Invoice balances" icon={ArrowDownLeft} value={money(outstanding)} description="Outstanding on saved invoices" loading={pending.invoices} error={Boolean(invoiceError)} />
        </section>
        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:p-5">
            <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search invoice, party, or source…" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600" aria-label="Search invoices" /></label>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1) }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs" aria-label="Filter invoice type"><option value="">All invoice types</option><option>Sales</option><option>Purchase</option></select>
          </div>
          {invoiceError ? <div className="p-8 text-center"><p className="text-sm font-medium text-rose-800">Could not load invoices.</p><p className="mt-1 text-xs text-slate-500">{invoiceError}</p><Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>
            : pending.invoices ? <div className="p-10 text-center text-sm text-slate-500">Loading invoices…</div>
              : pageItems.length ? <>
                <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Type / party</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">View</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{pageItems.map((invoice) => <tr key={invoice.id} className="hover:bg-slate-50/70"><td className="px-5 py-3.5 font-semibold text-slate-800">{invoice.invoiceNumber || invoice.id}</td><td className="px-5 py-3.5"><Badge>{invoice.type}</Badge><span className="ml-2 text-slate-600">{invoice.partyName || '—'}</span></td><td className="px-5 py-3.5 text-slate-500">{dateLabel(invoice.date)}</td><td className="px-5 py-3.5 font-medium text-slate-700">{money(invoice.grandTotal)}</td><td className="px-5 py-3.5 text-slate-600">{money(invoice.balance)}</td><td className="px-5 py-3.5"><Badge>{invoice.paymentStatus}</Badge></td><td className="px-5 py-3.5 text-right"><button type="button" onClick={() => setSelected(invoice)} aria-label={`View invoice ${invoice.invoiceNumber}`} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"><Eye className="size-4" /></button></td></tr>)}</tbody>
                </table></div>
                <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, list.length)} of {list.length}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>{page} / {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></footer>
              </> : <EmptyState icon={FileText} title="No invoices found" description={invoices.length ? 'Try another search or invoice type.' : 'Generate an invoice from a completed sale or purchase below.'} className="min-h-48" />}
        </section>
        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Transactions without invoices</h2><p className="mt-1 text-xs text-slate-500">Invoice generation links to the existing transaction; it does not create another sale or purchase.</p></div>
          {pending.sales || pending.purchases ? <div className="p-8 text-center text-sm text-slate-500">Loading transactions…</div> : candidates.length ? <div className="divide-y divide-slate-100">{candidates.slice(0, 10).map((source) => <div key={`${source._kind}-${source.id}`} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{source.saleNumber || source.purchaseNumber || source.id} · {source.customerName || source.supplierName || 'Business transaction'}</p><p className="mt-1 text-[11px] text-slate-500">{source._kind} · {dateLabel(source.createdAt || source.date)} · {money(source.grandTotal ?? source.amount)}</p></div><Button variant="outline" size="sm" onClick={() => create(source)} disabled={busySource === source.id}><Plus className="size-3.5" />{busySource === source.id ? 'Generating…' : 'Generate invoice'}</Button></div>)}</div> : <p className="p-8 text-center text-xs text-slate-500">All available transactions already have invoices.</p>}
        </section>
      </main>
      {selected && <InvoiceDetails invoice={selected} businessProfile={businessProfile} onClose={() => setSelected(null)} />}
    </>
  )
}

function ExpensesModule({ user, data, pending, errors, onRetry }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState(null)
  const expenses = data.expenses
  const error = errors.expenses
  const filtered = useMemo(() => expenses.filter((expense) => {
    const text = `${expense.title || ''} ${expense.category || ''} ${expense.payee || ''} ${expense.reference || ''}`.toLowerCase()
    return (!search || text.includes(search.toLowerCase())) && (!category || expense.category === category)
  }).sort((a, b) => (asDate(b.date)?.getTime() || 0) - (asDate(a.date)?.getTime() || 0)), [expenses, search, category])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)
  const total = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const paid = expenses.reduce((sum, item) => sum + (Number(item.amountPaid) || 0), 0)
  const outstanding = expenses.reduce((sum, item) => sum + (Number(item.remaining ?? (Number(item.amount) - Number(item.amountPaid))) || 0), 0)

  async function removeExpense() {
    setDeleting(true)
    try {
      await deleteExpense({ uid: user.uid, id: deleteTarget.id })
      setNotice({ type: 'success', message: 'Expense deleted.' })
      setDeleteTarget(null)
    } catch (deleteError) {
      console.error('Delete expense failed:', deleteError)
      setDeleteTarget(null)
      setNotice({ type: 'error', message: deleteError.message || 'Could not delete the expense.' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-emerald-800">Manage / Expenses</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Expenses</h1><p className="mt-1.5 text-sm text-slate-600">Record and review business spending and payment balances.</p></div><Button onClick={() => { setEditing(null); setShowForm(true); setNotice(null) }}><Plus className="size-4" /> Record expense</Button></section>
        {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</p>}
        <section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Expense total" icon={Wallet} value={money(total)} description="All recorded expenses" loading={pending.expenses} error={Boolean(error)} /><MetricCard label="Paid" icon={ArrowUpRight} value={money(paid)} description="Payments recorded" loading={pending.expenses} error={Boolean(error)} /><MetricCard label="Outstanding" icon={ArrowDownLeft} value={money(outstanding)} description="Remaining expense balances" loading={pending.expenses} error={Boolean(error)} /></section>
        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:p-5"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search title, category, payee…" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600" aria-label="Search expenses" /></label><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs" aria-label="Filter expense category"><option value="">All categories</option>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></div>
          {error ? <div className="p-8 text-center"><p className="text-sm font-medium text-rose-800">Could not load expenses.</p><p className="mt-1 text-xs text-slate-500">{error}</p><Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>
            : pending.expenses ? <div className="p-10 text-center text-sm text-slate-500">Loading expenses…</div>
              : items.length ? <>
                <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-5 py-3">Expense</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((expense) => <tr key={expense.id} className="hover:bg-slate-50/70"><td className="px-5 py-3.5"><p className="font-semibold text-slate-800">{expense.title || 'Expense'}</p><p className="mt-1 text-[10px] text-slate-500">{expense.category}{expense.payee ? ` · ${expense.payee}` : ''}</p></td><td className="px-5 py-3.5 text-slate-500">{dateLabel(expense.date)}</td><td className="px-5 py-3.5 font-medium text-slate-700">{money(expense.amount)}</td><td className="px-5 py-3.5 text-slate-600">{money(expense.amountPaid)}</td><td className="px-5 py-3.5 text-slate-600">{money(expense.remaining ?? (Number(expense.amount) - Number(expense.amountPaid)))}</td><td className="px-5 py-3.5"><Badge>{expensePaymentStatus(expense)}</Badge></td><td className="px-5 py-3.5 text-right"><button type="button" aria-label={`Edit ${expense.title}`} onClick={() => { setEditing(expense); setShowForm(true); setNotice(null) }} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"><Pencil className="size-4" /></button><button type="button" aria-label={`Delete ${expense.title}`} onClick={() => setDeleteTarget(expense)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button></td></tr>)}</tbody></table></div>
                <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>{page} / {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></footer>
              </> : <EmptyState icon={Wallet} title={expenses.length ? 'No matching expenses' : 'No expenses recorded'} description={expenses.length ? 'Try another search or category.' : 'Record an expense to see it in this list.'} className="min-h-48" />}
        </section>
      </main>
      {showForm && <ExpenseForm user={user} expense={editing} onClose={() => setShowForm(false)} onSaved={(message) => { setShowForm(false); setNotice({ type: 'success', message }) }} />}
      {deleteTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-expense-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="delete-expense-title" className="text-base font-semibold text-slate-900">Delete this expense?</h2><p className="mt-2 text-sm leading-6 text-slate-500">This permanently removes “{deleteTarget.title}” from your business expenses.</p><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button><Button variant="destructive" onClick={removeExpense} disabled={deleting}><Trash2 className="size-4" />{deleting ? 'Deleting…' : 'Delete'}</Button></div></section></div>}
    </>
  )
}

const flowQuestions = [
  'How are my sales this month?',
  'How do sales compare with last month?',
  'What was my highest-value sale?',
  'Who are my best customers?',
  'What are my top-selling products?',
  'Which customers have outstanding balances?',
  'How are my purchases this month?',
  'Which suppliers have outstanding balances?',
  'How much do I owe suppliers?',
  'How much profit did I make this month?',
  'Which products are low in stock?',
  'Which products are not selling?',
  'How much did I spend on expenses this month?',
  'What category costs me the most?',
  'What are my biggest expenses?',
  'How do expenses compare with last month?',
]

function monthRecords(records, offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
  return records.filter((record) => {
    const date = asDate(record.createdAt || record.date || record.timestamp)
    return date && date >= start && date < end
  })
}

function total(records, amountField = 'grandTotal') {
  return records.reduce((sum, record) => sum + (Number(record[amountField] ?? record.amount) || 0), 0)
}

function aggregate(records, keyOf, amountOf) {
  const map = new Map()
  records.forEach((record) => {
    const key = keyOf(record)
    if (!key) return
    const current = map.get(key) || { name: String(key), value: 0, count: 0 }
    current.value += Number(amountOf(record)) || 0
    current.count += 1
    map.set(key, current)
  })
  return [...map.values()].sort((a, b) => b.value - a.value)
}

function normalizeFlowQuestion(question) {
  return question
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(net profit|net income|earnings)\b/g, 'profit')
    .replace(/\b(revenue|turnover|takings|income)\b/g, 'sales')
    .replace(/\bno sales\b/g, 'not selling')
    .replace(/\b(clients?|buyers?)\b/g, 'customer')
    .replace(/\b(vendors?)\b/g, 'supplier')
    .replace(/\b(purchases?|bought|buying|procurement)\b/g, 'purchase')
    .replace(/\b(sales?|orders?)\b/g, 'sale')
    .replace(/\b(sold|sells)\b/g, 'sell')
    .replace(/\b(expenses?|spending|spend|spent|overheads?)\b/g, 'expense')
    .replace(/\b(inventory|stock levels?|running low|almost out|out of stock|reorder|restock|replenish)\b/g, 'stock')
    .replace(/\b(products?|items?)\b/g, 'product')
    .replace(/\b(previous|prior|preceding) month\b|\bmonth before\b/g, 'last month')
    .replace(/\b(current|this) month\b|\bmonthly\b/g, 'month')
    .replace(/\b(compared with|compared to|relative to|versus|vs)\b/g, 'compare')
    .replace(/\b(biggest|largest|highest value|most expensive)\b/g, 'biggest')
    .replace(/\b(best selling|best sellers?|fast moving|moving fastest|flying off shelves)\b/g, 'top selling')
    .replace(/\b(not moving|slow moving|unsold|not sold|no sales)\b/g, 'not selling')
    .replace(/\bwho (?:still )?(?:owes?|needs? to pay|hasnt paid|has not paid)\b/g, 'customer outstanding')
    .replace(/\b(havent|hasnt|have not|has not) paid\b/g, 'outstanding')
    .replace(/\b(owe|owes|owing|unpaid|overdue|due|outstanding|balances?)\b/g, 'outstanding')
    .replace(/\s+/g, ' ')
    .trim()
}

function answerFlowQuestion(question, data, errors) {
  const text = normalizeFlowQuestion(question)
  if (/^(hi|hello|hey|hiya|howdy)( there)?( flow ?ai)?$/.test(text) || /^(good morning|good afternoon|good evening)( flow ?ai)?$/.test(text)) {
    return 'Hi! I’m here to help with your business. Ask me about sales, revenue, purchases, customers, suppliers, stock, expenses, or profit.'
  }
  if (/^(how are you|how are you doing|whats up|what is up)( flow ?ai)?$/.test(text)) {
    return 'I’m ready to help with your business data. What would you like to know?'
  }
  if (/^(thanks|thank you|thanks a lot|cheers)( flow ?ai)?$/.test(text)) {
    return 'You’re welcome! Ask anytime if you need another business summary.'
  }
  if (/^(what can you do|what do you do|help|help me)( flow ?ai)?$/.test(text)) {
    return 'I can summarize recorded sales, purchases, customers, supplier balances, product stock, expenses, and estimated profit. Try asking in your own words, such as “Which items are running low?”'
  }
  const sales = data.sales.filter((sale) => (sale.saleStatus || sale.status) !== 'Returned')
  const purchases = data.purchases.filter((purchase) => purchase.status !== 'Cancelled')
  const has = (resource) => {
    if (errors[resource]) return `I couldn't load your ${resource} from Firestore. Refresh the data and check access permissions.`
    if (!data[resource].length) return `There are no ${resource} records available yet for this account.`
    return null
  }
  const isComparison = text.includes('compare') || text.includes('last month') || text.includes('up or down')

  if (text.includes('sale') && (text.includes('month') || text.includes('perform') || text.includes('business doing') || text.includes('how much') || text.includes('looking like'))) {
    const missing = has('sales')
    if (missing) return missing
    const current = total(monthRecords(sales))
    const count = monthRecords(sales).length
    if (!isComparison) return `This month you have ${count} recorded sale${count === 1 ? '' : 's'}, totaling ${money(current)}.`
    const previous = total(monthRecords(sales, -1))
    const difference = current - previous
    const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'unchanged'
    const percent = previous ? `${Math.round(Math.abs(difference / previous) * 100)}%` : current ? '100%' : '0%'
    return `Sales are ${direction} ${percent} compared with last month: ${money(current)} this month versus ${money(previous)} last month.`
  }
  if (text.includes('highest-value') || text.includes('highest value') || text.includes('biggest sale') || text.includes('largest sale')) {
    const missing = has('sales')
    if (missing) return missing
    const top = [...sales].sort((a, b) => total([b]) - total([a]))[0]
    return top ? `Your highest-value sale is ${top.saleNumber || top.invoiceNumber || top.id}, for ${top.customerName || 'a customer'}, totaling ${money(total([top]))}.` : 'There are no completed sales to compare.'
  }
  if (text.includes('customer') && (text.includes('best') || text.includes('top') || text.includes('biggest') || text.includes('purchased most'))) {
    const missing = has('sales')
    if (missing) return missing
    const ranked = aggregate(sales, (sale) => sale.customerId || sale.customerName || 'Walk-in', (sale) => sale.grandTotal ?? sale.amount)
    return ranked.length ? `Your highest-value customers by recorded sales:\n${ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}: ${money(item.value)} (${item.count} sales)`).join('\n')}` : 'There are no customer sales to rank.'
  }
  if (text.includes('top-selling') || text.includes('top selling') || text.includes('top sell') || text.includes('fastest') || text.includes('products generated') || (text.includes('product') && text.includes('sell'))) {
    const missing = has('sales')
    if (missing) return missing
    const lines = sales.flatMap((sale) => sale.items || [])
    const ranked = aggregate(lines, (item) => item.productName || item.name || item.productId, (item) => item.quantity ?? item.qty)
    return ranked.length ? `Your top-selling products by quantity:\n${ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}: ${item.value} units`).join('\n')}` : 'Sales records do not contain product line items to rank.'
  }
  if (text.includes('outstanding') && text.includes('customer') || text.includes('who owes') || text.includes('owes me') || text.includes('customer') && text.includes('pay me')) {
    const missing = has('sales')
    if (missing) return missing
    const ranked = aggregate(sales.filter((sale) => Number(sale.balance) > 0), (sale) => sale.customerId || sale.customerName || 'Walk-in', (sale) => sale.balance)
    return ranked.length ? `Customers with the highest unpaid sale balances:\n${ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}: ${money(item.value)}`).join('\n')}` : 'No outstanding customer balances are recorded.'
  }
  if (text.includes('purchase') || text.includes('supplier') && text.includes('outstanding')) {
    const missing = has('purchases')
    if (missing) return missing
    if (text.includes('supplier') && text.includes('outstanding') || text.includes('owe supplier')) {
      const ranked = aggregate(purchases.filter((purchase) => Number(purchase.balance) > 0), (purchase) => purchase.supplierId || purchase.supplierName || 'Supplier', (purchase) => purchase.balance)
      return ranked.length ? `Supplier balances from recorded purchases:\n${ranked.slice(0, 5).map((item, index) => `${index + 1}. ${item.name}: ${money(item.value)}`).join('\n')}` : 'No outstanding supplier purchase balances are recorded.'
    }
    const current = total(monthRecords(purchases))
    if (!isComparison) return `Recorded purchases this month total ${money(current)} across ${monthRecords(purchases).length} purchase${monthRecords(purchases).length === 1 ? '' : 's'}.`
    const previous = total(monthRecords(purchases, -1))
    return `Purchases are ${current > previous ? 'up' : current < previous ? 'down' : 'unchanged'} compared with last month: ${money(current)} this month versus ${money(previous)} last month.`
  }
  if (text.includes('profit')) {
    const missing = has('sales')
    if (missing) return missing
    const currentSales = monthRecords(sales)
    const currentExpenses = monthRecords(data.expenses)
    const hasCosts = data.products.some((product) => product.costPrice != null || product.purchasePrice != null)
    const cost = hasCosts
      ? currentSales.reduce((sum, sale) => sum + (sale.items || []).reduce((lineSum, item) => {
        const product = data.products.find((entry) => entry.id === item.productId)
        const unitCost = product?.costPrice ?? product?.purchasePrice
        return lineSum + (unitCost == null ? 0 : (Number(unitCost) || 0) * (Number(item.quantity ?? item.qty) || 0))
      }, 0), 0)
      : total(monthRecords(purchases))
    if (!hasCosts && errors.purchases) return 'I cannot estimate profit because purchase data is unavailable and product cost prices are not configured.'
    if (!data.products.length && errors.products && !errors.purchases) return 'Profit estimate unavailable: product costs could not be loaded.'
    if (errors.expenses) return 'I cannot estimate profit because expense data is unavailable.'
    const expenseTotal = total(currentExpenses, 'amount')
    const profit = total(currentSales) - cost - expenseTotal
    return `Estimated profit this month is ${money(profit)}: sales ${money(total(currentSales))} minus ${hasCosts ? 'estimated product cost' : 'purchase totals as a cost proxy'} ${money(cost)} and expenses ${money(expenseTotal)}. This is an estimate, not an accounting statement.`
  }
  if (text.includes('stock') || text.includes('restock') || text.includes('not selling')) {
    const missing = has('products')
    if (missing) return missing
    if (text.includes('not selling') || text.includes('no sale')) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const soldRecently = new Set(sales.filter((sale) => (asDate(sale.createdAt || sale.date)?.getTime() || 0) >= cutoff.getTime()).flatMap((sale) => sale.items || []).map((item) => item.productId))
      const idle = data.products.filter((product) => product.status !== 'Discontinued' && !soldRecently.has(product.id))
      return idle.length ? `Products with no recorded sale in the last 30 days:\n${idle.slice(0, 10).map((product) => `• ${product.name || product.id}: ${Number(product.stock) || 0} in stock`).join('\n')}` : 'Each active product has at least one recorded sale in the last 30 days.'
    }
    const low = data.products.filter((product) => Number(product.stock) <= Number(product.reorderLevel ?? product.minStock ?? product.minimumStock ?? 0))
    return low.length ? `Products at or below their reorder level:\n${low.slice(0, 10).map((product) => `• ${product.name || product.id}: ${Number(product.stock) || 0} in stock; reorder at ${Number(product.reorderLevel ?? product.minStock ?? product.minimumStock) || 0}`).join('\n')}` : 'No products are currently at or below their recorded reorder levels.'
  }
  if (text.includes('expense')) {
    const missing = has('expenses')
    if (missing) return missing
    const current = monthRecords(data.expenses)
    const currentTotal = total(current, 'amount')
    if (text.includes('category') || text.includes('costs me most') || text.includes('expense most')) {
      const ranked = aggregate(data.expenses, (expense) => expense.category || 'Other', (expense) => expense.amount)
      return ranked.length ? `Your largest expense category is ${ranked[0].name}, totaling ${money(ranked[0].value)} across ${ranked[0].count} records.` : 'There are no expenses to categorize.'
    }
    if (text.includes('biggest')) {
      const ranked = [...data.expenses].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5)
      return ranked.length ? `Your highest recorded expenses:\n${ranked.map((expense, index) => `${index + 1}. ${expense.title || expense.category || 'Expense'}: ${money(expense.amount)}`).join('\n')}` : 'There are no expenses recorded yet.'
    }
    if (isComparison) {
      const previous = total(monthRecords(data.expenses, -1), 'amount')
      return `Expenses are ${currentTotal > previous ? 'up' : currentTotal < previous ? 'down' : 'unchanged'} compared with last month: ${money(currentTotal)} this month versus ${money(previous)} last month.`
    }
    return `Expenses this month total ${money(currentTotal)} across ${current.length} recorded item${current.length === 1 ? '' : 's'}.`
  }

  return 'I can answer questions about sales, purchases, profit estimates, customers, supplier balances, inventory, and expenses. Try asking in your own words, or choose one of the suggested questions below.'
}

function ReportsModule({ data, pending, errors, onRetry }) {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [showAllQuestions, setShowAllQuestions] = useState(false)
  const loading = pending.sales || pending.purchases || pending.products || pending.customers || pending.suppliers || pending.expenses
  const error = errors.sales || errors.purchases || errors.products || errors.customers || errors.suppliers || errors.expenses
  const visibleQuestions = showAllQuestions ? flowQuestions : flowQuestions.slice(0, 8)

  function ask(value) {
    const clean = value.trim()
    if (!clean || loading) return
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text: clean },
      { id: `${Date.now()}-assistant`, role: 'assistant', text: answerFlowQuestion(clean, data, errors) },
    ])
    setQuestion('')
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><Sparkles className="size-4" />Manage / FlowAI</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">FlowAI business assistant</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">Ask naturally about sales, spending, customers, suppliers, or stock. FlowAI matches common phrases to supported questions and calculates answers from your Firebase records—no external AI service is used.</p>
        </div>
        <Button variant="outline" onClick={onRetry}><RefreshCw className="size-4" />Refresh business data</Button>
      </section>

      {error && <section role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-rose-800">Some data may be unavailable. Answers identify missing collections where possible.</p><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></section>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-700 text-white"><Sparkles className="size-5" /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-900">FlowAI</h2><p className="mt-0.5 text-[11px] text-slate-500">{loading ? 'Connecting to your business data…' : `${data.sales.length} sales · ${data.purchases.length} purchases · ${data.products.length} products · ${data.expenses.length} expenses loaded`}</p></div>
          <span className={`size-2 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`} aria-label={loading ? 'Loading data' : 'Connected'} />
        </div>

        <div className="max-h-[min(56vh,560px)] min-h-64 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Sparkles className="size-4" /></span>
            <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              <p className="font-medium text-slate-900">Hello! I’m your FlowAI assistant.</p>
              <p className="mt-1">Ask in your own words about sales or revenue, purchases, profit estimates, customers, suppliers or vendors, inventory, or expenses. I match supported phrases and use recorded business data only.</p>
            </div>
          </div>
          {messages.map((message) => (
            <div key={message.id} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Sparkles className="size-4" /></span>}
              <p className={`max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-tr-sm bg-emerald-700 text-white' : 'rounded-tl-sm bg-slate-50 text-slate-700'}`}>{message.text}</p>
            </div>
          ))}
          {loading && <p role="status" className="pl-11 text-xs text-slate-400">Waiting for business data before answering…</p>}
        </div>

        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap gap-2">
            {visibleQuestions.map((item) => <button key={item} type="button" disabled={loading} onClick={() => ask(item)} className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-left text-[11px] font-medium text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{item}</button>)}
            <button type="button" onClick={() => setShowAllQuestions((value) => !value)} className="rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100">{showAllQuestions ? 'Show fewer' : `Show more (${flowQuestions.length - 8})`}</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); ask(question) }} className="flex gap-2">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} disabled={loading} placeholder="e.g. Which items are running low?" aria-label="Ask FlowAI a question" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50" />
            <Button type="submit" className="h-11 px-4" disabled={loading || !question.trim()} aria-label="Send question"><Send className="size-4" /><span className="hidden sm:inline">Ask</span></Button>
          </form>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">Results reflect current records. Profit answers are estimates and are not accounting statements.</p>
        </div>
      </section>
    </main>
  )
}

function FinanceModule(props) {
  if (props.kind === 'Invoices') return <InvoicesModule {...props} />
  if (props.kind === 'Expenses') return <ExpensesModule {...props} />
  return <ReportsModule {...props} />
}

export default FinanceModule
