# Golden Plate Catering

A dependency-light, responsive website for Golden Plate Catering. The project uses Node's built-in HTTP server, a static frontend, and server-side JSON persistence for the current enquiry and review workflows.

## Run locally

```sh
npm run check
npm run build
npm test
npm start
```

Open `http://127.0.0.1:3000`. Development mode uses `npm run dev`.

No package installation is currently required beyond Node.js 20 or newer.

## Configuration

Copy `.env.example` to `.env` and provide values before local use, or inject the same variables through the deployment environment. The server reads a local `.env` without overriding variables already supplied by the host. The public contact and social values are deliberately blank until the client supplies and approves them. `ADMIN_USERNAME` and `ADMIN_PASSWORD` are required for the protected moderation endpoints; use a long random password and inject them through the deployment environment.

The current persistence layer writes `data/reviews.json` and `data/enquiries.json`. These files are ignored by Git. For a multi-instance deployment, replace this adapter with an approved managed database and add migrations/backups before launch.

## Implemented routes

- `/`, `/about/`, `/services/`, `/work/`, `/menu/`, `/reviews/`, `/contact/`, and `/privacy/`
- `GET /api/health`
- `GET /api/config`
- `GET` and `POST /api/reviews`
- `POST /api/enquiries`
- Authenticated `GET /api/admin/reviews`
- Authenticated `PATCH` and `DELETE /api/admin/reviews/:id`
- Authenticated `GET /api/admin/enquiries`

Review and enquiry submissions use server-side validation, JSON persistence, a honeypot field, and an in-memory per-IP rate limit. The rate limit is intentionally documented as single-process protection; use an edge/WAF or shared store for a horizontally scaled deployment.

## Client information still required

- Approved business story, values, team details, and service list.
- Confirmed published menu names, descriptions, dietary/allergen information, prices, and availability where applicable.
- Real email address, telephone number, WhatsApp number, and enquiry destination.
- Facebook, Instagram, and TikTok URLs.
- Production domain.
- Approved privacy/retention wording and the review administrator/ownership process.
- Hosting and database preference if the application will scale beyond a single server.

No testimonials, ratings, addresses, opening hours, prices, social URLs, or business claims have been fabricated.
