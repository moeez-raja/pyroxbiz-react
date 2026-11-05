import { useEffect, useState } from 'react'
import {
  Building2,
  FileText,
  KeyRound,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase'

const sections = [
  { id: 'business', label: 'Business profile', icon: Building2 },
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'invoice', label: 'Invoice & sales', icon: FileText },
  { id: 'flowai', label: 'FlowAI', icon: SlidersHorizontal },
  { id: 'security', label: 'Security', icon: ShieldCheck },
]
const currencies = ['PKR', 'USD', 'EUR', 'GBP', 'AED']
const businessTypes = ['General Retail', 'Medical / Pharmacy', 'Electronics / Computers', 'Garments / Clothing', 'Food / Grocery', 'Cosmetics', 'Wholesale', 'Manufacturing', 'Services', 'Other']

function SettingsModule({ user, onLogOut }) {
  const [section, setSection] = useState('business')
  const [profile, setProfile] = useState({})
  const [account, setAccount] = useState({})
  const [counter, setCounter] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const providerIds = user.providerData.map((provider) => provider.providerId)
  const canChangePassword = providerIds.includes('password')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [profileSnapshot, accountSnapshot, counterSnapshot] = await Promise.all([
          getDoc(doc(db, 'businesses', user.uid, 'settings', 'profile')),
          getDoc(doc(db, 'businesses', user.uid, 'settings', 'account')),
          getDoc(doc(db, 'businesses', user.uid, 'counters', 'invoices')),
        ])
        if (!active) return
        setProfile(profileSnapshot.exists() ? profileSnapshot.data() : {})
        setAccount(accountSnapshot.exists() ? accountSnapshot.data() : {})
        setCounter(counterSnapshot.exists() ? counterSnapshot.data() : {})
      } catch (error) {
        if (!active) return
        console.error('Load business settings failed:', error)
        setNotice({ type: 'error', text: error.message || 'Could not load settings. Check Firestore access.' })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user.uid])

  function updateProfileField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!profile.businessName?.trim()) {
      setNotice({ type: 'error', text: 'Business name is required.' })
      return
    }
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      setNotice({ type: 'error', text: 'Enter a valid business email.' })
      return
    }
    await saveSettings('Business profile saved.', async () => {
      const fields = {
        ...profile,
        businessName: profile.businessName.trim(),
        ownerId: user.uid,
        updatedAt: new Date().toISOString(),
      }
      await setDoc(doc(db, 'businesses', user.uid, 'settings', 'profile'), fields, { merge: true })
      setProfile(fields)
    })
  }

  async function saveAccount(event) {
    event.preventDefault()
    const displayName = String(account.displayName || '').trim()
    await saveSettings('Account settings saved.', async () => {
      await setDoc(doc(db, 'businesses', user.uid, 'settings', 'account'), {
        ...account,
        displayName,
        ownerId: user.uid,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
      if (displayName && displayName !== user.displayName) await updateProfile(user, { displayName })
      setAccount((current) => ({ ...current, displayName }))
    })
  }

  async function saveInvoiceSettings(event) {
    event.preventDefault()
    const startRaw = String(profile.startingInvoiceNumber || '').trim()
    const startingInvoiceNumber = startRaw ? Number(startRaw) : null
    if (startRaw && (!Number.isInteger(startingInvoiceNumber) || startingInvoiceNumber < 1)) {
      setNotice({ type: 'error', text: 'Starting invoice number must be a whole number greater than zero.' })
      return
    }
    await saveSettings('Invoice settings saved.', async () => {
      const fields = {
        invoicePrefix: String(profile.invoicePrefix || '').trim() || 'INV-',
        startingInvoiceNumber,
        defaultPaymentMethod: profile.defaultPaymentMethod || 'Cash',
        invoiceNotes: profile.invoiceNotes || '',
        showBusinessInfoOnInvoice: profile.showBusinessInfoOnInvoice !== false,
        ownerId: user.uid,
        updatedAt: new Date().toISOString(),
      }
      await setDoc(doc(db, 'businesses', user.uid, 'settings', 'profile'), fields, { merge: true })
      if (startingInvoiceNumber) {
        const lastSalesInvoice = Number(counter.lastSalesInvoice) || 0
        const lastPurchaseInvoice = Number(counter.lastPurchaseInvoice) || 0
        await setDoc(doc(db, 'businesses', user.uid, 'counters', 'invoices'), {
          lastSalesInvoice: Math.max(lastSalesInvoice, startingInvoiceNumber - 1),
          lastPurchaseInvoice: Math.max(lastPurchaseInvoice, startingInvoiceNumber - 1),
          ownerId: user.uid,
        }, { merge: true })
        setCounter((current) => ({
          ...current,
          lastSalesInvoice: Math.max(lastSalesInvoice, startingInvoiceNumber - 1),
          lastPurchaseInvoice: Math.max(lastPurchaseInvoice, startingInvoiceNumber - 1),
        }))
      }
      setProfile((current) => ({ ...current, ...fields }))
    })
  }

  async function saveFlowAI() {
    await saveSettings('FlowAI preference saved.', async () => {
      const fields = {
        flowAIEnabled: profile.flowAIEnabled !== false,
        ownerId: user.uid,
        updatedAt: new Date().toISOString(),
      }
      await setDoc(doc(db, 'businesses', user.uid, 'settings', 'profile'), fields, { merge: true })
      setProfile((current) => ({ ...current, ...fields }))
    })
  }

  async function saveSettings(message, action) {
    setSaving(true)
    setNotice(null)
    try {
      await action()
      setNotice({ type: 'success', text: message })
    } catch (error) {
      console.error('Save settings failed:', error)
      setNotice({ type: 'error', text: error.message || 'Could not save settings.' })
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    setNotice(null)
    if (!canChangePassword) {
      setNotice({ type: 'error', text: 'This account uses Google sign-in. Manage its password through your Google account.' })
      return
    }
    if (newPassword.length < 6 || newPassword !== confirmPassword || !currentPassword) {
      setNotice({ type: 'error', text: 'Enter your current password, a new password of at least 6 characters, and matching confirmation.' })
      return
    }
    setSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice({ type: 'success', text: 'Password updated successfully.' })
    } catch (error) {
      console.error('Change password failed:', error)
      setNotice({ type: 'error', text: error.code === 'auth/invalid-credential' ? 'Current password is incorrect.' : error.message || 'Could not update password.' })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="page-hero"><p className="text-sm font-medium text-emerald-800">Workspace / Settings</p><h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[30px]">Settings</h1><p className="mt-1.5 text-sm text-slate-600">Manage your business profile, account, invoice defaults, and security.</p></section>
      {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.text}</p>}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading settings…</div> : (
        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 lg:flex-col lg:self-start">
            {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium ${section === id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="size-4" />{label}</button>)}
          </nav>
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            {section === 'business' && <form onSubmit={saveProfile} className="space-y-5">
              <div><h2 className="text-base font-semibold text-slate-900">Business profile</h2><p className="mt-1 text-xs text-slate-500">Details used by your business and invoice screens.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[['businessName', 'Business name'], ['ownerName', 'Owner name'], ['phone', 'Phone'], ['email', 'Business email'], ['address', 'Business address']].map(([key, label]) => <label key={key} className={`grid gap-1.5 text-xs font-medium text-slate-600 ${key === 'address' ? 'sm:col-span-2' : ''}`}>{label}{key === 'address' ? <textarea rows="3" value={profile[key] || ''} onChange={(event) => updateProfileField(key, event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" /> : <input required={key === 'businessName'} type={key === 'email' ? 'email' : 'text'} value={profile[key] || ''} onChange={(event) => updateProfileField(key, event.target.value)} className={inputClass} />}</label>)}
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Currency<select value={profile.currency || 'PKR'} onChange={(event) => updateProfileField('currency', event.target.value)} className={inputClass}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Business type<select value={profile.businessType || 'General Retail'} onChange={(event) => updateProfileField('businessType', event.target.value)} className={inputClass}>{businessTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              </div>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save business profile'}</Button>
            </form>}
            {section === 'account' && <form onSubmit={saveAccount} className="space-y-5">
              <div><h2 className="text-base font-semibold text-slate-900">Account</h2><p className="mt-1 text-xs text-slate-500">Your sign-in identity and profile information.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Display name<input value={account.displayName ?? user.displayName ?? ''} onChange={(event) => setAccount((current) => ({ ...current, displayName: event.target.value }))} className={inputClass} /></label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Login email<input readOnly value={user.email || ''} className={`${inputClass} bg-slate-50 text-slate-500`} /><span className="font-normal text-slate-400">Contact support to change your login email.</span></label>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600">Created: {user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleString() : '—'} · Email verified: {user.emailVerified ? 'Yes' : 'No'}</div>
              <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</Button><Button type="button" variant="outline" onClick={onLogOut}>Sign out</Button></div>
            </form>}
            {section === 'invoice' && <form onSubmit={saveInvoiceSettings} className="space-y-5">
              <div><h2 className="text-base font-semibold text-slate-900">Invoice & sales</h2><p className="mt-1 text-xs text-slate-500">Set defaults for invoice creation.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Invoice prefix<input maxLength="12" value={profile.invoicePrefix || 'INV-'} onChange={(event) => updateProfileField('invoicePrefix', event.target.value)} className={inputClass} /></label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Starting invoice number<input type="number" min="1" step="1" placeholder="Leave blank to keep current" value={profile.startingInvoiceNumber ?? ''} onChange={(event) => updateProfileField('startingInvoiceNumber', event.target.value)} className={inputClass} /><span className="font-normal text-slate-400">Next sales counter: {(Number(counter.lastSalesInvoice) || 0) + 1}; purchases use a separate counter.</span></label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">Default payment method<select value={profile.defaultPaymentMethod || 'Cash'} onChange={(event) => updateProfileField('defaultPaymentMethod', event.target.value)} className={inputClass}>{['Cash', 'Bank Transfer', 'Card', 'Other'].map((method) => <option key={method}>{method}</option>)}</select></label>
                <label className="flex items-center gap-3 self-center rounded-lg border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={profile.showBusinessInfoOnInvoice !== false} onChange={(event) => updateProfileField('showBusinessInfoOnInvoice', event.target.checked)} className="accent-emerald-700" />Show business information on invoices</label>
                <label className="grid gap-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Invoice notes / footer<textarea rows="3" value={profile.invoiceNotes || ''} onChange={(event) => updateProfileField('invoiceNotes', event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" /></label>
              </div>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save invoice settings'}</Button>
            </form>}
            {section === 'flowai' && <div className="space-y-5"><div><h2 className="text-base font-semibold text-slate-900">FlowAI</h2><p className="mt-1 text-xs text-slate-500">Control the FlowAI preference saved with your business settings.</p></div><label className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700"><input type="checkbox" checked={profile.flowAIEnabled !== false} onChange={(event) => updateProfileField('flowAIEnabled', event.target.checked)} className="accent-emerald-700" />Enable FlowAI</label><Button onClick={saveFlowAI} disabled={saving}>{saving ? 'Saving…' : 'Save FlowAI preference'}</Button></div>}
            {section === 'security' && <div className="space-y-6">
              <div><h2 className="text-base font-semibold text-slate-900">Security</h2><p className="mt-1 text-xs text-slate-500">Review your authentication method and update your password where supported.</p></div>
              <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600">Sign-in provider: {providerIds.join(', ') || 'Unknown'} · Last sign-in: {user.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—'}</div>
              {canChangePassword ? <form onSubmit={changePassword} className="grid gap-4 sm:max-w-md"><label className="grid gap-1.5 text-xs font-medium text-slate-600">Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} /></label><label className="grid gap-1.5 text-xs font-medium text-slate-600">New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} /></label><label className="grid gap-1.5 text-xs font-medium text-slate-600">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} /></label><Button type="submit" disabled={saving}><KeyRound className="size-4" />{saving ? 'Updating…' : 'Change password'}</Button></form> : <p className="rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">This account uses Google sign-in. Manage your password through your Google account.</p>}
              <div className="border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-800">Account actions</h3><p className="mt-1 text-xs text-slate-500">Sign out from this device. For account deletion, contact support so business records can be handled safely.</p><Button variant="outline" className="mt-3" onClick={onLogOut}>Sign out</Button></div>
            </div>}
          </section>
        </div>
      )}
    </main>
  )
}

export default SettingsModule
