import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/viewer";
import { formatDateTime } from "@/lib/format/date";
import { ACTION_LABELS } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PermissionAction } from "@/types/database";

export const metadata: Metadata = {
  title: "Ayarlar",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

/**
 * Shows a user exactly what they can do and where. Support calls about "I
 * can't see the finance reports" are answered from this page rather than by
 * an administrator reading the database.
 */
export default async function SettingsPage() {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();

  const [{ data: roles }, { data: permissions }, { data: institutions }] =
    await Promise.all([
      viewer.roleKeys.length > 0
        ? supabase.from("roles").select("name").in("key", viewer.roleKeys)
        : Promise.resolve({ data: [] as { name: string }[] }),
      supabase.from("permissions").select("key, module, label, action"),
      viewer.institutionIds.length > 0
        ? supabase.from("institutions").select("id, name").in("id", viewer.institutionIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

  const held = (permissions ?? []).filter(
    (row) => viewer.isSuperAdmin || viewer.permissions.has(row.key)
  );

  const byModule = new Map<string, { label: string; actions: PermissionAction[] }>();
  for (const row of held) {
    const existing = byModule.get(row.module);
    if (existing) existing.actions.push(row.action);
    else byModule.set(row.module, { label: row.label, actions: [row.action] });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ayarlar"
        description="Hesabınız ve sistemde sahip olduğunuz yetkiler."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hesap</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <Row label="Ad soyad" value={viewer.profile.full_name} />
            <Row
              label="Kullanıcı adı"
              value={<span className="font-mono">@{viewer.profile.username}</span>}
            />
            <Row label="Ünvan" value={viewer.profile.title ?? "—"} />
            <Row label="E-posta" value={viewer.profile.email ?? "—"} />
            <Row label="Telefon" value={viewer.profile.phone ?? "—"} />
            <Row
              label="Son giriş"
              value={
                viewer.profile.last_login_at
                  ? formatDateTime(viewer.profile.last_login_at)
                  : "—"
              }
            />
            <Row
              label="Roller"
              value={
                (roles ?? []).length > 0
                  ? (roles ?? []).map((role) => role.name).join(", ")
                  : "—"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kurum erişimi</CardTitle>
            <Badge variant={viewer.scopeAll ? "brand" : "outline"}>
              {viewer.scopeAll ? "Tüm kurumlar" : "Seçili kurumlar"}
            </Badge>
          </CardHeader>
          <CardContent>
            {viewer.scopeAll ? (
              <p className="text-[13px] text-muted-foreground">
                Gruptaki tüm kurumların verisini görebilirsiniz.
              </p>
            ) : (institutions ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Size henüz hiçbir kurum atanmamış. Bu nedenle kurum listeleri boş
                görünür. Yöneticinizden erişim talep edebilirsiniz.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {(institutions ?? []).map((institution) => (
                  <li key={institution.id}>
                    <Badge variant="outline">{institution.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Yetkileriniz</CardTitle>
          <span className="text-[13px] text-muted-foreground">
            {viewer.isSuperAdmin ? "Tüm yetkiler" : `${held.length} yetki`}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {[...byModule.entries()].map(([module, entry]) => (
              <li key={module} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="min-w-48 text-[13px] font-medium">{entry.label}</span>
                <div className="flex flex-wrap gap-1">
                  {entry.actions.map((action) => (
                    <Badge key={action} variant="outline">
                      {ACTION_LABELS[action]}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
