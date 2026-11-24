# Hello Interview Revision

Static revision app (Study / Revise / Quiz) on GitHub Pages. Review stages, weak flags and quiz log persist in MongoDB through one small serverless function.

```
Browser (GitHub Pages)  --Bearer APP_TOKEN-->  /api/state (Vercel)  -->  MongoDB
```

GitHub Pages is static, so the Mongo connection string cannot live in the page. It lives only as `MONGODB_URI` on the API host.

## Setup
1. Deploy this repo to Vercel (import it; the `api/` folder becomes the function). Set env vars: `MONGODB_URI`, `APP_TOKEN` (any long random string), optional `MONGODB_DB` (default `hello_interview`) and `ALLOWED_ORIGIN` (your Pages URL).
2. In this repo: Settings > Secrets and variables > Actions > Variables, add `API_BASE` = your Vercel URL (no trailing slash). Re-run the Pages workflow.
3. Open the Pages site, click "Set token", paste `APP_TOKEN`.

Source of truth for concept content is still the Claude Project chapter files; edit `CONCEPTS` in `public/index.html` to change them.
