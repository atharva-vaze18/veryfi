import type { ReactNode, SVGProps } from "react";

// Inline line-icons recreated 1:1 from the design handoff SVGs. Kept as
// dependency-free components (rather than lucide-react) so they carry the exact
// paths/stroke widths from the prototype and stay decoupled from icon-lib churn.
type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number };

function Icon({ size = 20, strokeWidth = 1.7, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => <Icon strokeWidth={2.4} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const Plus = (p: IconProps) => <Icon strokeWidth={2.4} {...p}><path d="M12 5v14M5 12h14" /></Icon>;

// Landing — signal stack
export const IdCard = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx="8" cy="11" r="2.5" /><path d="M14 9h4M14 13h4M5 16.5h6" /></Icon>;
export const Eye = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const Camera = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3.2" /></Icon>;
export const Shield = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><path d="M12 22s8-4 8-10V5.5l-8-3-8 3V12c0 6 8 10 8 10Z" /></Icon>;
export const Globe = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20Z" /></Icon>;
export const Clock = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6.5V12l4 2" /></Icon>;
export const Mail = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><rect x="2" y="4.5" width="20" height="15" rx="2" /><path d="m2.5 6.5 9.5 7 9.5-7" /></Icon>;
export const Behavior = (p: IconProps) => <Icon strokeWidth={1.6} {...p}><path d="M4 4l7 16 2.2-6.8L20 11 4 4Z" /></Icon>;

// Dashboard — sidebar nav
export const ListChecks = (p: IconProps) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h2M8 17h6" /></Icon>;
export const LineChart = (p: IconProps) => <Icon {...p}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></Icon>;
export const Webhook = (p: IconProps) => <Icon {...p}><path d="M14 3l-4 18M18 7l4 5-4 5M6 7l-4 5 4 5" /></Icon>;
export const KeyRound = (p: IconProps) => <Icon {...p}><circle cx="8" cy="8" r="5" /><path d="M11.5 11.5L21 21M17 17l2-2M14 14l2-2" /></Icon>;
export const Boxes = (p: IconProps) => <Icon {...p}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Icon>;
export const Sliders = (p: IconProps) => <Icon {...p}><path d="M4 20v-5M4 11V4M12 20v-9M12 7V4M20 20v-3M20 13V4" /><circle cx="4" cy="13" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="20" cy="15" r="2" /></Icon>;
export const Users = (p: IconProps) => <Icon {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6" /></Icon>;
export const CreditCard = (p: IconProps) => <Icon {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Icon>;
export const Cog = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.5l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></Icon>;

// Dashboard — topbar
export const Search = (p: IconProps) => <Icon strokeWidth={1.8} {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>;
export const Bell = (p: IconProps) => <Icon {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></Icon>;
export const LogOut = (p: IconProps) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Icon>;
