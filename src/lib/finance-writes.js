import {
  collection,
  doc,
  runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const expenseCategories = [
  'Rent',
  'Electricity',
  'Water',
  'Internet',
  'Salaries',
  'Transport',
  'Fuel',
  'Office Supplies',
  'Repairs & Maintenance',
  'Marketing',
  'Taxes',
  'Bank Charges',
  'Software/Subscriptions',
  'Telephone',
  'Other',
]

function requireOwner(uid) {
  if (!db || !uid) throw new Error('You must be signed in to manage business records.')
}

function paymentStatus(total, paid) {
  if (total > 0 && paid >= total) return 'Paid'
  if (paid > 0) return 'Partially Paid'
  return 'Unpaid'
}

export { expenseCategories }

export async function saveExpense({ uid, id, fields }) {
  requireOwner(uid)
  const amount = Number(fields.amount)
  const amountPaid = Number(fields.amountPaid)
  if (!fields.title?.trim() || !fields.category || !fields.date) {
    throw new Error('Title, category, and date are required.')
  }
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > amount) {
    throw new Error('Enter a valid expense amount and a payment between zero and the total.')
  }

  const reference = id
    ? doc(db, 'businesses', uid, 'expenses', id)
    : doc(collection(db, 'businesses', uid, 'expenses'))
  const now = new Date().toISOString()
  const record = {
    ...fields,
    title: fields.title.trim(),
    amount,
    amountPaid,
    remaining: amount - amountPaid,
    paymentStatus: paymentStatus(amount, amountPaid),
    ownerId: uid,
    updatedAt: now,
  }

  await runTransaction(db, async (transaction) => {
    if (id) {
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists() || (snapshot.data().ownerId && snapshot.data().ownerId !== uid)) {
        throw new Error('This expense is no longer available to your account.')
      }
      transaction.update(reference, record)
      return
    }

    transaction.set(reference, { ...record, createdAt: now })
  })

  return reference.id
}

export async function deleteExpense({ uid, id }) {
  requireOwner(uid)
  const reference = doc(db, 'businesses', uid, 'expenses', id)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists() || (snapshot.data().ownerId && snapshot.data().ownerId !== uid)) {
      throw new Error('This expense is no longer available to your account.')
    }
    transaction.delete(reference)
  })
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    productId: item.productId || null,
    name: item.productName || item.name || '',
    sku: item.sku || '',
    unit: item.unit || '',
    qty: Number(item.quantity ?? item.qty) || 0,
    unitPrice: Number(item.unitPrice ?? item.purchasePrice) || 0,
    discountPct: Number(item.discountRate ?? item.discountPct) || 0,
    taxPct: Number(item.taxRate ?? item.taxPct) || 0,
    lineTotal: Number(item.total ?? item.lineTotal) || 0,
  }))
}

export async function generateInvoice({ uid, transactionKind, transactionId }) {
  requireOwner(uid)
  const isSale = transactionKind === 'Sales'
  if (!isSale && transactionKind !== 'Purchases') {
    throw new Error('Choose a sale or purchase to generate an invoice.')
  }

  const sourceCollection = isSale ? 'sales' : 'purchases'
  const sourceRef = doc(db, sourceCollection, transactionId)
  const invoiceRef = doc(collection(db, 'businesses', uid, 'invoices'))
  const counterRef = doc(db, 'businesses', uid, 'counters', 'invoices')
  const now = new Date().toISOString()

  return runTransaction(db, async (transaction) => {
    const sourceSnapshot = await transaction.get(sourceRef)
    if (!sourceSnapshot.exists() || sourceSnapshot.data().ownerId !== uid) {
      throw new Error('This transaction is no longer available to your account.')
    }
    const source = sourceSnapshot.data()
    if (source.invoiceId) {
      return { id: source.invoiceId, invoiceNumber: source.invoiceNumber, alreadyExists: true }
    }
    const counterSnapshot = await transaction.get(counterRef)
    const counter = counterSnapshot.exists() ? counterSnapshot.data() : {}
    const sequenceField = isSale ? 'lastSalesInvoice' : 'lastPurchaseInvoice'
    const nextSequence = (Number(counter[sequenceField]) || 0) + 1
    const invoiceNumber = `${isSale ? 'INV' : 'PINV'}-${String(nextSequence).padStart(4, '0')}`
    const amount = Number(source.grandTotal ?? source.amount) || 0
    const amountPaid = Number(source.amountPaid) || 0
    const items = normalizeItems(source.items)

    transaction.set(invoiceRef, {
      ownerId: uid,
      invoiceNumber,
      type: isSale ? 'Sales' : 'Purchase',
      sourceCollection,
      sourceId: transactionId,
      sourceNumber: isSale
        ? source.saleNumber || source.invoiceNumber || ''
        : source.purchaseNumber || '',
      partyType: isSale ? 'customer' : 'supplier',
      partyId: isSale ? source.customerId || null : source.supplierId || null,
      partyName: isSale ? source.customerName || '' : source.supplierName || '',
      date: source.date || source.createdAt || now,
      reference: source.reference || source.purchaseOrder || '',
      items,
      customColumns: [],
      subtotal: Number(source.subtotal) || 0,
      discountTotal: Number(source.discountTotal ?? source.discount) || 0,
      taxTotal: Number(source.taxTotal ?? source.tax) || 0,
      grandTotal: amount,
      amountPaid,
      balance: Number(source.balance ?? (amount - amountPaid)) || 0,
      paymentStatus: source.paymentStatus || paymentStatus(amount, amountPaid),
      paymentMethod: source.paymentMethod || '',
      currency: source.currency || 'PKR',
      manuallyCreated: false,
      createdBy: uid,
      createdAt: now,
    })
    transaction.update(sourceRef, { invoiceId: invoiceRef.id, invoiceNumber, updatedAt: now })
    transaction.set(counterRef, { [sequenceField]: nextSequence, ownerId: uid }, { merge: true })

    return { id: invoiceRef.id, invoiceNumber, alreadyExists: false }
  })
}
