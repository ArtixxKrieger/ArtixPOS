# ArtixPOS — VPS Deployment Guide

Two paths: **Docker** (easier) or **bare Node.js with PM2** (more control).

---

## Option A — Docker Compose (recommended)

### 1. Requirements on the VPS
```bash
# Ubuntu / Debian
apt update && apt install -y docker.io docker-compose-plugin git
```

### 2. Clone and configure
```bash
git clone https://your-repo-url artixpos
cd artixpos
cp .env.example .env
nano .env   # fill in SESSION_SECRET and any optional keys
```

### 3. Start everything
```bash
docker compose up -d --build
```

PostgreSQL and the app start together. The app is available on **port 5000**.

### 4. Run database migrations
```bash
docker compose exec app node -e "import('./dist/index.cjs')" || true
# migrations run automatically on first boot via ensureIndexes()
```

### 5. Put nginx in front (HTTPS)
```bash
apt install -y nginx certbot python3-certbot-nginx
cp deploy/nginx.conf /etc/nginx/sites-available/artixpos
# Edit yourdomain.com → your actual domain
nano /etc/nginx/sites-available/artixpos
ln -s /etc/nginx/sites-available/artixpos /etc/nginx/sites-enabled/artixpos
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com   # free TLS from Let's Encrypt
```

### Useful commands
| Task | Command |
|---|---|
| View logs | `docker compose logs -f app` |
| Restart app | `docker compose restart app` |
| Update app | `git pull && docker compose up -d --build` |
| Database shell | `docker compose exec db psql -U artixpos` |
| Stop everything | `docker compose down` |

---

## Option B — Bare Node.js + PM2

### 1. Requirements on the VPS
```bash
# Node.js 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm use 22

# PM2 process manager
npm install -g pm2

# PostgreSQL
apt install -y postgresql postgresql-contrib
```

### 2. Create the database
```bash
sudo -u postgres psql -c "CREATE USER artixpos WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE artixpos OWNER artixpos;"
```

### 3. Clone and configure
```bash
git clone https://your-repo-url artixpos
cd artixpos
cp .env.example .env
nano .env   # fill in DATABASE_URL, SESSION_SECRET, etc.
```

### 4. Install dependencies and build
```bash
npm ci --ignore-scripts
npm run build
```

### 5. Apply database schema
```bash
npm run db:push
```

### 6. Start with PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save          # persist across reboots
pm2 startup       # auto-start on server reboot (follow the printed command)
```

### 7. Put nginx in front (HTTPS)
```bash
apt install -y nginx certbot python3-certbot-nginx
cp deploy/nginx.conf /etc/nginx/sites-available/artixpos
nano /etc/nginx/sites-available/artixpos   # set your domain
ln -s /etc/nginx/sites-available/artixpos /etc/nginx/sites-enabled/artixpos
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com
```

### Useful commands
| Task | Command |
|---|---|
| View logs | `pm2 logs artixpos` |
| Restart | `pm2 restart artixpos` |
| Zero-downtime reload | `pm2 reload artixpos` |
| Update app | `git pull && npm ci && npm run build && pm2 reload artixpos` |
| Monitor | `pm2 monit` |

---

## Environment variables

See `.env.example` for the full list. Only two are strictly required:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 64-character random string — generate with `openssl rand -hex 32` |

Everything else is optional and degrades gracefully when unset.

---

## Multi-core performance

The app ships with a built-in Node.js cluster mode. When started via `dist/cluster.cjs` (what PM2 and Docker both use), it automatically forks **one worker per CPU core**. A 4-core VPS runs 4 parallel Node processes with no extra config.

To limit the number of cores used:
```bash
CLUSTER_WORKERS=2 pm2 start ecosystem.config.cjs
```

---

## Minimum VPS specs

| Load | RAM | CPU | Storage |
|---|---|---|---|
| Single store, low traffic | 1 GB | 1 vCPU | 20 GB SSD |
| Multi-branch, moderate traffic | 2 GB | 2 vCPU | 40 GB SSD |
| Enterprise / high traffic | 4 GB+ | 4+ vCPU | 80 GB+ SSD |
