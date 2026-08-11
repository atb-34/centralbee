# CentralBee — Mimari

Çok kurumlu bir eğitim grubu için yönetici işletim sistemi. Performans, finans,
nakit, operasyon, bütçe ve reklamı tek üründe birleştirir.

Bu belge ürünün kalıcı mimari kararlarını tutar. Faz planı ve yapılacaklar
listesi için [`CHECKLIST.md`](./CHECKLIST.md) dosyasına bakın.

---

## 1. Temel ilke: veri girişi ile raporlama ayrıdır

```
Kaynak veri  →  İçe aktarma  →  Veritabanı  →  Hesaplama  →  Raporlar
(Excel, elle)   (doğrula,       (normalize    katmanı       ve panolar
                 eşle, tekille)  tablolar)
```

Rapor yüklenmez, üretilir. Excel dosyaları "rapor" olarak saklanmaz; ham veri
olarak alınır, doğrulanır, ilişkisel tablolara yazılır ve tüm göstergeler bu
tablolardan hesaplanır.

Bunun pratik karşılığı:

- Aynı satış dosyası iki kez yüklenirse ciro iki katına çıkmaz.
- Yanlış bir yükleme, yüzlerce satır elle silinmeden geri alınabilir.
- "Ağustos cirosu" ekranın neresinde görünürse görünsün aynı hesaptan gelir.

## 2. Tek hesap kuralı

Tüm iş hesapları `lib/calc/` altında toplanır. Bir gösterge ekranın üç ayrı
yerinde görünüyorsa üçü de aynı fonksiyondan gelir. Aynı sayının iki yerde
farklı çıkması bu üründe kabul edilemez bir hatadır.

Örnek fonksiyonlar (fazlar ilerledikçe eklenir):

```
calculateTargetAchievement()     calculateCashPosition()
calculateYoYGrowth()             calculateAvailableCash()
calculateAverageEnrollmentValue() calculateCashForecast()
calculateBudgetVariance()        calculateFundingGap()
calculateAdsKPIs()
```

## 3. Güvenlik modeli

Yetki üç bağımsız boyuttan oluşur:

| Boyut | Ne belirler | Örnek |
| --- | --- | --- |
| **Modül** | Hangi alan | `reports.financial`, `data_upload.sales` |
| **Eylem** | Ne yapılabilir | `view`, `upload`, `edit`, `manage` |
| **Kapsam** | Hangi kurumlar | `all` veya açık kurum listesi |

Rol, modül+eylem çiftlerinden oluşan kayıtlı bir demettir. Kullanıcı bazında
istisna tanımlanabilir; **iptal istisnası her zaman kazanır**.

### Gerçek sınır veritabanındadır

Arayüzde menü gizlemek kolaylıktır, güvenlik değildir. Asıl engel PostgreSQL
Row Level Security'dir:

```
Modül ─┐
Kapsam ─┼→ Etkin izin ─┬→ Arayüz: menüyü gizler      (kolaylık)
Eylem ─┘               └→ Postgres RLS: satırı vermez (güvenlik)
```

Kurum müdürü adres çubuğundaki kurum numarasını değiştirse bile başka kurumun
verisini göremez — sorgu boş döner.

İki kural özellikle önemlidir:

- **Yükleme yetkisi görüntüleme yetkisi değildir.** İkisi ayrı modül+eylem
  çiftleridir; biri diğerini getirmez. Bir rol ikisini birden taşıyabilir, ama
  bu bir tercihtir, otomatik bir sonuç değil.
- Tüm RLS yardımcı fonksiyonları `app` şemasındadır ve `SECURITY DEFINER`
  olarak tanımlıdır. `app` şeması Supabase API'sine açılmaz.

### Açılış ekranı

Giriş sonrası kullanıcı sabit bir sayfaya değil, **rollerinin gerçekten
açabildiği ilk sayfaya** yönlendirilir (`lib/auth/landing.ts`). Sabit bir
`/daily` yönlendirmesi, o yetkiye sahip olmayan bir rolü giriş yapar yapmaz
yetki reddi ekranına düşürürdü. Ayrıca tüm sistem rollerine `daily:view`
verilmiştir; Günlük sayfası zaten yalnızca kullanıcının görmeye yetkili olduğu
bilgiyi gösterir.

### Roller

