import {
  BarChart3,
  Boxes,
  CircleHelp,
  Crown,
  FileText,
  Grid2X2,
  HandCoins,
  LayoutDashboard,
  Package,
  Settings2,
  ShoppingCart,
  Users,
  Wallet,
  X,
} from 'lucide-react'

const navigationGroups = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard },
      { label: 'Sales', icon: ShoppingCart },
      { label: 'Purchases', icon: Boxes },
      { label: 'Products', icon: Package },
      { label: 'Customers', icon: Users },
      { label: 'Suppliers', icon: HandCoins },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Invoices', icon: FileText },
      { label: 'Expenses', icon: Wallet },
      { label: 'FlowAI', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [{ label: 'Admin', icon: Crown }],
  },
]

function DashboardSidebar({ isOpen, onClose, currentPage = 'Dashboard', onNavigate }) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/30 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-6">
          <a href="/" className="flex items-center gap-3" aria-label="Pyrox Biz dashboard">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-700 text-sm font-bold tracking-tight text-white shadow-sm shadow-emerald-900/15">
              PB
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              Pyrox <span className="text-emerald-700">Biz</span>
            </span>
          </a>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
              <Grid2X2 className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">Business workspace</span>
              <span className="mt-0.5 block text-xs text-slate-500">Business dashboard</span>
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map(({ label, icon: Icon }) => {
                  const active = currentPage === label
                  const available = ['Dashboard', 'Sales', 'Purchases', 'Products', 'Customers', 'Suppliers', 'Invoices', 'Expenses', 'FlowAI', 'Admin'].includes(label)
                  return (
                  <li key={label}>
                    <button
                      type="button"
                      disabled={!available}
                      onClick={() => {
                        if (!available) return
                        onNavigate?.(label)
                        onClose()
                      }}
                      aria-current={active ? 'page' : undefined}
                      title={available ? undefined : 'This page will be available in a future step'}
                      className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-emerald-50 text-emerald-800'
                          : available
                            ? 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                            : 'cursor-not-allowed text-slate-400'
                      }`}
                    >
                      <Icon className={`size-[17px] ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                      {label}
                      {active && <span className="ml-auto size-1.5 rounded-full bg-emerald-600" />}
                    </button>
                  </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-100 px-3 py-4">
          <button
            type="button"
            onClick={() => {
              onNavigate?.('Settings')
              onClose()
            }}
            aria-current={currentPage === 'Settings' ? 'page' : undefined}
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium ${
              currentPage === 'Settings' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Settings2 className={`size-[17px] ${currentPage === 'Settings' ? 'text-emerald-700' : 'text-slate-400'}`} />
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate?.('Help & support')
              onClose()
            }}
            aria-current={currentPage === 'Help & support' ? 'page' : undefined}
            className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium ${
              currentPage === 'Help & support' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <CircleHelp className={`size-[17px] ${currentPage === 'Help & support' ? 'text-emerald-700' : 'text-slate-400'}`} />
            Help & support
          </button>
          <p className="px-3 pt-3 text-[11px] leading-5 text-slate-400">
            Pyrox Biz workspace
          </p>
        </div>
      </aside>
    </>
  )
}

export default DashboardSidebar
