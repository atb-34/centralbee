# Uygulama Planı ve Kontrol Listesi

Fazlar sırayla ilerler. Her fazın sonunda tip kontrolü, lint ve derleme
çalıştırılır; bilerek bozuk kod bırakılmaz. Her faz kendi Pull Request'i ile
onaya gider.

Mimari kararlar için [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Faz 1 — Temel ✅

- [x] Next.js 16 + TypeScript (strict) + Tailwind v4 + shadcn/ui yapısı
- [x] Tasarım sistemi: nötr palet, tek marka vurgusu, dört semantik renk, açık/koyu tema
- [x] Supabase istemcileri: tarayıcı, sunucu (oturumlu), service role (yalnız sunucu)
- [x] `proxy.ts` ile oturum tazeleme
- [x] Veritabanı göçleri: `profiles` `roles` `permissions` `role_permissions`
      `user_roles` `user_permission_overrides` `user_institution_access`
      `companies` `institutions` `education_periods` `audit_logs`
- [x] RLS yardımcı fonksiyonları (`app` şeması) ve tüm tablolarda politikalar
- [x] İzin kataloğu ve 8 sistem rolü (göç ile, ortamlar arası aynı)
- [x] Eğitim dönemleri (2022-23 → 2029-30), çakışma ve tek-aktif kısıtları
- [x] Kullanıcı adıyla giriş; deterministik e-posta eşlemesi
- [x] İlk yönetici kurulum ekranı (`/setup`) — bir kez çalışır, sonra kapanır
- [x] Uygulama kabuğu: yetkiye duyarlı kenar çubuğu, üst bar, tema anahtarı
- [x] Yönetim: kullanıcılar (oluştur, düzenle, rol, kurum kapsamı, şifre sıfırla)
- [x] Yönetim: şirketler ve kurumlar
- [x] Yönetim: eğitim dönemleri (aktif dönem seçimi)
- [x] Yönetim: rol/yetki matrisi (modül × eylem)
- [x] Yönetim: denetim kaydı
- [x] Ayarlar: hesap, kurum erişimi, etkin yetki listesi
- [x] Günlük: kurulum durumu ve kuruluş özeti (Faz 8'de sabah brifingine dönüşecek)
- [x] Veritabanı test düzeneği (`npm run db:test`) — 22 güvenlik iddiası, gerçek
      PostgreSQL üzerinde doğrulandı
- [x] Tek seferde yapıştırılabilir kurulum betiği (`supabase/bundle.sql`)

**Bu fazda bilerek yapılmayanlar:** Raporlar, Operasyon, Bütçe, Reklam ve Veri
Yükleme menüde yer almıyor. Boş sayfaya götüren bir menü bağlantısı, olmayan
bağlantıdan kötüdür; bu modüller kendi fazlarında eklenecek.

## Faz 2 — Kurumlar ✅

- [x] Kurum profil sayfası ve sekmeleri (Genel Bakış, Yükümlülükler)
- [x] `recurring_obligations`: maaş (banka/nakit), kira, SGK, vergi, sigorta
- [x] Tarih sürümleme (`effective_from` / `effective_to`) — geçmiş değerler korunur
- [x] Aynı türden birden fazla yükümlülük (iki ayrı kira sözleşmesi) `stream_name` ile
- [x] Çakışmayan tarih aralığı kısıtı — veritabanı seviyesinde
- [x] Atomik sürüm geçişi (`set_recurring_obligation`): eski kapanır, yeni açılır
- [x] Şirket varsayılan maaş günü ve kurum bazında geçersiz kılma
- [x] Kira kuralları: tutar, ödeme günü, karşı taraf, artış kuralı, not
- [x] Maaşta banka + nakit = toplam kısıtı
- [x] Yaklaşan ödemeler (ay sonu taşması doğru ele alınır: 31'i olmayan ay)
- [x] Ayrı izin modülü `institutions.obligations` — para verisi `institutions:view`
      ile açılmaz
- [x] `lib/calc/obligations.ts` ve 26 birim testi (`npm run test`)
- [x] 17 veritabanı iddiası (`supabase/tests/20_obligations.sql`)

**Bu fazda bilerek yapılmayanlar:**

- `people` tablosu **ertelendi.** Yazacak ekranı olmayan tablo teslim sayılmaz.
  Faz 3'te operasyonların "sorumlu kişi" alanı ve Faz 6'da finansal hareketlerin
  karşı taraf boyutu bu tabloyu gerçekten kullanacak; o zaman eklenecek.
  Şimdilik karşı taraf serbest metin.
- Kurum profilinde Performans, Finansal, Operasyon, Bütçe, Reklam ve Ziyaretler
  sekmeleri yok — kendi fazlarıyla gelecekler.

## Faz 3 — Operasyon

- [ ] `operations` `operation_updates` `operation_files` `institution_visits`
- [ ] Genel ve kuruma göre görünüm; öncelik → termin sıralaması
- [ ] Kapalı satırda: görev, kurum, öncelik, sorumlu, termin, kalan gün,
      tahmini/gerçek maliyet, durum, ilerleme, CEO dikkati
- [ ] Sağdan açılan detay çekmecesi (sayfa değiştirmeden)
- [ ] Aktivite geçmişi, engelleyen/beklenen alanları, dosya ve fotoğraf

## Faz 4 — Veri yükleme altyapısı

- [ ] `data_import_batches` `data_import_errors`
- [ ] Yükleme akışı: tip seç → dosya → doğrula → önizle → onayla → sonuç
- [ ] Önizlemede: satır sayısı, tespit edilen kurumlar, tarih aralığı, uyarılar,
      hatalar, mükerrer kayıtlar
- [ ] Mükerrer koruma: kaynak tanımlayıcıları ve iş anahtarları
- [ ] Yükleme geçmişi ve **geri alma** (yanlış yükleme geri sarılabilir)
- [ ] Hata durumunda hangi satırın neden reddedildiği tek tek gösterilir
- [ ] Veri tipi başına ayrı yetki

> Örnek Excel dosyaları incelenmeden şablonlar sabitlenmeyecek.

## Faz 5 — Satış ve performans

- [ ] `sales_enrollments` ana verisi
- [ ] `performance_targets`: kurum × dönem × ay × metrik
- [ ] Hedef giriş ızgarası — 20 kurum için 20 pencere açılmadan, satır içi düzenleme
- [ ] Günlük / ay başından bugüne performans
- [ ] **Geçen yıl aynı tarih** karşılaştırması (öncelikli karşılaştırma budur)
- [ ] Ortalama kayıt değeri = Ciro ÷ Kayıt sayısı
- [ ] Hedef gerçekleşme (aylık ve dönemlik)
- [ ] Canlı sıralama; müdürün kendi kurumu vurgulanır
- [ ] Müdürlerin rakip verisi görüp göremeyeceği yapılandırılabilir

## Faz 6 — Finansal veri

- [ ] `financial_transactions` — hareket düzeyinde, yalnızca günlük toplam değil
- [ ] Kategori ve alt kategori ağacı, banka hesapları
- [ ] Günlük banka giriş/çıkış; gelir ve gider detayına inme çekmeceleri
- [ ] Nakit akış (günlük ve aylık)
- [ ] Son mali durum: banka, kasa, POS, çek — "kullanılabilir" ile "beklenen" ayrı
- [ ] Veri tazeliği rozeti; bayat veri görsel olarak işaretlenir

## Faz 7 — Nakit tahmini

- [ ] POS valör takvimi — para satış gününde değil, valör gününde eklenir
- [ ] Çekler vade tarihinden önce kullanılabilir sayılmaz
- [ ] Beklenen tahsilat modeli (geçen yıl × büyüme katsayısı)
- [ ] Ödeme kanalı dağılımı (şirket/kurum/dönem bazında yapılandırılabilir)
- [ ] Düzenli yükümlülüklerin tahmine otomatik akışı
- [ ] Günlük nakit eğrisi; negatif noktalar açıkça işaretlenir
- [ ] Nakit açığı tarihi ve gereken ek tahsilat/finansman tutarı
- [ ] 7 / 14 / 30 gün ve tüm dönem pencereleri

## Faz 8 — Günlük

- [ ] Yönetici sabah brifingi
- [ ] **Dikkat Gerekiyor** bloğu — yalnızca istisnalar, her satır tıklanabilir
- [ ] Performans, finans, nakit tahmini, CRM, kritik operasyonlar, kurum ziyaretleri
- [ ] Her KPI tıklanabilir ve detayına iner

## Faz 9 — Bütçe

- [ ] Dönem bütçeleri, iç içe kategoriler
- [ ] Elektronik tablo benzeri ızgara (satır: kategori, sütun: ay)
- [ ] Bütçe / gerçekleşen / sapma (mutlak ve yüzde)
- [ ] Dönem ve ay karşılaştırmaları
- [ ] Gider kompozisyonu ve toplam içindeki pay

## Faz 10 — Reklam

- [ ] `ad_sources` `ad_performance`
- [ ] CPL, randevu başına maliyet, kayıt başına maliyet, dönüşüm oranları, ROAS
- [ ] Kurum karşılaştırması
- [ ] Aynı kurum/ay için farklı kaynakların tutarsızlık analizi

---

## Her fazda geçerli

- [ ] Şema değişikliği → yeni göç dosyası. Supabase panelinden elle değişiklik yok.
- [ ] Yeni hesap → `lib/calc/` altına, birim testiyle birlikte. Sayfa içinde
      hesap yapılmaz.
- [ ] Yeni tablo → RLS açık ve politikaları yazılmış olarak gelir.
- [ ] Yeni RLS politikası → `supabase/tests/10_rls.sql` içine iddiası yazılır.
      Politika test edilmemişse yazılmamış sayılır.
- [ ] Önemli değişiklik → denetim kaydı.
- [ ] Göç eklendiğinde → `npm run db:bundle` ile birleşik betik tazelenir.
- [ ] Faz sonunda: `npm run check` (tip kontrolü + lint + birim testleri +
      derleme) ve `npm run db:test` temiz.
