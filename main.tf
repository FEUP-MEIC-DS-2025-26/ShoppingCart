terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.9.0"
    }
  }

  required_version = ">= 1.6"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ------------------------------------------------------------
# Enable required APIs
# ------------------------------------------------------------
resource "google_project_service" "run" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

# ------------------------------------------------------------
# Backend Cloud Run Service
# ------------------------------------------------------------
locals {
  backend_env = [
    for line in split("\n", file("${path.module}/backend/.env")) :
    line
    if length(trim(line, " \r\t")) > 0
    && !startswith(trim(line, " \r\t"), "#")
  ]
}

resource "google_cloud_run_service" "backend" {
  name     = "backend-service"
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/app-repo/backend:latest"

        ports {
          container_port = 4000
        }

        dynamic "env" {
          for_each = [
            for e in local.backend_env : {
              name  = split("=", e)[0]
              value = join("=", slice(split("=", e), 1, length(split("=", e))))
            }
            if split("=", e)[0] != "PORT"
          ]

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

  depends_on = [
    google_project_service.run
  ]
}

# ------------------------------------------------------------
# Frontend Cloud Run Service
# ------------------------------------------------------------
resource "google_cloud_run_service" "frontend" {
  name     = "frontend-service"
  location = var.region

  template {
    spec {
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/app-repo/frontend:latest"
        ports {
          container_port = 3000
        }
        resources {
          limits = {
            memory = "1Gi"
          }
        }
        env {
          name  = "BACKEND_URL"
          value = google_cloud_run_service.backend.status[0].url
        }
      }
    }
  }

  autogenerate_revision_name = true

  depends_on = [
    google_cloud_run_service.backend
  ]
}

# ------------------------------------------------------------
# Public Access
# ------------------------------------------------------------
resource "google_cloud_run_service_iam_member" "frontend_invoker" {
  service  = google_cloud_run_service.frontend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_service_iam_member" "backend_invoker" {
  service  = google_cloud_run_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ------------------------------------------------------------
# Variables
# ------------------------------------------------------------
variable "project_id" {
  type    = string
  default = "madeinportugal-store-ds2025"
}

variable "region" {
  type    = string
  default = "europe-west2"
}

# --- PUBLISHER ---

# 1. Define a specific provider for the external project
provider "google" {
  alias       = "pubsub_project_auth"
  project     = "ds-2526-mips"
  # This tells Terraform to login using the key file you just saved
  credentials = file("${path.module}/pubsubkey.json") 
}

# 2. Update the resource to use that specific provider
resource "google_pubsub_topic_iam_member" "publisher_binding" {
  provider = google.pubsub_project_auth # <--- IMPORTANT: Point to the alias above
  
  project = "ds-2526-mips"
  topic   = "add_to_cart"
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:pubsub-backend@ds-2526-mips.iam.gserviceaccount.com"
}