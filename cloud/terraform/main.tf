locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ])

  create_backend = var.deploy_backend && var.backend_image != "" && var.model_server_base_url != ""
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each = local.required_apis
  project  = var.project_id
  service  = each.value

  disable_on_destroy = false
}

resource "google_compute_network" "private" {
  name                    = "${var.app_name}-private"
  project                 = var.project_id
  auto_create_subnetworks = false

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "runtime" {
  name                     = "${var.app_name}-runtime"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.private.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
}

# Restrict the future model-serving VM/endpoint to the backend subnet.
# A VM must use the "nisakshi-model-server" network tag to receive this rule.
resource "google_compute_firewall" "model_server_ingress" {
  name      = "${var.app_name}-model-server-ingress"
  project   = var.project_id
  network   = google_compute_network.private.name
  direction = "INGRESS"
  priority  = 1000

  source_ranges = [var.subnet_cidr]
  target_tags   = ["nisakshi-model-server"]

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  project       = var.project_id
  repository_id = "${var.app_name}-containers"
  description   = "Private container images for NISAKSHI services"
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "private_user_files" {
  name                        = "${var.project_id}-${var.app_name}-${var.bucket_suffix}"
  project                     = var.project_id
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  labels = {
    app         = var.app_name
    data_class  = "private-user-files"
    environment = "production"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}

resource "google_service_account" "backend" {
  project      = var.project_id
  account_id   = "${var.app_name}-backend"
  display_name = "NISAKSHI FastAPI backend"
  description  = "Least-privilege runtime identity for the NISAKSHI backend"
}

resource "google_storage_bucket_iam_member" "backend_object_user" {
  bucket = google_storage_bucket.private_user_files.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret" "auth_secret" {
  project   = var.project_id
  secret_id = var.auth_secret_name

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "model_api_key" {
  project   = var.project_id
  secret_id = var.model_api_key_secret_name

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "backend_auth_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.auth_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_model_key_accessor" {
  count     = var.use_model_api_key ? 1 : 0
  project   = var.project_id
  secret_id = google_secret_manager_secret.model_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "cloud_run_network_user" {
  project = var.project_id
  role    = "roles/compute.networkUser"
  member  = "serviceAccount:service-${data.google_project.current.number}@serverless-robot-prod.iam.gserviceaccount.com"

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "backend" {
  count    = local.create_backend ? 1 : 0
  name     = "${var.app_name}-api"
  project  = var.project_id
  location = var.region
  ingress  = var.allow_public_invocation ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"

  deletion_protection = true

  template {
    service_account                  = google_service_account.backend.email
    timeout                          = "300s"
    max_instance_request_concurrency = 10

    scaling {
      min_instance_count = 0
      max_instance_count = var.backend_max_instances
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = google_compute_network.private.id
        subnetwork = google_compute_subnetwork.runtime.name
        tags       = ["nisakshi-backend"]
      }
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name  = "PORT"
        value = "8000"
      }

      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "FRONTEND_ORIGINS"
        value = var.frontend_origins
      }

      env {
        name  = "MODEL_SERVER_BASE_URL"
        value = var.model_server_base_url
      }

      env {
        name  = "NISAKSHI_MODEL_ID"
        value = var.nisakshi_model_id
      }

      env {
        name  = "NISAKSHI_ALLOWED_MODELS"
        value = var.nisakshi_allowed_models
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.private_user_files.name
      }

      dynamic "env" {
        for_each = var.use_model_api_key ? [1] : []
        content {
          name = "MODEL_SERVER_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.model_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.required,
    google_project_iam_member.cloud_run_network_user,
    google_secret_manager_secret_iam_member.backend_auth_accessor,
    google_storage_bucket_iam_member.backend_object_user,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count    = local.create_backend && var.allow_public_invocation ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
