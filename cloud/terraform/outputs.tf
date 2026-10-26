output "private_bucket_name" {
  description = "Private user-file bucket. It has public-access prevention and cannot be destroyed by this module without changing lifecycle protection."
  value       = google_storage_bucket.private_user_files.name
}

output "artifact_registry_repository" {
  description = "Private Artifact Registry Docker repository."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "backend_service_account" {
  description = "Runtime service account for FastAPI."
  value       = google_service_account.backend.email
}

output "private_vpc_name" {
  description = "VPC network used by Cloud Run Direct VPC egress and private model services."
  value       = google_compute_network.private.name
}

output "private_subnet_name" {
  description = "Subnet used by the backend for private egress."
  value       = google_compute_subnetwork.runtime.name
}

output "model_server_firewall_rule" {
  description = "Firewall rule that allows port 8080 from the backend subnet to tagged model-server hosts only."
  value       = google_compute_firewall.model_server_ingress.name
}

output "backend_url" {
  description = "Cloud Run API URL; empty until deploy_backend=true, backend_image and model_server_base_url are configured."
  value       = try(google_cloud_run_v2_service.backend[0].uri, "")
}

output "auth_secret_id" {
  description = "Secret Manager ID. Add a high-entropy secret version after applying the foundation."
  value       = google_secret_manager_secret.auth_secret.secret_id
}
