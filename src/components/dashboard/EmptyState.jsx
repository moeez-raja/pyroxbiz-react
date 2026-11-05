function EmptyState({ icon: Icon, title, description, className = '' }) {
  return (
    <div className={`flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    </div>
  )
}

export default EmptyState
