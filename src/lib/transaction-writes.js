import {
  collection,
  doc,
  getDocs,
  runTransaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function validateItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Add at least one product.')
  const productIds = new Set()
  for (const item of items) {
    const { product, quantity, unitPrice, discountRate, taxRate } = item
    if (!product?.id || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Each transaction line needs a product and a whole quantity greater than zero.')
    }
    if (
      !Number.isFinite(unitPrice)
      || unitPrice < 0
      || !Number.isFinite(discountRate)
      || discountRate < 0
      || discountRate > 100
      || !Number.isFinite(taxRate)
      || taxRate < 0
    ) {
      throw new Error('Transaction prices and tax or discount rates must be valid non-negative numbers.')
    }
    if (productIds.has(product.id)) {
      throw new Error('Add each product once and combine its quantity on the same line.')
    }
    productIds.add(product.id)
  }
}

function getPaymentStatus(total, paid) {
  if (total > 0 && paid >= total) return 'Paid'
  if (paid > 0) return 'Partially Paid'
  return 'Unpaid'
}

function makeReference(prefix, id) {
  const date = new Date()
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `${prefix}-${day}-${id.slice(0, 5).toUpperCase()}`
}

function discountAndTax(quantity, unitPrice, discountRate, taxRate) {
  const subtotal = quantity * unitPrice
  const discountAmount = subtotal * discountRate / 100
  const taxable = subtotal - discountAmount
  const taxAmount = taxable * taxRate / 100
  return {
    subtotal,
    discountAmount,
    taxAmount,
    total: taxable + taxAmount,
  }
}

function isExpired(batch) {
  if (!batch.expiryDate) return false
  const expiry = new Date(batch.expiryDate)
  if (Number.isNaN(expiry.getTime())) return false
  expiry.setHours(23, 59, 59, 999)
  return expiry.getTime() < Date.now()
}

async function loadBatchReferences(productIds) {
  const batches = new Map()
  await Promise.all(productIds.map(async (productId) => {
    const snapshot = await getDocs(collection(db, 'products', productId, 'batches'))
    batches.set(productId, snapshot.docs.map((batch) => ({
      id: batch.id,
      ref: batch.ref,
      data: batch.data(),
    })))
  }))
  return batches
}

