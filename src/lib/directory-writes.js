import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const collectionForKind = {
  Products: 'products',
  Customers: 'customers',
  Suppliers: 'suppliers',
}

function assertOwnerUid(uid) {
  if (!db || !uid) throw new Error('You must be signed in to manage business records.')
}

export async function saveDirectoryRecord({ kind, uid, id, fields }) {
  assertOwnerUid(uid)
  const collectionName = collectionForKind[kind]
  if (!collectionName) throw new Error('Unsupported directory.')

  const recordRef = id
    ? doc(db, collectionName, id)
    : doc(collection(db, collectionName))
  const now = new Date().toISOString()

  await runTransaction(db, async (transaction) => {
    if (id) {
      const snapshot = await transaction.get(recordRef)
      if (!snapshot.exists() || snapshot.data().ownerId !== uid) {
        throw new Error('This record is no longer available to your account.')
      }
      transaction.update(recordRef, { ...fields, updatedAt: now })
      return
    }

    transaction.set(recordRef, {
      ...fields,
      ownerId: uid,
      createdAt: now,
      updatedAt: now,
    })
  })

  return recordRef.id
}

async function findLinkedTransactions(kind, uid, id) {
  const checks = kind === 'Products'
    ? [
      ['sales', (record) => (record.items || []).some((item) => item.productId === id)],
      ['purchases', (record) => (record.items || []).some((item) => item.productId === id)],
    ]
    : kind === 'Customers'
      ? [['sales', (record) => record.customerId === id]]
      : [['purchases', (record) => record.supplierId === id]]

  const linked = []
  for (const [collectionName, matches] of checks) {
    const records = await getDocs(query(
      collection(db, collectionName),
      where('ownerId', '==', uid),
    ))
    if (records.docs.some((record) => matches(record.data()))) linked.push(collectionName)
  }
  return linked
}

export async function deleteDirectoryRecord({ kind, uid, id }) {
  assertOwnerUid(uid)
  const collectionName = collectionForKind[kind]
  if (!collectionName) throw new Error('Unsupported directory.')

  const recordRef = doc(db, collectionName, id)
  const recordSnapshot = await getDoc(recordRef)
  if (!recordSnapshot.exists() || recordSnapshot.data().ownerId !== uid) {
    throw new Error('This record is no longer available to your account.')
  }

  const linkedCollections = await findLinkedTransactions(kind, uid, id)
  if (linkedCollections.length) {
    const labels = linkedCollections.map((name) => name === 'sales' ? 'sales' : 'purchases')
    throw new Error(`This record is used by existing ${[...new Set(labels)].join(' and ')} and cannot be deleted.`)
  }

  if (kind === 'Products') {
    const batches = await getDocs(collection(db, 'products', id, 'batches'))
    if (!batches.empty) throw new Error('This product has inventory batches and cannot be deleted.')
  }

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(recordRef)
    if (!snapshot.exists() || snapshot.data().ownerId !== uid) {
      throw new Error('This record is no longer available to your account.')
    }
    transaction.delete(recordRef)
  })
}
