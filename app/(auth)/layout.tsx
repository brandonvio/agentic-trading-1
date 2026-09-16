import { LogoMark } from "@/components/icons";

/** Abstract market mesh: a price path over a faint grid with signal nodes. */
function BrandArtwork() {
  return (
    <svg viewBox="0 0 480 320" className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="ap-brand-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ap-brand-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--cyan)" />
        </linearGradient>
        <pattern id="ap-brand-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="var(--edge-strong)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="480" height="320" fill="url(#ap-brand-grid)" opacity="0.7" />
      <path
        d="M0 250 L60 236 L100 258 L150 190 L200 208 L250 150 L300 168 L350 104 L410 122 L480 58 L480 320 L0 320 Z"
        fill="url(#ap-brand-fill)"
      />
      <path
        d="M0 250 L60 236 L100 258 L150 190 L200 208 L250 150 L300 168 L350 104 L410 122 L480 58"
        fill="none"
        stroke="url(#ap-brand-stroke)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {[
        [150, 190],
        [250, 150],
        [350, 104],
        [480, 58],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="9" fill="var(--cyan)" opacity="0.12" />
          <circle cx={cx} cy={cy} r="3" fill="var(--cyan)" />
        </g>
      ))}
      {[
        [96, 96],
        [196, 68],
        [300, 44],
      ].map(([cx, cy]) => (
        <circle key={`n-${cx}`} cx={cx} cy={cy} r="1.5" fill="var(--fg-subtle)" />
      ))}
      <path d="M96 96 L196 68 L300 44" fill="none" stroke="var(--edge-strong)" strokeWidth="1" strokeDasharray="3 4" />
    </svg>
  );
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden border-r border-edge bg-surface-1 lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-70">
          <BrandArtwork />
        </div>
        <div className="absolute inset-0 bg-gradient-to-tr from-bg via-bg/70 to-transparent" aria-hidden="true" />
        <div className="relative flex flex-1 flex-col justify-between p-10">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-sm font-semibold tracking-tight text-fg">Agentic Prop</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
              AI-native proprietary trading
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
              One terminal for desks, portfolios and the agents that trade them — multi-asset execution across equities,
              options, futures, FX, crypto and event contracts, with pre-trade risk, four-eyes approvals and a full audit
              trail on every decision.
            </p>
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-edge pt-5">
              {[
                ["Venues", "5 simulated"],
                ["Agents", "7 archetypes"],
                ["Controls", "RBAC + limits"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="label-caps">{label}</dt>
                  <dd className="mt-0.5 text-xs text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="flex items-center gap-2 text-2xs text-fg-subtle">
            <span className="inline-flex size-1.5 rounded-full bg-warning" aria-hidden="true" />
            Mock mode — simulated brokers, simulated market data and a mock LLM. No real capital is at risk.
          </p>
        </div>
      </aside>
      <main className="flex min-w-0 items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
