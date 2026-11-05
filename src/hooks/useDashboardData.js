import { useCallback, useEffect, useState } from 'react'
import { firebaseConfigError, isFirebaseConfigured } from '@/lib/firebase-config'

const emptyCollections = {
  sales: [],
  purchases: [],
  products: [],
  customers: [],
  suppliers: [],
  expenses: [],
  invoices: [],
}

const initialDashboardState = {
  data: emptyCollections,
  pending: {
    sales: true,
    purchases: true,
    products: true,
    customers: true,
    suppliers: true,
    expenses: true,
    invoices: true,
  },
  errors: {},
  membershipStatus: 'loading',
}

function getErrorMessage(error, resource) {
  if (error?.code === 'permission-denied') {
    return `Permission denied for ${resource}. Check Firestore rules for this account.`
  }
  return error?.message || `Could not load ${resource}.`
}

export function useDashboardData() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured)
  const [authError, setAuthError] = useState(firebaseConfigError)
  const [dashboard, setDashboard] = useState(initialDashboardState)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined

    let active = true
    let currentUid = null
    let unsubscribe

    Promise.all([import('firebase/auth'), import('@/lib/firebase')])
      .then(([authSdk, firebase]) => {
        if (!active) return
        if (!firebase.auth) {
          setAuthError(firebaseConfigError)
          setAuthLoading(false)
          return
        }
        unsubscribe = authSdk.onAuthStateChanged(
          firebase.auth,
          (signedInUser) => {
            if (!active) return
            const nextUid = signedInUser?.uid || null
            if (nextUid !== currentUid) {
              currentUid = nextUid
              setDashboard(initialDashboardState)
            }
            setUser(signedInUser)
            setAuthError(null)
            setAuthLoading(false)
          },
          (error) => {
            if (!active) return
            console.error('Firebase authentication state error:', error)
            setAuthError(getErrorMessage(error, 'authentication'))
            setAuthLoading(false)
          },
        )
      })
      .catch((error) => {
        if (!active) return
        console.error('Firebase initialization failed:', error)
        setAuthError(getErrorMessage(error, 'Firebase initialization'))
        setAuthLoading(false)
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return undefined

    let active = true
    let unsubscribe

    import('@/lib/dashboard-data')
      .then(({ subscribeToDashboard }) => {
        if (!active) return
        unsubscribe = subscribeToDashboard(user.uid, {
          onCollection(name, records) {
            if (!active) return
            setDashboard((current) => ({
              ...current,
              data: { ...current.data, [name]: records },
              pending: { ...current.pending, [name]: false },
              errors: { ...current.errors, [name]: null },
            }))
          },
          onCollectionError(name, error) {
            if (!active) return
            console.error(`Firebase ${name} subscription error:`, error)
            setDashboard((current) => ({
              ...current,
              pending: { ...current.pending, [name]: false },
              errors: { ...current.errors, [name]: getErrorMessage(error, name) },
              ...(name === 'membership' ? { membershipStatus: 'unknown' } : {}),
            }))
          },
          onMembership(status) {
            if (!active) return
            setDashboard((current) => ({
              ...current,
              membershipStatus: status,
              pending: { ...current.pending, membership: false },
              errors: { ...current.errors, membership: null },
            }))
          },
        })
      })
      .catch((error) => {
        if (!active) return
        console.error('Firebase dashboard subscription setup failed:', error)
        setDashboard((current) => ({
          ...current,
          errors: { ...current.errors, connection: getErrorMessage(error, 'dashboard data') },
        }))
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [user, retryKey])

  const signIn = useCallback(async () => {
    if (!isFirebaseConfigured) {
      setAuthError(firebaseConfigError)
      return
    }
    setAuthError(null)
    try {
      const [{ GoogleAuthProvider, signInWithPopup }, firebase] = await Promise.all([
        import('firebase/auth'),
        import('@/lib/firebase'),
      ])
      if (!firebase.auth) {
        setAuthError(firebaseConfigError)
        return
      }
      await signInWithPopup(firebase.auth, new GoogleAuthProvider())
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Google sign-in failed:', error)
        setAuthError(getErrorMessage(error, 'Google sign-in'))
      }
    }
  }, [])

  const logOut = useCallback(async () => {
    try {
      const [{ signOut }, firebase] = await Promise.all([
        import('firebase/auth'),
        import('@/lib/firebase'),
      ])
      if (!firebase.auth) return
      await signOut(firebase.auth)
      setDashboard(initialDashboardState)
    } catch (error) {
      console.error('Firebase sign-out failed:', error)
      setAuthError(getErrorMessage(error, 'sign out'))
    }
  }, [])

  const retry = useCallback(() => {
    setRetryKey((current) => current + 1)
  }, [])

  return {
    user,
    authLoading,
    authError,
    dashboard,
    signIn,
    logOut,
    retry,
  }
}
