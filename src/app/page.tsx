import Link from "next/link";

const POINTS = [
  {
    n: "01",
    title: "No app for your customers",
    body: "A phone number is a loyalty card. Someone on a UGX 60,000 Tecno gets the same rewards as someone on an iPhone — and printed QR cards work for customers who never touch a browser.",
  },
  {
    n: "02",
    title: "The till keeps working when the internet doesn't",
    body: "Sales are saved on the tablet first and pushed when the line comes back. Every sale carries a unique key, so replaying the queue can never double-award points.",
  },
  {
    n: "03",
    title: "Staff can't quietly cash out points",
    body: "Cashiers sign in with a PIN, every transaction is attributed, and redeeming needs a rolling 6-digit code from the customer's own screen.",
  },
  {
    n: "04",
    title: "Receipts on WhatsApp, not SMS",
    body: "Free to receive, already installed, and the balance link is tappable. Birthday bonuses and win-back messages go out the same way.",
  },
  {
    n: "05",
    title: "Billed on Mobile Money",
    body: "Monthly subscription collected over MTN or Airtel Money. No card, no bank visit, no invoice chasing.",
  },
  {
    n: "06",
    title: "Points or stamps, your choice",
    body: "A restaurant runs points per shilling spent. A barber runs buy-nine-get-one stamps. Same system, one switch in settings.",
  },
];

const PLANS = [
  { name: "Starter", price: "60,000", note: "1 till, 500 customers, WhatsApp receipts" },
  { name: "Growth", price: "120,000", note: "3 tills, unlimited customers, campaigns", featured: true },
  { name: "Chain", price: "300,000+", note: "Multiple branches, shared customer base" },
];

function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <div className={`k-mark rounded-md text-[13px] ${className}`}>K</div>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight">Kadi</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/till" className="btn-ghost hidden h-10 px-3.5 sm:inline-flex">
              Till
            </Link>
            <Link href="/login" className="btn-primary h-10 px-4">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
        <div>
          <p className="chip bg-brand-50 text-brand-700">East African retail</p>
          <h1 className="mt-5 font-display text-[2.6rem] font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Loyalty that runs on a phone number and survives a power cut.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Kadi turns any shop, salon or restaurant into a rewards programme in an afternoon.
            Your cashier uses a tablet. Your customer uses the number they already have.
            Nobody downloads anything.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary px-6">
              Start a 30-day trial
            </Link>
            <Link href="/till" className="btn-ghost px-6">
              Open the till
            </Link>
          </div>
          <p className="mt-6 text-xs tracking-wide text-ink-mute">
            Kampala · Nairobi · Dar es Salaam · Kigali
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="card overflow-hidden p-2">
            <div className="rounded-[10px] bg-ink p-6 text-paper">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">Kikoni Coffee</div>
                  <div className="mt-2 font-display text-xl font-medium">Amina N.</div>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide">
                  Gold
                </span>
              </div>
              <div className="mt-8 font-display text-5xl font-medium tabular-nums tracking-tight">2,480</div>
              <div className="mt-1 text-xs text-white/50">points available</div>
              <div className="mt-8 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Card</div>
                  <div className="mt-0.5 font-mono text-sm tracking-[0.22em]">4F7QX2</div>
                </div>
                <div className="grid h-14 w-14 grid-cols-5 gap-px rounded-md bg-paper p-1.5">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <span
                      key={i}
                      className="block rounded-[1px] bg-ink"
                      style={{ opacity: [0, 1, 2, 3, 5, 7, 8, 10, 11, 13, 14, 16, 18, 19, 21, 22, 24].includes(i) ? 1 : 0.12 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="card absolute -bottom-6 -left-3 hidden w-44 p-4 sm:block">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-mute">Last sale</div>
            <div className="mt-1 font-display text-2xl font-medium tabular-nums">+24</div>
            <div className="mt-0.5 text-xs text-ink-mute">UGX 24,000 · till 1</div>
          </div>
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-paper">
        <div className="mx-auto grid max-w-6xl sm:grid-cols-3">
          {[
            ["Offline-first till", "Sales queue on the tablet until the line returns."],
            ["Phone or printed QR", "Feature phones are first-class, not an afterthought."],
            ["Mobile Money billing", "MTN and Airtel. No card, no invoice chase."],
          ].map(([t, d], i) => (
            <div
              key={t}
              className={`px-6 py-8 ${i < 2 ? "sm:border-r sm:border-black/[0.06]" : ""}`}
            >
              <div className="text-sm font-semibold">{t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">Why shops switch</p>
        <h2 className="mt-2 max-w-lg font-display text-3xl font-medium tracking-tight">
          Built for the counter, not a demo day.
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-black/[0.06] sm:grid-cols-2">
          {POINTS.map((p) => (
            <div key={p.title} className="bg-paper p-7">
              <div className="font-mono text-[11px] tracking-widest text-ink-mute">{p.n}</div>
              <h3 className="mt-3 text-[15px] font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="card p-8 sm:p-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-mute">Pricing</p>
          <h2 className="mt-2 font-display text-3xl font-medium tracking-tight">One shop, one flat fee.</h2>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            Paid by Mobile Money on the same day each month. Thirty days free — no card required.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PLANS.map((t) => (
              <div
                key={t.name}
                className={`rounded-xl p-6 ${
                  t.featured ? "bg-ink text-paper" : "bg-canvas"
                }`}
              >
                <div className={`text-[11px] font-medium uppercase tracking-[0.14em] ${t.featured ? "text-white/50" : "text-ink-mute"}`}>
                  {t.name}
                </div>
                <div className="mt-3 font-display text-[1.75rem] font-medium tracking-tight tabular-nums">
                  UGX {t.price}
                  <span className={`ml-1 text-sm font-sans font-medium ${t.featured ? "text-white/45" : "text-ink-mute"}`}>
                    /mo
                  </span>
                </div>
                <p className={`mt-3 text-sm leading-relaxed ${t.featured ? "text-white/65" : "text-ink-soft"}`}>
                  {t.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Mark className="h-7 w-7 text-[11px]" />
            <span className="text-sm font-medium">Kadi</span>
          </div>
          <p className="text-xs text-ink-mute">Loyalty infrastructure · Kampala, Uganda</p>
        </div>
      </footer>
    </main>
  );
}
