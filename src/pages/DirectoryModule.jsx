import { useMemo, useState } from 'react'
import {
  Building2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import MetricCard from '@/components/dashboard/MetricCard'
import { deleteDirectoryRecord, saveDirectoryRecord } from '@/lib/directory-writes'

const pageSize = 10
const currency = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

const fieldsByKind = {
  Products: [
    { name: 'name', label: 'Product name', required: true },
    { name: 'sku', label: 'SKU' },
    { name: 'barcode', label: 'Barcode' },
    { name: 'category', label: 'Category' },
    { name: 'brand', label: 'Brand' },
    { name: 'unit', label: 'Unit', placeholder: 'e.g. piece, box' },
    { name: 'costPrice', label: 'Cost price', type: 'number', min: 0 },
    { name: 'sellingPrice', label: 'Selling price', type: 'number', min: 0 },
    { name: 'wholesalePrice', label: 'Wholesale price', type: 'number', min: 0 },
    { name: 'reorderLevel', label: 'Reorder level', type: 'number', min: 0 },
    { name: 'supplier', label: 'Supplier' },
    { name: 'location', label: 'Storage location' },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    { name: 'description', label: 'Description', type: 'textarea', wide: true },
  ],
  Customers: [
    { name: 'name', label: 'Customer name', required: true },
    { name: 'company', label: 'Company' },
    { name: 'phone', label: 'Phone', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'city', label: 'City' },
    { name: 'taxNumber', label: 'Tax / NTN number' },
    { name: 'type', label: 'Customer type', type: 'select', options: ['Individual', 'Business'] },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    { name: 'openingBalance', label: 'Opening balance', type: 'number', min: 0 },
    { name: 'address', label: 'Address', type: 'textarea', wide: true },
    { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ],
  Suppliers: [
    { name: 'name', label: 'Supplier name', required: true },
    { name: 'company', label: 'Company' },
    { name: 'phone', label: 'Phone', required: true },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'city', label: 'City' },
    { name: 'taxNumber', label: 'Tax / NTN number' },
    { name: 'type', label: 'Supplier type', type: 'select', options: ['Manufacturer', 'Distributor', 'Wholesaler', 'Other'] },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    { name: 'openingBalance', label: 'Opening balance', type: 'number', min: 0 },
    { name: 'address', label: 'Address', type: 'textarea', wide: true },
    { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ],
}

function money(value) {
  return currency.format(Number(value) || 0)
}

function reorderLevel(record) {
  return Number(record.reorderLevel ?? record.minStock ?? record.minimumStock) || 0
}

function initialValues(kind, record) {
  const values = Object.fromEntries(fieldsByKind[kind].map((field) => [
    field.name,
    record?.[field.name] ?? (
      field.name === 'status'
        ? 'Active'
        : field.name === 'type' && kind === 'Customers'
          ? 'Individual'
          : field.name === 'type' && kind === 'Suppliers'
            ? 'Manufacturer'
            : field.type === 'number'
              ? '0'
              : ''
    ),
  ]))
  if (!record && kind !== 'Products') {
    values.type = kind === 'Customers' ? 'Individual' : 'Manufacturer'
    values.status = 'Active'
  } else if (!record && kind === 'Products') {
    values.status = 'Active'
  }
  return values
}

function validateEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function RecordForm({ kind, record, onClose, onSave }) {
  const [values, setValues] = useState(() => initialValues(kind, record))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fields = fieldsByKind[kind]

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (values.email && !validateEmail(values.email)) {
      setError('Enter a valid email address.')
      return
    }

    const payload = Object.fromEntries(fields.map((field) => {
      const value = values[field.name]
      return [field.name, field.type === 'number' ? Number(value) || 0 : String(value || '').trim()]
    }))
    if (kind === 'Products' && !record) payload.stock = 0
    if (kind === 'Customers' && (!record || Number(payload.openingBalance) !== Number(record.openingBalance || 0))) {
      payload.outstandingBalance = payload.openingBalance
      payload.hasManualBalance = payload.openingBalance > 0
      if (!record) {
        payload.totalSales = 0
        payload.totalPaid = 0
        payload.lastTransactionDate = null
      }
    }
    if (kind === 'Suppliers' && !record) payload.balance = payload.openingBalance

    setSaving(true)
    try {
      await onSave(payload)
    } catch (saveError) {
      console.error(`Save ${kind.toLowerCase()} record failed:`, saveError)
      setError(saveError.message || `Could not save this ${kind.toLowerCase().slice(0, -1)}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="directory-form-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-700">{kind}</p>
            <h2 id="directory-form-title" className="mt-1 text-lg font-semibold text-slate-900">{record ? `Edit ${kind.slice(0, -1).toLowerCase()}` : `Add ${kind.slice(0, -1).toLowerCase()}`}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </header>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.name} className={`grid gap-1.5 text-xs font-medium text-slate-600 ${field.wide ? 'sm:col-span-2' : ''}`}>
                {field.label}{field.required && <span className="text-rose-600">*</span>}
                {field.type === 'select' ? (
                  <select required={field.required} value={values[field.name]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                    {field.options.map((option) => <option key={option}>{option}</option>)}
                    {values[field.name] && !field.options.includes(values[field.name]) && <option>{values[field.name]}</option>}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea rows="3" value={values[field.name]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
                ) : (
                  <input
                    required={field.required}
                    type={field.type || 'text'}
                    min={field.min}
                    step={field.type === 'number' ? '0.01' : undefined}
                    value={values[field.name]}
                    placeholder={field.placeholder}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                )}
              </label>
            ))}
          </div>
          {kind === 'Products' && record && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Current stock: <strong>{Number(record.stock) || 0}</strong>. Stock is changed through sales and purchases.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : record ? 'Save changes' : 'Create record'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DeleteConfirmation({ kind, record, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-record-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="delete-record-title" className="text-base font-semibold text-slate-900">Delete {record.name || kind.slice(0, -1).toLowerCase()}?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">This permanently removes the record. Records connected to sales, purchases, or inventory batches cannot be deleted.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}><Trash2 className="size-4" />{busy ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </section>
    </div>
  )
}

function DirectoryModule({ kind, user, data, pending, errors, onRetry }) {
  const records = data[kind.toLowerCase()]
  const resourceKey = kind.toLowerCase()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editingRecord, setEditingRecord] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const error = errors[resourceKey]
  const icon = kind === 'Products' ? Package : kind === 'Customers' ? Users : Building2
  const Icon = icon

  const visibleRecords = useMemo(() => records
    .filter((record) => {
      const text = Object.values(record).filter((value) => ['string', 'number'].includes(typeof value)).join(' ').toLowerCase()
      return (!search || text.includes(search.toLowerCase()))
        && (!statusFilter || record.status === statusFilter)
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [records, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / pageSize))
  const pageRecords = visibleRecords.slice((page - 1) * pageSize, page * pageSize)
  const activeCount = records.filter((record) => !record.status || record.status === 'Active').length
  const secondaryMetric = kind === 'Products'
    ? `${records.filter((record) => Number(record.stock) <= reorderLevel(record)).length} low / out of stock`
    : `${records.filter((record) => Number(kind === 'Customers' ? record.outstandingBalance ?? record.openingBalance : record.balance ?? record.openingBalance) > 0).length} with a balance`

  function changeFilter(setter) {
    return (event) => {
      setter(event.target.value)
      setPage(1)
    }
  }

  async function save(fields) {
    const record = editingRecord
    await saveDirectoryRecord({ kind, uid: user.uid, id: record?.id, fields })
    setEditingRecord(null)
    setShowForm(false)
    setNotice({ type: 'success', message: `${kind.slice(0, -1)} ${record ? 'updated' : 'created'} successfully.` })
  }

  async function remove() {
    if (!deleteTarget) return
    setBusy(true)
    setNotice(null)
    try {
      await deleteDirectoryRecord({ kind, uid: user.uid, id: deleteTarget.id })
      setNotice({ type: 'success', message: `${kind.slice(0, -1)} deleted successfully.` })
      setDeleteTarget(null)
    } catch (deleteError) {
      console.error(`Delete ${kind.toLowerCase()} record failed:`, deleteError)
      setDeleteTarget(null)
      setNotice({ type: 'error', message: deleteError.message || `Could not delete this ${kind.slice(0, -1).toLowerCase()}.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-emerald-700">Workspace / {kind}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">{kind}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {kind === 'Products' ? 'Manage your catalog, pricing, and stock thresholds.' : `Manage your business ${kind.toLowerCase()} and contact details.`}
            </p>
          </div>
          <Button onClick={() => { setEditingRecord(null); setShowForm(true); setNotice(null) }}>
            <Plus className="size-4" /> Add {kind.slice(0, -1).toLowerCase()}
          </Button>
        </section>

        {notice && (
          <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {notice.message}
          </p>
        )}

        <section aria-label={`${kind} metrics`} className="grid gap-3 sm:grid-cols-3">
          <MetricCard label={`Total ${kind.toLowerCase()}`} icon={Icon} value={records.length.toLocaleString()} description="Records in your workspace" loading={pending[resourceKey]} error={Boolean(error)} />
          <MetricCard label="Active" icon={Users} value={activeCount.toLocaleString()} description="Available for business use" loading={pending[resourceKey]} error={Boolean(error)} />
          <MetricCard label={kind === 'Products' ? 'Stock watch' : 'Balance watch'} icon={kind === 'Products' ? Package : Building2} value={pending[resourceKey] ? '…' : secondaryMetric} description={kind === 'Products' ? 'At or below reorder level' : 'Records with an outstanding balance'} loading={false} error={Boolean(error)} />
        </section>

        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={changeFilter(setSearch)} placeholder={`Search ${kind.toLowerCase()}…`} aria-label={`Search ${kind.toLowerCase()}`} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <select value={statusFilter} onChange={changeFilter(setStatusFilter)} aria-label="Filter by status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-emerald-600">
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {error ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-rose-800">Could not load {kind.toLowerCase()}.</p>
              <p className="mt-1 text-xs text-slate-500">{error}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>Retry</Button>
            </div>
          ) : pending[resourceKey] ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading {kind.toLowerCase()}…</div>
          ) : pageRecords.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{kind === 'Products' ? 'Product' : 'Name / company'}</th>
                      {kind === 'Products' ? (
                        <>
                          <th className="px-5 py-3">SKU / category</th>
                          <th className="px-5 py-3">Stock</th>
                          <th className="px-5 py-3">Selling price</th>
                          <th className="px-5 py-3">Reorder level</th>
                        </>
                      ) : (
                        <>
                          <th className="px-5 py-3">Contact</th>
                          <th className="px-5 py-3">Type</th>
                          <th className="px-5 py-3">{kind === 'Customers' ? 'Outstanding' : 'Balance'}</th>
                        </>
                      )}
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-800">{record.name || 'Unnamed record'}</p>
                          <p className="mt-1 max-w-56 truncate text-[11px] text-slate-500">{record.company || record.description || record.phone || record.id}</p>
                        </td>
                        {kind === 'Products' ? (
                          <>
                            <td className="px-5 py-3.5 text-slate-600">{record.sku || '—'}{record.category && <span className="block mt-1 text-[10px] text-slate-400">{record.category}</span>}</td>
                            <td className="px-5 py-3.5 font-medium text-slate-700">{Number(record.stock) || 0}</td>
                            <td className="px-5 py-3.5 font-medium text-slate-700">{money(record.sellingPrice)}</td>
                            <td className="px-5 py-3.5 text-slate-600">{reorderLevel(record)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-5 py-3.5 text-slate-600">
                              <span className="inline-flex items-center gap-1"><Mail className="size-3 text-slate-400" />{record.email || record.phone || '—'}</span>
                              {record.city && <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400"><MapPin className="size-3" />{record.city}</span>}
                            </td>
                            <td className="px-5 py-3.5 text-slate-600">{record.type || (record.email ? 'Business' : '—')}</td>
                            <td className="px-5 py-3.5 font-medium text-slate-700">{money(kind === 'Customers' ? record.outstandingBalance ?? record.openingBalance : record.balance ?? record.openingBalance)}</td>
                          </>
                        )}
                        <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${record.status === 'Inactive' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>{record.status || 'Active'}</span></td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => { setEditingRecord(record); setShowForm(true); setNotice(null) }} aria-label={`Edit ${record.name || kind.slice(0, -1)}`} className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"><Pencil className="size-4" /></button>
                            <button type="button" onClick={() => { setDeleteTarget(record); setNotice(null) }} aria-label={`Delete ${record.name || kind.slice(0, -1)}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRecords.length)} of {visibleRecords.length}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
                  <span>{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button>
                </div>
              </footer>
            </>
          ) : (
            <div className="p-10 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="size-5" /></span>
              <p className="mt-3 text-sm font-medium text-slate-800">{records.length ? `No matching ${kind.toLowerCase()}` : `No ${kind.toLowerCase()} yet`}</p>
              <p className="mt-1 text-xs text-slate-500">{records.length ? 'Try another search or status filter.' : `Add your first ${kind.slice(0, -1).toLowerCase()} to get started.`}</p>
              {!records.length && <Button className="mt-4" size="sm" onClick={() => setShowForm(true)}><Plus className="size-3.5" /> Add {kind.slice(0, -1).toLowerCase()}</Button>}
            </div>
          )}
        </section>
      </main>
      {showForm && <RecordForm kind={kind} record={editingRecord} onClose={() => setShowForm(false)} onSave={save} />}
      {deleteTarget && <DeleteConfirmation kind={kind} record={deleteTarget} busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={remove} />}
    </>
  )
}

export default DirectoryModule
