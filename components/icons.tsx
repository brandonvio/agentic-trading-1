import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };
export type IconComponent = (props: IconProps) => React.JSX.Element;

function base({ size = 16, className, ...rest }: IconProps, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const DashboardIcon: IconComponent = (p) =>
  base(p, <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>);

export const PortfolioIcon: IconComponent = (p) =>
  base(p, <><path d="M3 7h18v13H3z" /><path d="M8 7V4h8v3" /><path d="M3 12h18" /></>);

export const PositionsIcon: IconComponent = (p) =>
  base(p, <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l4-6 3 3 5-7" /></>);

export const OrdersIcon: IconComponent = (p) =>
  base(p, <><path d="M5 4h14v16H5z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h3" /></>);

export const SignalsIcon: IconComponent = (p) =>
  base(p, <><path d="M12 20V10" /><path d="M6 20v-4" /><path d="M18 20V4" /><circle cx="18" cy="4" r="1" fill="currentColor" /></>);

export const AgentsIcon: IconComponent = (p) =>
  base(p, <><rect x="4" y="7" width="16" height="12" rx="2" /><path d="M12 3v4" /><circle cx="9" cy="13" r="1" fill="currentColor" /><circle cx="15" cy="13" r="1" fill="currentColor" /><path d="M9 17h6" /></>);

export const StrategiesIcon: IconComponent = (p) =>
  base(p, <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7.5 7.5L11 16" /><path d="M16.5 7.5L13 16" /><path d="M8 6h8" /></>);

export const RiskIcon: IconComponent = (p) =>
  base(p, <><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></>);

export const ApprovalsIcon: IconComponent = (p) =>
  base(p, <><path d="M9 12l2 2 4-5" /><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" /></>);

export const MarketIcon: IconComponent = (p) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3.5 3 14.5 0 18" /><path d="M12 3c-3 3.5-3 14.5 0 18" /></>);

export const BrokersIcon: IconComponent = (p) =>
  base(p, <><rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /><circle cx="7" cy="7" r="0.8" fill="currentColor" /><circle cx="7" cy="17" r="0.8" fill="currentColor" /></>);

export const AuditIcon: IconComponent = (p) =>
  base(p, <><path d="M4 5h16" /><path d="M4 12h10" /><path d="M4 19h16" /><circle cx="18" cy="12" r="2.5" /></>);

export const UsersIcon: IconComponent = (p) =>
  base(p, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.8 0 4.5 2 4.5 4.5" /></>);

export const SearchIcon: IconComponent = (p) =>
  base(p, <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></>);

export const ChevronLeftIcon: IconComponent = (p) => base(p, <path d="M15 5l-7 7 7 7" />);
export const ChevronRightIcon: IconComponent = (p) => base(p, <path d="M9 5l7 7-7 7" />);
export const ChevronDownIcon: IconComponent = (p) => base(p, <path d="M5 9l7 7 7-7" />);
export const CloseIcon: IconComponent = (p) => base(p, <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>);
export const CheckIcon: IconComponent = (p) => base(p, <path d="M5 12l5 5 9-10" />);
export const LogoutIcon: IconComponent = (p) => base(p, <><path d="M10 4H5v16h5" /><path d="M14 8l5 4-5 4" /><path d="M19 12H9" /></>);
export const AlertIcon: IconComponent = (p) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><circle cx="12" cy="16.5" r="0.6" fill="currentColor" /></>);
export const InfoIcon: IconComponent = (p) =>
  base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r="0.6" fill="currentColor" /></>);
export const ArrowUpRightIcon: IconComponent = (p) => base(p, <><path d="M7 17L17 7" /><path d="M9 7h8v8" /></>);
export const ClockIcon: IconComponent = (p) => base(p, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const RefreshIcon: IconComponent = (p) =>
  base(p, <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>);
export const SpinnerIcon: IconComponent = ({ className, ...p }) =>
  base({ ...p, className: `${className ?? ""} animate-[ap-spin_0.8s_linear_infinite]` }, <path d="M12 3a9 9 0 0 1 9 9" strokeWidth={2.5} />);
export const CopyIcon: IconComponent = (p) =>
  base(p, <><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5h10" /></>);
export const BoltIcon: IconComponent = (p) => base(p, <path d="M13 2L4 14h7l-1 8 9-12h-7z" />);

export const PlusIcon: IconComponent = (p) => base(p, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const PlayIcon: IconComponent = (p) => base(p, <path d="M8 5l11 7-11 7z" />);
export const PauseIcon: IconComponent = (p) => base(p, <><path d="M9 5v14" /><path d="M15 5v14" /></>);
export const StopIcon: IconComponent = (p) => base(p, <rect x="6" y="6" width="12" height="12" rx="1.5" />);
export const PencilIcon: IconComponent = (p) => base(p, <><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
export const TrashIcon: IconComponent = (p) => base(p, <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>);
export const FilterIcon: IconComponent = (p) => base(p, <path d="M4 5h16l-6 7v6l-4 2v-8z" />);
export const ChevronUpIcon: IconComponent = (p) => base(p, <path d="M5 15l7-7 7 7" />);
export const LinkIcon: IconComponent = (p) =>
  base(p, <><path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 7" /><path d="M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 0 0 5.7 5.7L12.5 17" /></>);

/** Brand mark: a stylised candle + circuit node. */
export const LogoMark: IconComponent = ({ size = 24, className, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" className={className} {...rest}>
    <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--accent)" />
    <path d="M9 21V13" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M16 23V9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M23 19v-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="23" cy="8" r="2.2" fill="var(--cyan)" />
  </svg>
);
