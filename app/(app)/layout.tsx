import { AppShell } from "@/components/app/app-shell";
import { canAny, requireViewer } from "@/lib/auth/viewer";
import { formatDateLong } from "@/lib/format/date";
import { NAV_SECTIONS } from "@/lib/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const supabase = await createSupabaseServerClient();

  // Nav visibility is decided here, on the server. The client only ever
  // receives the list of links this user is allowed to have.
  const allowedHrefs = NAV_SECTIONS.flatMap((section) => section.items)
    .filter((item) => !item.anyOf || canAny(viewer, item.anyOf))
    .map((item) => item.href);

  const [{ data: activePeriod }, { data: roleRows }] = await Promise.all([
    supabase
      .from("education_periods")
      .select("short_name")
      .eq("is_active", true)
      .maybeSingle(),
    viewer.roleKeys.length > 0
      ? supabase.from("roles").select("name").in("key", viewer.roleKeys)
      : Promise.resolve({ data: [] as { name: string }[] }),
  ]);

  return (
    <AppShell
      allowedHrefs={allowedHrefs}
      periodLabel={activePeriod?.short_name ?? null}
      todayLabel={formatDateLong(new Date())}
      user={{
        fullName: viewer.profile.full_name,
        username: viewer.profile.username,
        roleNames: (roleRows ?? []).map((row) => row.name),
      }}
    >
      {children}
    </AppShell>
  );
}