export async function createSale({ uid, customer, items, amountPaid, paymentMethod }) {
  if (!db || !uid) throw new Error('You must be signed in to create a sale.')
  if (!customer?.id) throw new Error('Select a customer before completing the sale.')
  validateItems(items)
  amountPaid = number(amountPaid)

  const uniqueProductIds = [...new Set(items.map((item) => item.product.id))]
  const batchReferences = await loadBatchReferences(uniqueProductIds)
  const saleRef = doc(collection(db, 'sales'))
  const customerRef = doc(db, 'customers', customer.id)
  const now = new Date().toISOString()
  const lines = items.map(({ product, quantity, unitPrice, discountRate, taxRate }) => {
    const totals = discountAndTax(quantity, unitPrice, discountRate, taxRate)
    return {
      productId: product.id,
      productName: product.name || '',
      sku: product.sku || '',
      quantity,
      unitPrice,
      discountRate,
      discountAmount: totals.discountAmount,
      taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      batchBreakdown: [],
    }
  })
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discount = items.reduce((sum, item) => (
    sum + item.quantity * item.unitPrice * item.discountRate / 100
  ), 0)
  const tax = items.reduce((sum, item) => {
    const lineSubtotal = item.quantity * item.unitPrice
    const taxable = lineSubtotal - lineSubtotal * item.discountRate / 100
    return sum + taxable * item.taxRate / 100
  }, 0)
  const grandTotal = subtotal - discount + tax
  if (amountPaid < 0 || amountPaid > grandTotal) {
    throw new Error('Amount paid must be between zero and the sale total.')
  }

  await runTransaction(db, async (transaction) => {
    const productReferences = new Map(uniqueProductIds.map((id) => [id, doc(db, 'products', id)]))
    const productSnapshots = await Promise.all(
      [...productReferences.values()].map((reference) => transaction.get(reference)),
    )
    const customerSnapshot = await transaction.get(customerRef)
    const allBatchReferences = uniqueProductIds.flatMap((id) => batchReferences.get(id) || [])
    const batchSnapshots = await Promise.all(
      allBatchReferences.map(({ ref }) => transaction.get(ref)),
    )
    const products = new Map(uniqueProductIds.map((id, index) => [
      id,
      productSnapshots[index],
    ]))
    const batches = new Map(allBatchReferences.map((batch, index) => [
      `${batch.ref.parent.parent?.id}:${batch.id}`,
      batchSnapshots[index],
    ]))
    const remainingByBatch = new Map()
    const stockAfterSale = new Map()
    const batchBreakdownByProduct = new Map()

    if (!customerSnapshot.exists() || customerSnapshot.data().ownerId !== uid) {
      throw new Error('The selected customer is no longer available to this account.')
    }

    for (const productId of uniqueProductIds) {
      const productSnapshot = products.get(productId)
      const product = productSnapshot?.data()
      if (!productSnapshot?.exists() || product?.ownerId !== uid) {
        throw new Error('A selected product is no longer available to this account.')
      }

      const productBatches = batchReferences.get(productId) || []
      const requiredQuantity = items
        .filter((item) => item.product.id === productId)
        .reduce((sum, item) => sum + item.quantity, 0)

      if (!productBatches.length) {
        const newStock = number(product.stock) - requiredQuantity
        if (newStock < 0) throw new Error(`Not enough stock for ${product.name || 'a selected product'}.`)
        stockAfterSale.set(productId, newStock)
        continue
      }

      const availableBatches = productBatches
        .map((batch) => {
          const snapshot = batches.get(`${productId}:${batch.id}`)
          return { ...batch, snapshot, current: number(snapshot?.data()?.quantity) }
        })
        .filter((batch) => batch.snapshot?.exists() && !isExpired(batch.data) && batch.current > 0)
        .sort((a, b) => {
          if (!a.data.expiryDate) return b.data.expiryDate ? 1 : 0
          if (!b.data.expiryDate) return -1
          return new Date(a.data.expiryDate) - new Date(b.data.expiryDate)
        })

      const available = availableBatches.reduce((sum, batch) => sum + batch.current, 0)
      if (available < requiredQuantity) {
        throw new Error(`Not enough unexpired batch stock for ${product.name || 'a selected product'}.`)
      }

      let needed = requiredQuantity
      const batchBreakdown = []
      for (const batch of availableBatches) {
        if (!needed) break
        const consumed = Math.min(batch.current, needed)
        batchBreakdown.push({
          batchId: batch.id,
          batchNumber: batch.data.batchNumber || '',
          expiryDate: batch.data.expiryDate || '',
          quantity: consumed,
        })
        remainingByBatch.set(batch.ref.path, {
          ref: batch.ref,
          quantity: batch.current - consumed,
        })
        needed -= consumed
      }
      batchBreakdownByProduct.set(productId, batchBreakdown)
      const totalBatchStock = productBatches.reduce((sum, batch) => {
        const remaining = remainingByBatch.get(batch.ref.path)
        return sum + (remaining ? remaining.quantity : number(batches.get(`${productId}:${batch.id}`)?.data()?.quantity))
      }, 0)
      stockAfterSale.set(productId, totalBatchStock)
    }

    for (const [productId, stock] of stockAfterSale) {
      transaction.update(productReferences.get(productId), { stock, updatedAt: now })
    }
    for (const { ref, quantity } of remainingByBatch.values()) {
      transaction.update(ref, { quantity, updatedAt: now })
    }

    const paid = number(amountPaid)
    const transactionLines = lines.map((line) => ({
      ...line,
      batchBreakdown: batchBreakdownByProduct.get(line.productId) || [],
    }))
    transaction.set(saleRef, {
      ownerId: uid,
      saleNumber: makeReference('SAL', saleRef.id),
      customerId: customer.id,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      items: transactionLines,
      subtotal,
      discount,
      discountTotal: discount,
      tax,
      taxTotal: tax,
      grandTotal,
      amountPaid: paid,
      balance: grandTotal - paid,
      paymentMethod,
      currency: 'PKR',
      paymentStatus: getPaymentStatus(grandTotal, paid),
      saleStatus: 'Completed',
      returnedItems: [],
      createdAt: now,
      updatedAt: now,
    })
  })

  return saleRef.id
}

