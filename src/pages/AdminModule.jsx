import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Check,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import {
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import EmptyState from '@/components/dashboard/EmptyState'
import MetricCard from '@/components/dashboard/MetricCard'
import { db } from '@/lib/firebase'

const plans = {
  monthly: { name: 'Monthly', price: 3499, durationMonths: 1 },
  yearly: { name: 'Yearly', price: 34990, durationMonths: 12 },
}

function statusOf(status) {
  const value = String(status || 'pending').trim().toLowerCase()
  if (['approved', 'active'].includes(value)) return 'approved'
  if (['rejected', 'declined'].includes(value)) return 'rejected'
  if (['payment_submitted', 'under_review', 'submitted', 'review'].includes(value)) return 'payment_submitted'
  if (value === 'expired') return 'expired'
  return 'pending'
}

function dateOf(value) {
  if (!value) return null
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function showDate(value) {
  return dateOf(value)?.toLocaleDateString() || '—'
}

function latestSubmission(membership) {
  return [...(Array.isArray(membership.submissions) ? membership.submissions : [])]
    .sort((a, b) => (dateOf(b.submittedAt)?.getTime() || 0) - (dateOf(a.submittedAt)?.getTime() || 0))[0]
}

function MemberBadge({ status }) {
  const value = statusOf(status)
  const labels = {
    approved: 'Approved',
    pending: 'Pending',
    payment_submitted: 'Under review',
    rejected: 'Rejected',
    expired: 'Expired',
  }
  const styles = {
    approved: 'bg-emerald-50 text-emerald-800',
    pending: 'bg-amber-50 text-amber-800',
    payment_submitted: 'bg-sky-50 text-sky-800',
    rejected: 'bg-rose-50 text-rose-800',
    expired: 'bg-slate-100 text-slate-600',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${styles[value]}`}>{labels[value]}</span>
}

function AdminModule({ user, onLogOut }) {
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [members, setMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [section, setSection] = useState('overview')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [busyUid, setBusyUid] = useState('')
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    let unsubscribe

    async function verifyAndSubscribe() {
      try {
        const adminSnapshot = await getDoc(doc(db, 'admins', user.uid))
        if (!active) return
        if (!adminSnapshot.exists()) {
          setAuthorized(false)
          setChecking(false)
          return
        }

        setAuthorized(true)
        setLoadingMembers(true)
        unsubscribe = onSnapshot(
          collectionGroup(db, 'membership'),
          async (snapshot) => {
            const docsByUid = new Map()
            snapshot.docs.forEach((membershipSnapshot) => {
              const uid = membershipSnapshot.data().uid || membershipSnapshot.ref.parent.parent?.id
              if (!uid) return
              const existing = docsByUid.get(uid)
              if (!existing || membershipSnapshot.id === 'profile') {
                docsByUid.set(uid, membershipSnapshot)
              }
            })

            const rows = await Promise.all([...docsByUid.entries()].map(async ([uid, membershipSnapshot]) => {
              let profile = null
              try {
                const profileSnapshot = await getDoc(doc(db, 'users', uid))
                profile = profileSnapshot.exists() ? profileSnapshot.data() : null
              } catch (error) {
                console.error(`Load admin member profile ${uid} failed:`, error)
              }
              return {
                uid,
                ref: membershipSnapshot.ref,
                membership: membershipSnapshot.data(),
                profile,
              }
            }))
            if (!active) return
            setMembers(rows.sort((a, b) => (
              (dateOf(b.membership.updatedAt)?.getTime() || 0)
              - (dateOf(a.membership.updatedAt)?.getTime() || 0)
            )))
            setLoadError('')
            setLoadingMembers(false)
          },
          (error) => {
            if (!active) return
            console.error('Admin membership subscription failed:', error)
            setLoadError(error.message || 'Could not load membership records. Check Firestore access.')
            setLoadingMembers(false)
          },
        )
      } catch (error) {
        if (!active) return
        console.error('Verify admin access failed:', error)
        setLoadError(error.message || 'Could not verify admin access.')
      } finally {
        if (active) setChecking(false)
      }
    }

    verifyAndSubscribe()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [user.uid])

  const pendingCount = members.filter((member) => ['pending', 'payment_submitted'].includes(statusOf(member.membership.status))).length
  const approvedCount = members.filter((member) => statusOf(member.membership.status) === 'approved' && (!dateOf(member.membership.expiresAt) || dateOf(member.membership.expiresAt) > new Date())).length
  const rejectedCount = members.filter((member) => statusOf(member.membership.status) === 'rejected' || statusOf(member.membership.status) === 'expired').length
  const filteredMembers = useMemo(() => members.filter((member) => {
    const status = statusOf(member.membership.status)
    if (section === 'requests' && filter !== 'all' && status !== filter) return false
    if (section === 'members' && filter !== 'all' && status !== filter) return false
    const searchable = [
      member.profile?.displayName,
      member.profile?.email,
      member.membership.name,
      member.membership.email,
      member.membership.businessName,
      member.uid,
      member.membership.planName,
    ].filter(Boolean).join(' ').toLowerCase()
    return !search || searchable.includes(search.toLowerCase())
  }), [members, section, filter, search])

  async function updateMembership(member, action, rejectionReason = '') {
    setBusyUid(member.uid)
    setNotice(null)
    const planId = member.membership.planId || latestSubmission(member.membership)?.planId || 'monthly'
    const plan = plans[planId] || plans.monthly
    const now = new Date()
    const expires = new Date(now)
    expires.setMonth(expires.getMonth() + plan.durationMonths)
    const fields = action === 'reject'
      ? {
        uid: member.uid,
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: user.uid,
        rejectionReason: rejectionReason.trim(),
        updatedAt: serverTimestamp(),
      }
      : {
        uid: member.uid,
        status: 'approved',
        planId,
        planName: plan.name,
        planPrice: plan.price,
        planDurationMonths: plan.durationMonths,
        ...(action === 'approve'
          ? { approvedAt: serverTimestamp(), approvedBy: user.uid }
          : { renewedAt: serverTimestamp(), renewedBy: user.uid }),
        startsAt: now,
        expiresAt: expires,
        updatedAt: serverTimestamp(),
      }
    try {
      const adminRef = doc(db, 'admins', user.uid)
      await runTransaction(db, async (transaction) => {
        const [adminSnapshot, membershipSnapshot] = await Promise.all([
          transaction.get(adminRef),
          transaction.get(member.ref),
        ])
        if (!adminSnapshot.exists()) throw new Error('Administrator access is no longer active.')
        if (!membershipSnapshot.exists()) throw new Error('This membership record no longer exists.')
        transaction.update(member.ref, fields)
      })
      setNotice({ type: 'success', text: action === 'reject' ? 'Membership request rejected.' : `Membership ${action === 'approve' ? 'approved' : 'renewed'} for ${plan.name}.` })
    } catch (error) {
      console.error(`Admin membership ${action} failed:`, error)
      setNotice({ type: 'error', text: error.message || `Could not ${action} this membership.` })
    } finally {
      setBusyUid('')
    }
  }

  async function handleAction(member, action) {
    if (busyUid) return
    if (action === 'reject') {
      const reason = window.prompt('Reason for rejection (optional):', '')
      if (reason === null) return
      if (!window.confirm(`Reject membership for ${member.profile?.email || member.uid}?`)) return
      await updateMembership(member, action, reason)
      return
    }
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Renew'} membership for ${member.profile?.email || member.uid}?`)) return
    await updateMembership(member, action)
  }

  if (checking) {
    return <main className="mx-auto max-w-[1000px] px-4 py-10"><div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Verifying administrator access…</div></main>
  }

  if (!authorized) {
    return (
      <main className="mx-auto max-w-[700px] px-4 py-10">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-700"><ShieldAlert className="size-6" /></span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{loadError ? 'Admin access unavailable' : 'Not authorized'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{loadError || 'Your signed-in account is not registered as an administrator.'}</p>
          <div className="mt-5 flex justify-center gap-2">
            {loadError && <Button variant="outline" onClick={() => window.location.reload()}><RefreshCw className="size-4" />Retry</Button>}
            <Button variant="outline" onClick={onLogOut}>Sign out</Button>
          </div>
        </section>
      </main>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'requests', label: 'Requests', icon: Clock3 },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: ShieldCheck },
  ]
  const activeSectionMembers = section === 'requests'
    ? filteredMembers.filter((member) => ['pending', 'payment_submitted'].includes(statusOf(member.membership.status)))
    : filteredMembers
  const plansCount = members.reduce((counts, member) => {
    const planId = member.membership.planId
    if (planId === 'monthly' || planId === 'yearly') counts[planId] += 1
    return counts
  }, { monthly: 0, yearly: 0 })
  const recentSubmissions = members.reduce((count, member) => count + (member.membership.submissions || []).filter((submission) => {
    const date = dateOf(submission.submittedAt)
    return date && Date.now() - date.getTime() < 14 * 24 * 60 * 60 * 1000
  }).length, 0)

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="page-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><ShieldCheck className="size-4" />System / Admin</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Admin console</h1><p className="mt-1.5 text-sm text-slate-500">Review membership requests and manage access for Pyrox Biz members.</p></div>
        <span className="text-right text-xs text-slate-500">{user.displayName || user.email}<span className="mt-1 block">Administrator</span></span>
      </section>
      {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.text}</p>}
      {loadError && <section role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-rose-800">{loadError}</p><Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button></section>}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="Admin sections">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setSection(id); setSearch('') }} aria-current={section === id ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${section === id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="size-4" />{label}{id === 'requests' && pendingCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px]">{pendingCount}</span>}</button>)}
      </nav>

      {section === 'overview' && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total members" icon={Users} value={members.length.toLocaleString()} description="Membership profiles found" loading={loadingMembers} error={Boolean(loadError)} />
          <MetricCard label="Approved members" icon={ShieldCheck} value={approvedCount.toLocaleString()} description="Active, unexpired memberships" loading={loadingMembers} error={Boolean(loadError)} />
          <MetricCard label="Requests to review" icon={Clock3} value={pendingCount.toLocaleString()} description="Pending or under review" loading={loadingMembers} error={Boolean(loadError)} />
          <MetricCard label="Rejected / expired" icon={ShieldAlert} value={rejectedCount.toLocaleString()} description="Memberships needing attention" loading={loadingMembers} error={Boolean(loadError)} />
        </section>
        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Latest</p><h2 className="mt-1 text-sm font-semibold text-slate-900">Membership requests</h2></div><Button variant="outline" size="sm" onClick={() => setSection('requests')}>View requests</Button></div>
          {loadingMembers ? <p className="p-8 text-center text-sm text-slate-500">Loading member data…</p> : members.filter((member) => statusOf(member.membership.status) === 'payment_submitted').slice(0, 5).length ? members.filter((member) => statusOf(member.membership.status) === 'payment_submitted').slice(0, 5).map((member) => <MemberRow key={member.uid} member={member} busy={busyUid === member.uid} onAction={handleAction} />) : <EmptyState icon={Users} title="No requests to review" description="New membership payment submissions will appear here." className="min-h-44" />}
        </section>
      </>}

      {['requests', 'members'].includes(section) && <>
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
          <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, plan, or user ID…" aria-label="Search members" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-600" /></label>
          {section === 'requests' && <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter membership requests" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="all">Pending & under review</option><option value="pending">Pending only</option><option value="payment_submitted">Under review only</option></select>}
          {section === 'members' && <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter members" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="all">All members</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="expired">Expired</option><option value="payment_submitted">Under review</option><option value="pending">Pending</option></select>}
        </section>
        <section className="workspace-card overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loadingMembers ? <p className="p-10 text-center text-sm text-slate-500">Loading members…</p> : activeSectionMembers.length ? activeSectionMembers.map((member) => <MemberRow key={member.uid} member={member} busy={busyUid === member.uid} onAction={handleAction} />) : <EmptyState icon={Users} title={section === 'requests' ? 'No matching requests' : 'No matching members'} description="Try a different search or filter." className="min-h-48" />}
        </section>
      </>}

      {section === 'analytics' && <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold text-slate-900">Membership status</h2><div className="mt-4 space-y-3">{[['Approved', approvedCount, 'bg-emerald-500'], ['Pending', members.filter((member) => statusOf(member.membership.status) === 'pending').length, 'bg-amber-400'], ['Under review', members.filter((member) => statusOf(member.membership.status) === 'payment_submitted').length, 'bg-sky-500'], ['Rejected / expired', rejectedCount, 'bg-rose-400']].map(([label, count, color]) => <div key={label} className="flex items-center gap-3 text-xs"><span className={`size-2 rounded-full ${color}`} /><span className="flex-1 text-slate-600">{label}</span><strong className="text-slate-800">{count}</strong></div>)}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold text-slate-900">Assigned plans</h2><div className="mt-4 space-y-3">{[['Monthly', plansCount.monthly], ['Yearly', plansCount.yearly]].map(([label, count]) => <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs"><span className="text-slate-600">{label}</span><strong className="text-slate-800">{count}</strong></div>)}<p className="pt-1 text-xs text-slate-500">{recentSubmissions} submissions recorded in the last 14 days.</p></div></section>
      </div>}
    </main>
  )
}

function MemberRow({ member, busy, onAction }) {
  const status = statusOf(member.membership.status)
  const name = member.profile?.displayName || member.membership.name || member.membership.businessName || 'Business member'
  const email = member.profile?.email || member.membership.email || member.uid
  const submission = latestSubmission(member.membership)
  const canApproveOrReject = ['pending', 'payment_submitted'].includes(status)
  const canRenew = ['approved', 'rejected', 'expired'].includes(status)
  return (
    <article className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-800">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-semibold text-slate-800">{name}</p><MemberBadge status={status} /></div>
        <p className="mt-1 truncate text-[11px] text-slate-500">{email} · {member.uid}</p>
        <p className="mt-1 text-[10px] text-slate-400">{member.membership.planName || submission?.planName || (member.membership.planId && plans[member.membership.planId]?.name) || 'No plan'} · Updated {showDate(member.membership.updatedAt)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {submission && <span className="self-center text-[10px] text-slate-400">Submitted {showDate(submission.submittedAt)}</span>}
        {canApproveOrReject && <><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(member, 'reject')}><X className="size-3.5" />Reject</Button><Button size="sm" disabled={busy} onClick={() => onAction(member, 'approve')}><Check className="size-3.5" />Approve</Button></>}
        {canRenew && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(member, 'renew')}><RefreshCw className="size-3.5" />Renew</Button>}
      </div>
    </article>
  )
}

export default AdminModule
