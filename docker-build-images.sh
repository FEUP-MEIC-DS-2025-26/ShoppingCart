# Backend
docker build --platform linux/amd64 -t europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/backend:latest ./backend --build-arg DB_ENV=production
docker push europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/backend:latest

# Frontend
docker build --platform linux/amd64 -t europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/frontend:latest ./MIPS-frontend
docker push europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/frontend:latest