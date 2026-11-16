# PlantX Store

Independent online store for PlantX Horticulture Solutions, replacing Shopify.

| Part | Folder | What it is |
| --- | --- | --- |
| Backend + admin dashboard | `apps/backend` | Medusa 2.22 (products, variants, stock, orders, customers, discounts, price lists, staff accounts) |
| Storefront | `apps/storefront` | Next.js 16 site, Arabic and English, cart and checkout |

## What is included

- **Admin dashboard** at `/app` on the backend: add and edit products, photos, prices, stock, collections, discounts and staff. Login is email and password, with roles.
- **Payments:** cash on delivery, plus Paymob (cards, mobile wallets) when Paymob keys are set. Paymob callbacks are verified with HMAC, and the backend checks every payment with Paymob before it accepts the order.
- **Shipping:** delivery prices per governorate (4 zones, editable in Settings > Locations & Shipping). Bosta integration is included and turns on when `BOSTA_API_KEY` is set.
- **WhatsApp:** after checkout the customer gets a button that sends the order to the PlantX number. In the admin, each order has "Send order confirmation" and "Send shipping update" buttons that open WhatsApp with the message ready.
- **Catalogue:** the 11 products from the old store, with images, sizes, growth stages and current offer prices (`apps/backend/seed-data/`).

## Run locally

Requirements: Node 22.23+, PostgreSQL 15+, Redis.

```bash
npm install                                       # backend workspace
cp apps/backend/.env.template apps/backend/.env   # fill in DATABASE_URL and secrets
cd apps/backend
npx medusa db:migrate                             # tables + Egypt region, shipping zones
npx medusa exec ./src/scripts/seed-plantx.ts      # PlantX products
npx medusa user -e you@example.com -p <strong password>
npm run dev                                       # http://localhost:9000/app

cd ../storefront
npm install                                       # installed separately from the backend
cp .env.template .env.local                       # publishable key: Settings > Publishable API keys
npm run dev                                       # http://localhost:8000
```

Tests: `cd apps/backend && npm run test:unit`.

## Going live

1. **Backend:** a Node server with PostgreSQL and Redis (for example Railway, Render or a VPS). Set `NODE_ENV=production`, long random `JWT_SECRET` / `COOKIE_SECRET`, `BACKEND_URL`, `STOREFRONT_URL` and the CORS variables to the real domains. Run `npm run build`, then `npm run start` in `apps/backend`.
2. **Product images:** set the `S3_*` variables (AWS S3 or Cloudflare R2) so uploads survive server restarts.
3. **Storefront:** deploy `apps/storefront` (for example on Vercel) with `MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
4. **Paymob:** set the `PAYMOB_*` variables, then in the admin open Settings > Regions > Egypt and add the Paymob payment provider. Test with Paymob test integration ids first.
5. **Bosta:** set `BOSTA_API_KEY`, then add a shipping option that uses the Bosta provider. Test with a Bosta staging account first.
6. Point `plantx-egypt.com` to the storefront and cancel the Shopify plan after a few real orders go through.
