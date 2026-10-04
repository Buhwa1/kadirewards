import Link from "next/link";
import { requireBusiness, trialDaysLeft } from "@/lib/current-business";
import { signOut } from "@/app/login/actions";
import NavLink from "./NavLink";

const NAV = [
  ["/dashboard", "Overview"],
  ["/dashboard/customers", "Customers"],
  ["/dashboard/rewards", "Rewards"],
  ["/dashboard/campaigns", "Campaigns"],
  ["/dashboard/poster", "Sign-up QR"],
  ["/dashboard/staff", "Staff & till"],
  ["/dashboard/settings", "Settings"],
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness();
  const days = trialDaysLeft(business);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-ink text-paper lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:py-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="k-mark h-8 w-8 rounded-md bg-paper text-[13px] text-ink">
              {business.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{business.name}</div>
              <div className="truncate text-[11px] text-white/40">kadi.app/join/{business.slug}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 lg:hidden">
            <Link href="/till" className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium">
              Till
            </Link>
            <form action={signOut}>
              <button className="rounded-lg px-3 py-2 text-xs text-white/50">Sign out</button>
            </form>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {NAV.map(([href, label]) => (
            <NavLink key={href} href={href} label={label} />
          ))}
        </nav>

        <div className="hidden border-t border-white/10 px-4 py-4 lg:block">
          {business.subscription_status === "trialing" && (
            <div className="mb-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-white/60">
              Trial · {days} day{days === 1 ? "" : "s"} left
            </div>
          )}
          <Link
            href="/till"
            className="mb-2 flex min-h-10 items-center justify-center rounded-lg bg-white/10 text-sm font-medium hover:bg-white/15"
          >
            Open till
          </Link>
          <form action={signOut}>
            <button className="w-full py-2 text-left text-xs text-white/40 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="hidden items-center justify-end gap-3 border-b border-black/[0.06] bg-paper px-8 py-3 lg:flex">
          {business.subscription_status === "trialing" && (
            <span className="chip bg-canvas text-ink-soft">
              Trial · {days} day{days === 1 ? "" : "s"} left
            </span>
          )}
          <form action={signOut} className="lg:hidden">
            <button className="text-sm text-ink-mute hover:text-ink">Sign out</button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
