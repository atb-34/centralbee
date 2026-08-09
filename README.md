# CentralBee

Çok kurumlu bir eğitim grubu için yönetici işletim sistemi. Performans, finans,
nakit, operasyon, bütçe ve reklamı tek üründe birleştirir.

- Mimari kararlar → [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- Faz planı ve yapılacaklar → [`docs/CHECKLIST.md`](./docs/CHECKLIST.md)

**Şu anki durum: Faz 1 — Temel.** Giriş, kullanıcı ve yetki sistemi, şirket/kurum
yönetimi, eğitim dönemleri ve denetim kaydı hazır. Raporlar, veri yükleme,
operasyon, bütçe ve reklam sonraki fazlarda gelecek.

---

## Kurulum

Teknik bilgi gerektirmeyen, adım adım rehber. Baştan sona yaklaşık 15 dakika.

### Adım 1 — Supabase'de veritabanını hazırlayın

1. [supabase.com](https://supabase.com) → projenizi açın.
2. Sol menüden **SQL Editor** → sağ üstten **New query**.
3. Bu depodaki `supabase/migrations/` klasöründeki dosyaları **sırayla** açın.
   Her birinin içeriğini kopyalayıp SQL Editor'e yapıştırın ve **Run** deyin.

   Sıra önemlidir, numaraya göre gidin:

   ```
   0001_foundation.sql
   0002_organisation.sql
   0003_identity_and_access.sql
   0004_audit_log.sql
   0005_rls.sql
   0006_permission_catalogue.sql
   0007_education_periods_seed.sql
   ```

   Her çalıştırmadan sonra yeşil bir "Success" mesajı görmelisiniz. Kırmızı bir
   hata görürseniz durun — sonraki dosyaya geçmeyin.

> Supabase CLI kullanmayı tercih ederseniz: `supabase link` ardından
> `supabase db push` aynı işi yapar.

### Adım 2 — Bağlantı bilgilerini alın

Supabase panelinde **Project Settings**'i açın ve şu üç değeri kopyalayın:

| Nerede | Ne | Nereye yazılacak |
| --- | --- | --- |
| Data API → Project URL | `https://xxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| API Keys → `anon` / `publishable` | uzun bir metin | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| API Keys → `service_role` / `secret` | uzun bir metin | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ `service_role` anahtarı tüm güvenlik kurallarını atlar. Kimseyle
> paylaşmayın, ekran görüntüsü almayın, mesajla göndermeyin.

### Adım 3 — Vercel'e yayınlayın

1. [vercel.com](https://vercel.com) → **Add New → Project**.
2. GitHub'dan `centralbee` deposunu seçin.
3. **Environment Variables** bölümüne Adım 2'deki üç değeri ekleyin.
4. Bir tane daha ekleyin:

   ```
   AUTH_EMAIL_DOMAIN = users.centralbee.app
   ```

   Bu, kullanıcı adlarının arka planda eşlendiği teknik alan adıdır. Bu adrese
   posta gitmez. **Sonradan değiştirmeyin** — değişirse kimse giriş yapamaz.
5. **Deploy** deyin ve bitmesini bekleyin.

### Adım 4 — İlk yöneticiyi oluşturun

Yayın adresinin sonuna `/setup` ekleyerek açın:

```
https://sizin-adresiniz.vercel.app/setup
```

Ad soyad, kullanıcı adı ve şifre girin. Bu ekran **yalnızca bir kez çalışır**;
ilk hesap oluşturulduktan sonra kendini kalıcı olarak kapatır.

Ardından `/login` adresinden kullanıcı adınız ve şifrenizle girin.

### Adım 5 — Sistemi doldurun

Giriş yaptıktan sonra **Günlük** sayfası size ne eksik olduğunu söyler:

1. **Yönetim → Şirketler ve Kurumlar** — önce şirketleri, sonra kurumları ekleyin.
2. **Yönetim → Eğitim Dönemleri** — içinde bulunduğunuz dönemin aktif olduğunu doğrulayın.
3. **Yönetim → Kullanıcılar** — ekibi ekleyin, rollerini ve görebilecekleri
   kurumları seçin.

---

## Geliştirme

Kendi bilgisayarınızda çalıştırmak isterseniz:

```bash
npm install
cp .env.example .env.local   # değerleri Adım 2'den doldurun
npm run dev                  # http://localhost:3000
```

Kullanılabilir komutlar:

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run lint` | Kod denetimi |
| `npm run check` | Üçünü birden çalıştırır — her fazın sonunda temiz olmalı |

### Şema değiştirmek

Supabase panelinden elle tablo değiştirmeyin. `supabase/migrations/` altına yeni
numaralı bir dosya ekleyin ve aynı commit'te `types/database.ts` dosyasını
güncelleyin. Şemanın tek kaynağı göç dosyalarıdır.

## Teknoloji

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Supabase (PostgreSQL, Auth, RLS) · Vercel