export async function createPurchase({ uid, supplier, items, amountPaid, paymentMethod, reference }) {
  if (!db || !uid) throw new Error('You must be signed in to create a purchase.')
  if (!supplier?.id) throw new Error('Select a supplier before completing the purchase.')
  validateItems(items)
  amountPaid = number(amountPaid)

  const uniqueProductIds = [...new Set(items.map((item) => item.product.id))]
  const batchReferences = await loadBatchReferences(uniqueProductIds)
  const purchaseRef = doc(collection(db, 'purchases'))
  const supplierRef = doc(db, 'suppliers', supplier.id)
  const now = new Date().toISOString()
  const lines = items.map(({ product, quantity, unitPrice, discountRate, taxRate, batchNumber, expiryDate, manufacturingDate }) => {
    const totals = discountAndTax(quantity, unitPrice, discountRate, taxRate)
    return {
      productId: product.id,
      name: product.name || '',
      sku: product.sku || '',
      unit: product.unit || '',
      qty: quantity,
      returnedQty: 0,
      purchasePrice: unitPrice,
      discountPct: discountRate,
      taxPct: taxRate,
      lineTotal: totals.total,
      batchNumber: batchNumber || '',
      expiryDate: expiryDate || '',
      manufacturingDate: manufacturingDate || '',
      customFields: {},
    }
  })
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountTotal = items.reduce((sum, item) => (
    sum + item.quantity * item.unitPrice * item.discountRate / 100
  ), 0)
  const taxTotal = items.reduce((sum, item) => {
    const gross = item.quantity * item.unitPrice
    const taxable = gross - gross * item.discountRate / 100
    return sum + taxable * item.taxRate / 100
  }, 0)
  const grandTotal = subtotal - discountTotal + taxTotal
  if (amountPaid < 0 || amountPaid > grandTotal) {
    throw new Error('Amount paid must be between zero and the purchase total.')
  }

  const batchWrites = items.map((item) => ({
    item,
    ref: doc(collection(db, 'products', item.product.id, 'batches')),
  }))

  await runTransaction(db, async (transaction) => {
    const productReferences = new Map(uniqueProductIds.map((id) => [id, doc(db, 'products', id)]))
    const productSnapshots = await Promise.all(
      [...productReferences.values()].map((productReference) => transaction.get(productReference)),
    )
    const supplierSnapshot = await transaction.get(supplierRef)
    const existingBatchReferences = uniqueProductIds.flatMap((id) => batchReferences.get(id) || [])
    const existingBatchSnapshots = await Promise.all(
      existingBatchReferences.map(({ ref }) => transaction.get(ref)),
    )
    const existingBatchSnapshotByPath = new Map(
      existingBatchReferences.map((batch, index) => [batch.ref.path, existingBatchSnapshots[index]]),
    )

    const products = new Map(uniqueProductIds.map((id, index) => [id, productSnapshots[index]]))
    for (const productId of uniqueProductIds) {
      const product = products.get(productId)
      if (!product?.exists() || product.data().ownerId !== uid) {
        throw new Error('A selected product is no longer available to this account.')
      }
    }
    if (!supplierSnapshot.exists() || supplierSnapshot.data().ownerId !== uid) {
      throw new Error('The selected supplier is no longer available to this account.')
    }

    const paid = number(amountPaid)
    const balance = grandTotal - paid
    const currentSupplierBalance = number(supplierSnapshot.data().balance)
    transaction.update(supplierRef, {
      balance: currentSupplierBalance + balance,
      updatedAt: now,
    })

    const receivedByProduct = new Map()
    items.forEach((item) => {
      receivedByProduct.set(item.product.id, (receivedByProduct.get(item.product.id) || 0) + item.quantity)
    })

    for (const [productId, receivedQuantity] of receivedByProduct) {
      const productSnapshot = products.get(productId)
      transaction.update(productReferences.get(productId), {
        stock: number(productSnapshot.data().stock) + receivedQuantity,
        purchasePrice: items.find((item) => item.product.id === productId).unitPrice,
        updatedAt: now,
      })
    }

    const purchaseLines = lines.map((line, index) => {
      const { item, ref } = batchWrites[index]
      const existingBatches = (batchReferences.get(item.product.id) || [])
        .map((batch) => ({
          ...batch,
          snapshot: existingBatchSnapshotByPath.get(batch.ref.path),
        }))
      const batchToMerge = item.batchNumber
        ? existingBatches.find((batch) => (
          batch.snapshot?.exists()
          && batch.data.batchNumber === item.batchNumber
          && (batch.data.expiryDate || '') === (item.expiryDate || '')
        ))
        : null
      const hasBatches = existingBatches.length > 0
      if (batchToMerge) {
        transaction.update(batchToMerge.ref, {
          quantity: number(batchToMerge.snapshot.data().quantity) + item.quantity,
          updatedAt: now,
        })
        return { ...line, batchId: batchToMerge.id }
      }
      if (!hasBatches && !item.batchNumber && !item.expiryDate) return line

      transaction.set(ref, {
        batchNumber: item.batchNumber || purchaseRef.id,
        manufacturingDate: item.manufacturingDate || '',
        expiryDate: item.expiryDate || '',
        quantity: item.quantity,
        costPrice: item.unitPrice,
        sellingPrice: number(item.product.sellingPrice),
        supplier: supplier.name || '',
        purchaseRef: purchaseRef.id,
        notes: '',
        ownerId: uid,
        createdAt: now,
        updatedAt: now,
      })
      return { ...line, batchId: ref.id }
    })

    transaction.set(purchaseRef, {
      ownerId: uid,
      purchaseNumber: makeReference('PUR', purchaseRef.id),
      supplierId: supplier.id,
      supplierName: supplier.name || '',
      reference: (reference || '').trim(),
      purchaseOrder: (reference || '').trim(),
      date: now.slice(0, 10),
      items: purchaseLines,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      amountPaid: paid,
      balance,
      paymentStatus: getPaymentStatus(grandTotal, paid),
      paymentMethod,
      currency: 'PKR',
      status: 'Completed',
      createdAt: now,
      updatedAt: now,
    })
  })

  return purchaseRef.id
}
