terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }

  required_version = ">= 1.6"
}

data "google_client_config" "default" {}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "docker" {
  registry_auth {
    address  = "${var.region}-docker.pkg.dev"
    username = "oauth2accesstoken"
    password = data.google_client_config.default.access_token
  }
}

# Build backend image
resource "docker_image" "backend" {
  name = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/backend:latest"
  build {
    context = "${path.module}/backend"
  }
}

# Build frontend image
resource "docker_image" "frontend" {
  name = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/frontend:latest"
  build {
    context = "${path.module}/frontend"
  }

  depends_on = [docker_image.backend]
}

# Load backend .env file into a variable
locals {
  backend_env = [
    for line in split("\n", file("${path.module}/backend/.env")) :
    line
    if length(trim(line, " \r\t")) > 0 && !startswith(trim(line, " \r\t"), "#")
  ]
}

# Push backend image
resource "docker_registry_image" "backend_push" {
  name = docker_image.backend.name
  depends_on = [docker_image.backend]
}

# Push frontend image
resource "docker_registry_image" "frontend_push" {
  name = docker_image.frontend.name
  depends_on = [docker_registry_image.backend_push, docker_image.frontend]
}

# Enable required APIs
resource "google_project_service" "run" {
  service = "run.googleapis.com"
}

resource "google_project_service" "artifact_registry" {
  service = "artifactregistry.googleapis.com"
}

# Create Artifact Registry
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "app-repo"
  format        = "DOCKER"
  depends_on    = [google_project_service.artifact_registry]
}

# Deploy Cloud Run backend
resource "google_cloud_run_service" "backend" {
  name     = "backend-service"
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/backend:latest"
        dynamic "env" {
          for_each = [for e in local.backend_env : {
            name  = split("=", e)[0]
            value = join("=", slice(split("=", e), 1, length(split("=", e))))
          } if split("=", e)[0] != "PORT"] # <-- SKIP PORT if it exists
          content {
            name  = env.value.name
            value = env.value.value
          }
        }
        env {
          name  = "NODE_ENV"
          value = "production"
        }
      }
    }
  }

  autogenerate_revision_name = true
  depends_on = [google_project_service.run, docker_registry_image.backend_push]
}

# 5. Deploy Cloud Run frontend
resource "google_cloud_run_service" "frontend" {
  name     = "frontend-service"
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/frontend:latest"

        #env {
        #  name  = "BACKEND_URL"
        #  value = google_cloud_run_service.backend.status[0].url
        #}
      }
    }
  }

  autogenerate_revision_name = true
  depends_on = [google_cloud_run_service.backend, docker_registry_image.frontend_push]
}

# 6. Allow public access
resource "google_cloud_run_service_iam_member" "frontend_invoker" {
  service  = google_cloud_run_service.frontend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [ google_cloud_run_service.frontend ]
}

resource "google_cloud_run_service_iam_member" "backend_invoker" {
  service  = google_cloud_run_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"

  depends_on = [ google_cloud_run_service.backend ]
}

# Variables
variable "project_id" {
  type    = string
}
variable "region" {
  type    = string
  default = "europe-west2"
}
