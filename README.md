# Golden Plate Catering

A dependency-light, responsive website for Golden Plate Catering. The project uses Node's built-in HTTP server, a static frontend, and server-side JSON persistence for the current enquiry and review workflows.

## Run locally

```sh
npm ci
npm run check
npm run build
npm test
npm start
```

Open `http://127.0.0.1:3000`. Development mode uses `npm run dev`.

Use Node.js 22 or newer for local development.

## Docker

Build and run the container with a persistent data volume:

```sh
docker build -t golden-plate-catering .
docker volume create golden-plate-data
docker run --rm -p 3000:3000 \
	-v golden-plate-data:/data \
	-e ADMIN_USERNAME='your-admin-name' \
	-e ADMIN_PASSWORD='use-a-long-random-password' \
	golden-plate-catering
```

The image runs as the unprivileged `node` user, exposes port 3000, and includes a health check. Keep `/data` on a persistent volume when using JSON-file persistence. For production, inject secrets through the platform's secret manager rather than baking them into the image or source tree.

## GitHub Actions

The workflow runs dependency installation, syntax checks, the build check, tests, and a container build for pull requests to `main`. Pushes to `main` publish the image to GitHub Container Registry as `ghcr.io/<owner>/<repository>:sha-<commit>` and `:latest`.

This publishes an image but does not deploy it. Production currently provisions a host-based systemd service from a Terraform-managed S3 tarball. Before enabling automatic rollout, migrate the EC2 bootstrap and service to Docker, choose a persistent `/data` strategy, and give Actions narrowly scoped AWS access through GitHub OIDC and SSM (or another controlled deployment mechanism). Do not deploy merely by replacing the S3 object: the current service does not restart itself on artifact changes.

## Configuration

Copy `.env.example` to `.env` and provide values before local use, or inject the same variables through the deployment environment. The server reads a local `.env` without overriding variables already supplied by the host. The public contact and social values are deliberately blank until the client supplies and approves them. `ADMIN_USERNAME` and `ADMIN_PASSWORD` are required for the protected moderation endpoints; use a long random password and inject them through the deployment environment.

The current persistence layer writes `data/reviews.json` and `data/enquiries.json`. These files are ignored by Git. For a multi-instance deployment, replace this adapter with an approved managed database and add migrations/backups before launch.

## Implemented routes

- `/`, `/about/`, `/services/`, `/work/`, `/menu/`, `/reviews/`, `/contact/`, and `/privacy/`
- `/admin/` for the owner enquiry dashboard; sign in using the configured `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
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
