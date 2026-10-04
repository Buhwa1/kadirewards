import QRCode from "qrcode";
import { requireBusiness } from "@/lib/current-business";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PosterPage() {
  const { business } = await requireBusiness();

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://kadi.app");
  const joinUrl = `${base}/join/${business.slug}`;

  // High-res SVG so it stays sharp when scaled on screen and in print
  const qr = await QRCode.toString(joinUrl, {
    type: "svg",
    margin: 1,
    width: 512,
    color: { dark: "#161513", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="page-title">Sign-up poster</h1>
        <p className="page-lede">
          Print this and put it on the counter or window. Customers scan the QR with their
          phone camera and join your rewards programme — no app download.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <PrintButton />
          <a href={joinUrl} target="_blank" rel="noreferrer" className="btn-ghost">
            Open join link
          </a>
        </div>
      </div>

      <div
        id="poster"
        className="mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-paper shadow-card print:max-w-none print:rounded-none print:shadow-none"
      >
        {/* Header */}
        <div
          className="px-6 py-8 text-center text-white sm:px-8 sm:py-10"
          style={{ background: business.brand_color }}
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/70">
            Rewards programme
          </div>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">
            {business.name}
          </h2>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/85">
            Scan to join. Earn points every time you visit. Redeem free rewards.
          </p>
        </div>

        {/* QR section — no fixed height on the flex column so nothing is clipped */}
        <div className="flex flex-col items-center gap-4 px-6 py-8 sm:px-8 sm:py-10">
          {/* QR box: fixed square, SVG fills it via width/height 100% */}
          <div
            className="shrink-0 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(22,21,19,0.08)]"
            style={{ width: 280, height: 280 }}
          >
            <div
              className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          </div>

          <div className="w-full text-center">
            <p className="text-sm font-medium text-ink">Point your camera here</p>
            <p className="mt-1 break-all px-1 font-mono text-[11px] leading-relaxed text-ink-mute">
              {joinUrl}
            </p>
          </div>

          <div className="w-full rounded-xl bg-canvas/80 px-5 py-4 text-left text-sm text-ink-soft">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Open your phone camera and scan the code</li>
              <li>Enter your phone number (that is your card)</li>
              <li>Show the card or code at the till to earn &amp; redeem</li>
            </ol>
          </div>
        </div>

        <div className="border-t border-black/[0.06] px-6 py-4 text-center text-[11px] text-ink-mute sm:px-8">
          Powered by Kadi · No app required
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #poster, #poster * { visibility: visible !important; }
          #poster {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: none;
            margin: 0;
            border-radius: 0;
            box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}