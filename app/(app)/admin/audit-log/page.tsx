import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/viewer";
import { formatDateTime } from "@/lib/format/date";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Denetim Kaydı",
};

const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "positive" | "warning" | "critical" | "info" }> = {
  login: { label: "Giriş", variant: "default" },
  logout: { label: "Çıkış", variant: "default" },
  create: { label: "Oluşturma", variant: "positive" },
  update: { label: "Güncelleme", variant: "info" },
  delete: { label: "Silme", variant: "critical" },
  password_reset: { label: "Şifre sıfırlama", variant: "warning" },
  setup: { label: "Kurulum", variant: "warning" },
};

const ENTITY_LABELS: Record<string, string> = {
  auth: "Oturum",
  profile: "Kullanıcı",
  company: "Şirket",
  institution: "Kurum",
  education_period: "Eğitim dönemi",
  role: "Rol",
};

export default async function AuditLogPage() {
  await requirePermission(permission(MODULES.adminAuditLog, "view"));
  const supabase = await createSupabaseServerClient();

  const { data: entries } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = entries ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Denetim Kaydı"
        description={`Sistemdeki önemli değişikliklerin kalıcı kaydı. Son ${PAGE_SIZE} işlem gösteriliyor.`}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Henüz kayıt yok"
          description="Kullanıcı, kurum ve yetki değişiklikleri gerçekleştikçe burada listelenecek."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zaman</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead>Nesne</TableHead>
                <TableHead>Açıklama</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => {
                const action = ACTION_LABELS[entry.action] ?? {
                  label: entry.action,
                  variant: "default" as const,
                };
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {entry.actor_username ? `@${entry.actor_username}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={action.variant}>{action.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}
                    </TableCell>
                    <TableCell>{entry.summary}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
