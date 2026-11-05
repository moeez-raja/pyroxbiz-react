import {
  ArrowUpRight,
  Camera,
  CircleHelp,
  Clock3,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react'

const supportTopics = [
  {
    question: 'Where does my dashboard data come from?',
    answer: 'The dashboard reads your signed-in business records from Firestore. Empty states mean there are no matching records yet; the app does not add sample transactions.',
  },
  {
    question: 'How do I record a sale or purchase?',
    answer: 'Open Sales or Purchases in the workspace navigation. Sales check available stock; purchases record received quantities and update inventory.',
  },
  {
    question: 'Why can’t I delete a linked record?',
    answer: 'Products, customers, and suppliers may be used by existing transactions. Preventing deletion protects transaction history and inventory relationships.',
  },
  {
    question: 'How can I get account or billing help?',
    answer: 'Contact the Pyrox Biz team through the official Instagram support channel below. Do not send passwords or authentication codes.',
  },
]

function HelpModule() {
  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="page-hero">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800"><CircleHelp className="size-4" />Help & support</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Find quick answers or reach the Pyrox Biz team through the support channel listed for the business.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-700"><Camera className="size-5" /></span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"><Clock3 className="size-3.5" />Usually replies within a day</span>
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">Instagram support</h2>
          <p className="mt-1 flex-1 text-sm leading-6 text-slate-500">Send a direct message for questions, feedback, or account support.</p>
          <a href="https://instagram.com/moeez.dev" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800">
            <Camera className="size-4" />Message @moeez.dev<ArrowUpRight className="size-4" />
          </a>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MessageCircle className="size-5" /></span>
          <h2 className="mt-4 text-base font-semibold text-slate-900">WhatsApp support</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">The legacy project lists a WhatsApp handle but does not provide a valid phone-number link. To avoid sending you to a broken or incorrect chat, use Instagram support for now.</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Frequently asked questions</h2><p className="mt-1 text-xs text-slate-500">Helpful information about using your workspace.</p></div>
        <div className="divide-y divide-slate-100">
          {supportTopics.map(({ question, answer }) => <details key={question} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 marker:hidden">{question}<span className="float-right text-slate-400 transition-transform group-open:rotate-45">+</span></summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{answer}</p>
          </details>)}
        </div>
      </section>

      <p className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Support will never need your password or sign-in verification code. Keep those credentials private.</p>
    </main>
  )
}

export default HelpModule
