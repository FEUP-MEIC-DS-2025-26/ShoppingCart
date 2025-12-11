docker build -t europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/frontend:latest ./MIPS-frontend
docker push europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/frontend:latest
docker build -t europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/backend:latest ./backend
docker push europe-west2-docker.pkg.dev/madeinportugal-store-ds2025/app-repo/backend:latest