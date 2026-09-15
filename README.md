# İş Takip

Şirket → grup → görev yapısında iş takip PWA’sı.

- **Şirket izolasyonu:** A Şirketi B’yi görmez (ve tersi)
- **Çoklu rol:** Aynı kişi A’da yönetici, B’de ulaştırma memuru olabilir
- **Yönetici:** Şirketteki tüm grupları / görevleri görür; kişileri şirkete ekler ve gruplara işaretler
- **Miad:** Tarih/saat yoksa miadsız; varsa kalan süre + miad günü geri sayım
- **3 plan:** Reklamlı (ücretsiz) · Başlangıç (₺49/ay, kısıtlı) · Premium (₺149/ay, sınırsız)

## Planlar

| Plan | Fiyat | Reklam | Limitler |
| --- | --- | --- | --- |
| Reklamlı | Ücretsiz | Altta nazik sponsor bandı (günde 1 kez kapatılabilir) | Sınırsız |
| Başlangıç | ₺49 / ay | Yok | Kişi başı 10 açık görev, 1 grup, 5 üye |
| Premium | ₺149 / ay | Yok | Sınırsız |

> Ödeme kapısı henüz bağlı değil; yönetici abonelik ekranından planı seçer (demo aktivasyon). Stripe vb. sonra eklenebilir.

## Hızlı başlangıç

```bash
npm install
npm run dev
```

Varsayılan uygulama şifresi: `123456` (`.env` → `VITE_FAMILY_PASSWORD`)

Firebase yoksa **demo modu** çalışır (veri bu cihazda).

## Yeni GitHub + yeni Firestore

Bu repo’yu **yeni bir GitHub** deposuna bağlayıp **ayrı bir Firebase projesi** kullanabilirsiniz:

1. [Firebase Console](https://console.firebase.google.com/) → yeni proje → Firestore
2. `firestore.rules` dosyasını yayınlayın
3. Web uygulaması ekleyip config’i kopyalayın
4. `.env.example` → `.env` yapıp değerleri yapıştırın
5. Yeni GitHub repo oluşturun ve push edin
6. GitHub Pages / Actions ile yayınlayın (`vite` `base` ayarına dikkat)

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FAMILY_PASSWORD=123456
```

Eski aile uygulamasından bağımsızdır; koleksiyonlar: `profiles`, `organizations`, `memberships`, `groups/{id}/tasks`.

## Kullanım akışı

1. Uygulama şifresi → profil seç
2. Şirket seç / oluştur (kurucu = yönetici)
3. Yönetimden kişileri şirkete ekle (rol + unvan)
4. Grup oluştur; üyeleri işaretle
5. Görev ekle (isteğe bağlı miad)
6. Durum güncelle, not yaz

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run preview` | Derlenmiş sürümü önizle |

## Telefona kurma (PWA)

- **Android:** Menü → Ana ekrana ekle
- **iPhone:** Paylaş → Ana Ekrana Ekle
