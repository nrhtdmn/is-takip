# Canlı kurulum — is-takip-e06e2 + GitHub Pages

Repo: [nrhtdmn/is-takip](https://github.com/nrhtdmn/is-takip)  
Site: `https://nrhtdmn.github.io/is-takip/`

## 1) Firebase Authentication (zorunlu)

1. [Firebase Console](https://console.firebase.google.com/) → **is-takip-e06e2**
2. **Build → Authentication → Get started**
3. **Sign-in method → Email/Password → Enable → Save**
4. **Settings → Authorized domains** içine ekleyin:
   - `nrhtdmn.github.io`
   - `localhost`

Şifreler Auth’ta tutulur; Firestore’da `pin` yazılmaz.

## 2) Firestore Rules (zorunlu — sıkı kurallar)

1. **Firestore → Rules**
2. Repodaki `firestore.rules` dosyasının **tamamını** yapıştırın → **Publish**
3. **Indexes** sekmesinde `firestore.indexes.json` içeriğini oluşturun veya CLI ile deploy edin

Açık (`if true`) kurallarla canlıya çıkmayın.

## 3) Functions (isteğe bağlı ama önerilir)

```bash
firebase login
firebase deploy --only firestore,functions --project is-takip-e06e2
```

Functions olmadan da kayıt çalışır (istemci Auth + `uidMap`). Stripe / FCM push için Functions gerekir.

## 4) GitHub Pages

Push `main` → Actions “Deploy to GitHub Pages” çalışır.  
Repo **Settings → Pages → Deploy from branch: `gh-pages`**.

## Güvenlik özeti

| Önce | Sonra |
|------|--------|
| Herkese açık Firestore | Auth + üyelik / rol kuralları |
| `pin` düz metin profilde | Firebase Auth password |
| Tüm org/profil listesi | Sadece üye olunan alanlar |