| Rol | Kapsam | Özet |
| --- | --- | --- |
| `super_admin` | Tümü | Sınırsız. Rol ve izin yapılandırmasını değiştirebilir. |
| `admin` | Tanımlı | Yetki yapılandırması dışında neredeyse her şey. |
| `executive` | Tüm kurumlar | Yönetici panoları ve raporlar, okuma ağırlıklı. |
| `finance` | Tüm kurumlar | Finansal raporlar, nakit, finansal veri yükleme. |
| `operations` | Tanımlı | Operasyon modülü ve kurum ziyaretleri. |
| `data_operator` | Tanımlı | Tüm veri tiplerini yükler, hiçbir raporu görmez. |
| `data_operator_sales` | Tanımlı | Satış ve CRM yükler, **performans** raporlarını görür. |
| `data_operator_finance` | Tanımlı | Finansal veri yükler, **finansal** raporları görür. |
| `data_operator_ads` | Tanımlı | Reklam verisi yükler, reklam raporlarını görür. |
| `institution_manager` | Kendi kurumu | Kendi performansı, hedefi, CRM'i, sıralaması. |
| `viewer` | Tanımlı | Salt okunur. |

Operatör rolleri alan bazlıdır: kişi **yalnızca yüklediği alanın** raporunu
görür. Satış verisi giren kişi performans raporunu görür ama grubun banka
bakiyesini görmez; finansal veri giren kişi finansal raporu görür ama kurumlar
arası performans sıralamasını görmez.

Bu, "yükleme yetkisi ≠ görüntüleme yetkisi" ilkesini bozmaz — o ayrım mimaride
duruyor. Değişen yalnızca rollerin hangi demetle geldiği; iki alanı da yükleyen
birine iki rol birden verilir.

### Kullanıcı adıyla giriş

Son kullanıcı e-posta adresi düşünmez. Supabase Auth arka planda e-posta ile
çalıştığı için her kullanıcı adı, `AUTH_EMAIL_DOMAIN` üzerinde sentetik bir
adrese eşlenir.

Eşleme **deterministiktir** (`kullanici` → `kullanici@users.centralbee.app`).
Böylece giriş öncesi hiçbir veritabanı sorgusu gerekmez; kimliği doğrulanmamış
bir istek, hangi kullanıcı adlarının var olduğunu yoklamak için kullanılamaz.

Bu nedenle `AUTH_EMAIL_DOMAIN` değeri **sonradan değiştirilmemelidir** —
değişirse mevcut kullanıcılar giriş yapamaz.

## 4. Veritabanı omurgası

Her şey iki eksene bağlanır: **kurum** ve **eğitim dönemi** (1 Eylül – 31 Ağustos).

```
companies ──1:N──> institutions <──dönem── education_periods
                        │
        ┌───────────────┼───────────────┬────────────────┐
        ▼               ▼               ▼                ▼
financial_       sales_          performance_     recurring_
transactions     enrollments     targets          obligations   ...
        ▲               ▲
        └──── data_import_batches (her satır hangi yüklemeden geldi)
```

### Alanlara göre tablolar

| Alan | Tablolar | Faz |
| --- | --- | --- |
| Kimlik ve yetki | `profiles` `roles` `permissions` `role_permissions` `user_roles` `user_permission_overrides` `user_institution_access` | 1 ✅ |
| Kuruluş yapısı | `companies` `institutions` `education_periods` | 1 ✅ |
| Yükümlülükler | `recurring_obligations` (sürümlü) | 2 ✅ |
| Kişiler | `people` | 3 ✅ |
| Operasyon | `operations` `operation_updates` | 3 ✅ |
| Platform | `data_import_batches` `data_import_errors` `audit_logs` | 1 (kısmi) |
| Performans | `sales_enrollments` `performance_targets` `crm_daily` | 5 |
| Finans | `financial_transactions` `financial_categories` `financial_subcategories` `bank_accounts` `cash_position_snapshots` `cash_position_items` | 6 |
| Nakit tahmini | `pos_receivables` `pos_settlements` `checks` `scheduled_payments` `recurring_obligations` `current_payables` `forecast_assumptions` | 2, 7 |
| Operasyon | `operations` `operation_updates` `operation_files` `institution_visits` | 3 |
| Bütçe | `budget_categories` `budget_items` `budget_actuals` | 9 |
| Reklam | `ad_sources` `ad_performance` | 10 |

### Değişmez kurallar

**Geçmiş asla ezilmez.** Kira 500 bin TL'den 650 bin TL'ye çıktığında eski
değer silinmez; yükümlülükler `effective_from` / `effective_to` ile sürümlenir.
Aynı kural maaş, SGK ve diğer düzenli ödemeler için de geçerlidir.

Bu, kurala uyulmasını *umut eden* bir tasarım değil. `recurring_obligations`
üzerindeki `EXCLUDE` kısıtı aynı yükümlülüğün iki sürümünün aynı günü
kapsamasına izin vermez, ve sürüm geçişi `set_recurring_obligation` fonksiyonuyla
tek işlemde yapılır: eski sürümün kapanması ile yenisinin açılması ya birlikte
olur ya hiç olmaz. Uygulama katmanı bu iki adımı ayrı ayrı yapamaz.

