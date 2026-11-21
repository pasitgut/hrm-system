# Scripts

| Folder | Purpose | How to run |
|---|---|---|
| `db/` | Schema migration, local seed data, volume seed, ImgBB → Cloudinary migration | `npm run db:migrate`, `db:seed`, `db:seed-volume`, `db:migrate-imgbb-cloudinary` |
| `verify/` | Report, PDF and salary-slip verification runs (fixtures or a live database) | `npx tsx --env-file-if-exists=.env scripts/verify/<name>.ts` |
| `migration/` | AppSheet → HRM data import (Python) and archived one-off SQL imports | see [`migration/README.md`](migration/README.md) |

`db:seed` and `db:seed-volume` rewrite data: they refuse to run when `NODE_ENV`/`VERCEL_ENV` is `production` or `DATABASE_URL` points at Neon, unless `ALLOW_DESTRUCTIVE_DB_SCRIPTS=1` is set (`db/guard.ts`).
