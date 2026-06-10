# BR-Budget landing

Static landing page for BR-Budget (paper & ink editorial, GSAP + Three.js z CDN).
Źródło prawdy: `br-budget/public/landing/` w repo aplikacji — ten katalog to
lustro deployowane na Cloudflare Pages (przy aktualizacji kopiujemy pliki stamtąd).

Production:
- https://budget.bartoszrychlicki.com

App routes (`_redirects` zostawia je aplikacji BR-Budget):
- `/register`, `/login`, `/app`.

## Local preview

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173. (Assety ładują się z `/landing/...`, więc serwuj cały katalog.)

## Deploy

```bash
npx wrangler pages deploy . --project-name br-budget-landing --branch main
```
