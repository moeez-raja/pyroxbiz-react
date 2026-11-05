import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const collectionQueries = {
  sales: (uid) => query(collection(db, 'sales'), where('ownerId', '==', uid)),
  purchases: (uid) => query(collection(db, 'purchases'), where('ownerId', '==', uid)),
  products: (uid) => query(collection(db, 'products'), where('ownerId', '==', uid)),
  customers: (uid) => query(collection(db, 'customers'), where('ownerId', '==', uid)),
  suppliers: (uid) => query(collection(db, 'suppliers'), where('ownerId', '==', uid)),
  expenses: (uid) => collection(db, 'businesses', uid, 'expenses'),
  invoices: (uid) => collection(db, 'businesses', uid, 'invoices'),
}

function mapSnapshot(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

function normalizeMembershipStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase()
  if (normalized === 'active') return 'approved'
  if (normalized === 'declined') return 'rejected'
  if (['submitted', 'under_review', 'review'].includes(normalized)) return 'payment_submitted'
  if (normalized === 'awaiting') return 'pending'
  return normalized
}

export function getMembershipStatus(data) {
  const status = normalizeMembershipStatus(data?.status)
  if (status !== 'approved' || !data?.expiresAt) return status

  const expiry = typeof data.expiresAt.toDate === 'function'
    ? data.expiresAt.toDate()
    : new Date(data.expiresAt)

  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now()
    ? 'expired'
    : status
}

export function subscribeToDashboard(uid, handlers) {
  if (!db) throw new Error('Firebase is not configured.')

  let isActive = true
  let membershipFallbackUnsubscribe = null
  const unsubscribers = []

  Object.entries(collectionQueries).forEach(([name, buildQuery]) => {
    const unsubscribe = onSnapshot(
      buildQuery(uid),
      (snapshot) => {
        handlers.onCollection(name, mapSnapshot(snapshot))
      },
      (error) => {
        handlers.onCollectionError(name, error)
      },
    )
    unsubscribers.push(unsubscribe)
  })

  const membershipRef = doc(db, 'businesses', uid, 'membership', 'profile')
  const unsubscribeMembership = onSnapshot(
    membershipRef,
    async (snapshot) => {
      if (!isActive) return

      if (snapshot.exists()) {
        handlers.onMembership(getMembershipStatus(snapshot.data()))
        return
      }

      try {
        const membershipCollection = await getDocs(collection(db, 'businesses', uid, 'membership'))
        if (!isActive) return

        if (membershipCollection.empty) {
          handlers.onMembership('pending')
          return
        }

        const fallbackDocument = membershipCollection.docs[0]
        handlers.onMembership(getMembershipStatus(fallbackDocument.data()))
        membershipFallbackUnsubscribe?.()
        membershipFallbackUnsubscribe = onSnapshot(
          fallbackDocument.ref,
          (fallbackSnapshot) => {
            if (!isActive) return
            handlers.onMembership(
              fallbackSnapshot.exists()
                ? getMembershipStatus(fallbackSnapshot.data())
                : 'pending',
            )
          },
          (error) => handlers.onCollectionError('membership', error),
        )
      } catch (error) {
        handlers.onCollectionError('membership', error)
      }
    },
    (error) => handlers.onCollectionError('membership', error),
  )
  unsubscribers.push(unsubscribeMembership)

  return () => {
    isActive = false
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    membershipFallbackUnsubscribe?.()
  }
}
