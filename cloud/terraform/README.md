# NISAKSHI — Google Cloud Foundation

This Terraform module prepares a Google Cloud foundation; it does not deploy or pay for anything until you run `terraform apply`. It is deliberately staged so the first apply creates the private bucket, registry, service identity, secret resources, VPC and firewall rule—but not the public backend service or a model VM.

## What it provisions

- Required Google Cloud APIs
- Custom VPC and subnet with Private Google Access
- A firewall rule permitting TCP/8080 only from the backend subnet to VMs tagged `nisakshi-model-server`
- Private Artifact Registry Docker repository with immutable tags
- Private Cloud Storage bucket with Uniform bucket-level access and Public Access Prevention enforced
- Backend service account with object access restricted to this bucket
- Secret Manager secret resources and least-privilege secret accessor grants
- Optional Cloud Run FastAPI backend with Direct VPC egress

The model-server host, database migration, domain, DNS, load balancer, object-upload routes, and production quotas are not provisioned by this module. The frontend currently uses a server-side Next.js deployment and PostgreSQL configured separately. Cloud resources incur charges, and this configuration has **not** been applied to a real project.

## Prerequisites

- A Google Cloud project with billing deliberately enabled
- Terraform 1.5+
- Google Cloud CLI installed and authenticated as a principal permitted to enable APIs and create the listed resources
- A reviewed monthly budget and a region decision
- A private model-server endpoint ready before deploying the FastAPI service

The default region is `asia-south1` (Mumbai); change it if quota, model compute, policy or cost requires another region.

## Stage A — review and create the foundation

1. Copy `terraform.tfvars.example` to `terraform.tfvars`.
2. Replace `project_id` and `bucket_suffix`. The bucket name must be globally unique. Do not commit the real `terraform.tfvars`.
3. Authenticate and set the project:

   ```powershell
   gcloud auth login
   gcloud config set project YOUR_GCP_PROJECT_ID
   ```

4. From `cloud/terraform`, initialize and validate the plan:

   ```powershell
   terraform init
   terraform fmt -check
   terraform validate
   terraform plan
   ```

5. Read the plan line by line before applying. Then:

   ```powershell
   terraform apply
   ```

This first apply creates cloud resources and may incur storage, registry/network, API, or other project charges. The user-file bucket is protected against public access and Terraform destruction; do not weaken these settings without a specific retention/deletion plan.

## Stage B — add secrets and deploy later

The `nisakshi-auth-secret` Secret Manager resource is created without a secret value. Add a strong secret version only after deciding the value that must match the deployed Auth.js frontend:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Store the generated value securely and add it as a Secret Manager version.
# Example:
# gcloud secrets versions add nisakshi-auth-secret --data-file=auth-secret.txt
```

Use a protected local file with minimal permissions and delete it securely after upload. Do not paste the secret into chat or commit it to Git. Use the exact same value in the frontend host's `AUTH_SECRET`.

Build and push the backend image to the generated Artifact Registry repository. Then update `terraform.tfvars` with the image URI, the private model-server URL, exact frontend origin, and `deploy_backend = true`. Run `terraform plan` again and review it before `terraform apply`.

### Public invocation warning

`allow_public_invocation` defaults to `false`. This means an externally hosted Vercel frontend cannot call the API until you intentionally decide how service invocation is authenticated. Setting it to `true` creates a public Cloud Run invoker binding. Only do that after verifying the signed service-token boundary, rate limits/quotas, request-size limits, monitoring, and safe public health behavior. CORS is not an authentication mechanism.

## Private model-server connectivity

A model server should be deployed on a private address inside the created VPC, with network tag `nisakshi-model-server`, listening on port 8080. The firewall rule allows that port only from the configured backend subnet. Set `MODEL_SERVER_BASE_URL` to a base URL that ends in `/v1`, for example `http://10.42.0.10:8080/v1`. Do not expose the model server to the public internet.

The actual model-server VM/container, model weights, model license acceptance, GPU shape, boot disk, startup process and shutdown/cost controls still need to be selected and deployed. Do not invent a model ID; set it to the exact alias configured on the server.

## Data protection boundaries

- The bucket enforces public-access prevention and uniform bucket-level IAM.
- Only the backend service account is granted object-user access by this module; application code must still verify each object owner before reads/deletes.
- The bucket has Terraform `prevent_destroy` and `force_destroy=false` to reduce accidental data loss. Account deletion/retention still needs an explicit cleanup process in the application.
- The database is not moved by this module. The current app uses a configured PostgreSQL URL in the Next.js deployment; a later migration must preserve backups and prove connectivity before cutting over.
- Secrets are values in Secret Manager, not Terraform variables; Terraform state can itself contain sensitive resource metadata, so use a private remote state backend before team/production operation.
