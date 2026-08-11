import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarRange,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
} from "lucide-react";

import { MODULES, permission } from "@/lib/permissions/keys";

export type NavItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Any one of these grants visibility. Empty means always visible. */
  anyOf?: string[];
  children?: NavItem[];
};

export type NavSection = {
  id: string;
  label?: string;
  items: NavItem[];
};

/**
 * The sidebar.
 *
 * Only modules that actually exist are listed. Later phases add their entries
 * here as they ship — a link that leads to an empty page is worse than no link,
 * and the route map in `docs/ARCHITECTURE.md` already records the full plan.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    items: [
      {
        label: "Günlük",
        href: "/daily",
        icon: Sun,
        anyOf: [permission(MODULES.daily, "view")],
      },
      {
        label: "Kurumlar",
        href: "/institutions",
        icon: Building2,
        anyOf: [permission(MODULES.institutions, "view")],
      },
      {
        // "What are the group's fixed monthly costs?" is an executive question.
        // Answering it by walking into each institution in turn is not an
        // answer, so the roll-up lives at the top level.
        label: "Yükümlülükler",
        href: "/obligations",
        icon: Wallet,
        anyOf: [permission(MODULES.institutionObligations, "view")],
      },
    ],
  },
  {
    id: "admin",
    label: "Yönetim",
    items: [
      {
        label: "Kullanıcılar",
        href: "/admin/users",
        icon: Users,
        anyOf: [permission(MODULES.adminUsers, "view")],
      },
      {
        label: "Roller ve Yetkiler",
        href: "/admin/roles",
        icon: ShieldCheck,
        anyOf: [
          permission(MODULES.adminRoles, "view"),
          permission(MODULES.adminPermissions, "view"),
        ],
      },
      {
        label: "Şirketler ve Kurumlar",
        href: "/admin/companies",
        icon: Building2,
        anyOf: [
          permission(MODULES.adminCompanies, "view"),
          permission(MODULES.adminInstitutions, "view"),
        ],
      },
      {
        label: "Eğitim Dönemleri",
        href: "/admin/education-periods",
        icon: CalendarRange,
        anyOf: [permission(MODULES.adminEducationPeriods, "view")],
      },
      {
        label: "Denetim Kaydı",
        href: "/admin/audit-log",
        icon: ScrollText,
        anyOf: [permission(MODULES.adminAuditLog, "view")],
      },
    ],
  },
  {
    id: "account",
    items: [
      {
        label: "Ayarlar",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];