Aynı kurumda aynı türden birden fazla yükümlülük olabilir — iki bina, iki kira
sözleşmesi. Bunları `stream_name` ayırır; sürüm çakışma kısıtı akış başına
işler.

**Eğitim dönemleri çakışamaz.** `education_periods` üzerinde bir `EXCLUDE`
kısıtı vardır: iki dönem aynı günü kapsayamaz. Aksi halde bir işlem tarihi iki
döneme birden düşer ve her rapor iki kez sayar.

**Aynı anda tek aktif dönem.** Kısmi bir benzersiz indeks bunu garanti eder.

**Denetim kaydı eklenir, değiştirilmez.** `audit_logs` için hiç kimseye —
yöneticiler dahil — `UPDATE` veya `DELETE` politikası tanımlı değildir.

**Şirket varsayılanları koda gömülmez.** ATB'de maaş ayın 1'inde, ABD'de 15'inde
ödeniyor olabilir; bu bir yapılandırma değeridir, uygulama mantığı değil. Kurum
bazında geçersiz kılınabilir.

## 5. Klasör yapısı

```
app/
  (auth)/login/            giriş — uygulama kabuğu olmadan
  (app)/                   kenar çubuğu + üst bar bu katmanda
    daily/ institutions/ admin/ settings/
  setup/                   ilk yönetici — bir kez çalışır, sonra kapanır
  yetkisiz/                yetki reddi ekranı

components/
  ui/                      shadcn/ui temel bileşenleri
  app/                     AppShell · AppSidebar · PageHeader · MetricCard
                           FormDialog · EmptyState · StatusBadge · PermissionGate

lib/
  supabase/                client (tarayıcı) · server (oturumlu) · admin (service role)
  auth/                    kullanıcı adı eşlemesi · viewer (istek başına kimlik)
  permissions/             izin anahtarları ve etiketleri
  calc/                    TÜM iş hesapları — tek doğru kaynak
  importers/               veri tipi başına doğrulama + eşleme
  format/                  para · sayı · tarih biçimleri
  navigation.ts            kenar çubuğu tanımı (yetkiye duyarlı)
  audit.ts                 denetim kaydı yazımı

supabase/
  migrations/              numaralı SQL göçleri — şemanın tek kaynağı
  seed/                    demo verisi

types/database.ts          veritabanı tipleri
proxy.ts                   oturum tazeleme (Next.js 16'da middleware'in adı)
```

## 6. Arayüz ilkeleri

Ürün genel amaçlı bir yönetim paneli gibi değil, üst düzey bir yönetim
uygulaması gibi görünmelidir.

- **Yoğun ama okunabilir.** Dikey alan veriye aittir; sayfa başlıkları 200
  piksel yer kaplamaz.
- **Renk bilgidir.** Nötr zemin, tek marka vurgusu (pirinç sarısı: nerede
  olduğunuzu gösterir) ve dört semantik renk (olumlu / uyarı / kritik / bilgi).
  Her kuruma ayrı renk verilmez.
- **Durum yalnızca renkle anlatılmaz.** Rozet her zaman etiketini de taşır.
- **Sayılar hizalanır.** Finansal değerler sağa yaslanır ve `tabular-nums`
  kullanır.
- **Para biçimi karışmaz.** Genel bakışta `₺64,5M`, detayda `₺64.500.000`.
  Seçim ekrana aittir, tek tek sayılara değil.
- **Bağlam kaybolmaz.** Kayıtlar sağdan açılan çekmecede incelenir; her tıklama
  yeni bir sayfaya götürmez.
- **Boş durumlar iş yapar.** "Kayıt bulunamadı" değil; neyin eksik olduğu ve —
  yetki varsa — onu çözecek eylem.

## 7. Teknoloji

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) ·
Tailwind CSS v4 · shadcn/ui (Radix) · Supabase (PostgreSQL, Auth, RLS) · Vercel

Notlar:

- Next.js 16'da middleware'in adı **proxy**'dir; dosya kök dizinde `proxy.ts`.
- `cookies()`, `headers()`, `params` ve `searchParams` artık **asenkron**.
- Bu ortamda `ui.shadcn.com` ağ politikası nedeniyle kapalı olduğundan bileşenler
  shadcn/ui yapısıyla birebir aynı şekilde elle yazılmıştır. `components.json`
  mevcuttur; erişimi olan bir makineden `npx shadcn@latest add ...` çalışır.
