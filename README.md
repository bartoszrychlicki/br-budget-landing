# BR-Budget landing

Static landing page for BR-Budget, based on the Claude Design handoff `BR-Budget Landing Page v2.html`.

Production:
- https://budget.bartoszrychlicki.com

App routes:
- `/register` redirects to the BR-Budget app registration route.
- `/login` redirects to the BR-Budget app login route.
- `/app` redirects to the protected BR-Budget app.

## Local preview

```bash
python3 -m http.server 4173
```

Open http://127.0.0.1:4173.

## Deploy

```bash
npx wrangler pages deploy . --project-name br-budget-landing --branch main
```
