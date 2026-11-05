function MetricCard({ label, icon: Icon, description, value, loading = false, error = false }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p
            className={`mt-4 text-[28px] font-semibold leading-none tracking-tight ${
              error ? 'text-rose-700' : 'text-slate-800'
            }`}
            aria-live="polite"
          >
            {loading ? '…' : value}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon className="size-[19px]" strokeWidth={1.8} />
        </span>
      </div>
      <p className={`mt-4 border-t border-slate-100 pt-3 text-xs ${error ? 'text-rose-600' : 'text-slate-400'}`}>
        {error ? 'Unable to load this metric' : description}
      </p>
    </article>
  )
}

export default MetricCard
