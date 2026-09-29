import {
  Activity,
  Boxes,
  Brain,
  Clock,
  Cloud,
  Cog,
  CreditCard,
  Cpu,
  Database,
  Fingerprint,
  Globe,
  HardDrive,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageSquare,
  Monitor,
  PlugZap,
  RadioTower,
  Router,
  ScrollText,
  Server,
  Shield,
  Signpost,
  Smartphone,
  Sparkles,
  Split,
  Table,
  Warehouse,
  Waypoints,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { BRAND_ICONS } from "@/domain/brand-icons.generated";
import { spec, type ComponentKind, type GlyphKey, type IconRef } from "@/domain/catalog";

const GLYPHS: Record<GlyphKey, LucideIcon> = {
  globe: Globe,
  smartphone: Smartphone,
  cpu: Cpu,
  router: Router,
  split: Split,
  "radio-tower": RadioTower,
  signpost: Signpost,
  server: Server,
  "key-round": KeyRound,
  cog: Cog,
  zap: Zap,
  "plug-zap": PlugZap,
  clock: Clock,
  brain: Brain,
  database: Database,
  "hard-drive": HardDrive,
  warehouse: Warehouse,
  boxes: Boxes,
  table: Table,
  inbox: Inbox,
  megaphone: Megaphone,
  workflow: Workflow,
  shield: Shield,
  fingerprint: Fingerprint,
  "lock-keyhole": LockKeyhole,
  activity: Activity,
  "scroll-text": ScrollText,
  waypoints: Waypoints,
  "layout-dashboard": LayoutDashboard,
  "credit-card": CreditCard,
  mail: Mail,
  "message-square": MessageSquare,
  sparkles: Sparkles,
  cloud: Cloud,
  monitor: Monitor,
};

export function IconGlyph({ icon, size = 18, color }: { icon: IconRef; size?: number; color?: string }) {
  if (icon.type === "brand") {
    const b = BRAND_ICONS[icon.key];
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden fill={color ?? "currentColor"}>
        <path d={b.path} />
      </svg>
    );
  }
  const Glyph = GLYPHS[icon.key] ?? Server;
  return <Glyph size={size} strokeWidth={1.8} color={color} aria-hidden />;
}

export function ComponentIcon({ kind, size = 18, color }: { kind: ComponentKind; size?: number; color?: string }) {
  return <IconGlyph icon={spec(kind).icon} size={size} color={color} />;
}
