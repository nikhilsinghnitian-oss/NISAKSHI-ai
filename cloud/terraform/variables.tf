variable "project_id" {
  description = "Existing Google Cloud project ID. Billing must be enabled before apply."
  type        = string
}

variable "region" {
  description = "Primary region for Cloud Run, Artifact Registry and private storage."
  type        = string
  default     = "asia-south1"
}

variable "app_name" {
  description = "Short lowercase prefix used for resource names."
  type        = string
  default     = "nisakshi"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.app_name))
    error_message = "app_name must be 3-20 lowercase letters, numbers, or hyphens and start with a letter."
  }
}

variable "bucket_suffix" {
  description = "Globally unique lowercase suffix for the private Cloud Storage bucket."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{4,20}$", var.bucket_suffix))
    error_message = "bucket_suffix must be 4-20 lowercase letters, numbers, or hyphens."
  }
}

variable "deploy_backend" {
  description = "Create the Cloud Run backend only after image, secret version, and model endpoint are prepared."
  type        = bool
  default     = false
}

variable "backend_image" {
  description = "Built backend image URI in Artifact Registry. Required when deploy_backend=true."
  type        = string
  default     = ""
}

variable "model_server_base_url" {
  description = "Base URL for your self-hosted model server, normally ending in /v1. Required when deploy_backend=true."
  type        = string
  default     = ""
}

variable "nisakshi_model_id" {
  description = "Model alias exposed by the private inference server."
  type        = string
  default     = "nisakshi-local"
}

variable "nisakshi_allowed_models" {
  description = "Comma-separated server-approved model IDs; empty means only NISAKSHI_MODEL_ID is allowed."
  type        = string
  default     = ""
}

variable "frontend_origins" {
  description = "Comma-separated exact HTTPS origins that are permitted by backend CORS."
  type        = string
  default     = "https://nisakshi-flashcard-studio.vercel.app"
}

variable "auth_secret_name" {
  description = "Secret Manager secret ID for the shared Auth.js/backend HMAC secret."
  type        = string
  default     = "nisakshi-auth-secret"
}

variable "model_api_key_secret_name" {
  description = "Secret Manager secret ID for an optional private model-server API key."
  type        = string
  default     = "nisakshi-model-server-api-key"
}

variable "use_model_api_key" {
  description = "Mount the optional model-server API key as an environment variable. Add a secret version first."
  type        = bool
  default     = false
}

variable "allow_public_invocation" {
  description = "Grant unauthenticated Cloud Run invocation. Needed for Vercel without an IAM-aware proxy; keep false until app-token protections and quotas are reviewed."
  type        = bool
  default     = false
}

variable "backend_max_instances" {
  description = "Maximum Cloud Run backend instances to cap scale-up spend."
  type        = number
  default     = 2

  validation {
    condition     = var.backend_max_instances >= 1 && var.backend_max_instances <= 10
    error_message = "backend_max_instances must be between 1 and 10."
  }
}

variable "subnet_cidr" {
  description = "Private subnet CIDR for Cloud Run Direct VPC egress and internal inference services."
  type        = string
  default     = "10.42.0.0/24"
}
