# Run NISAKSHI with a self-hosted local model

This stack is for local development and API verification. It does not deploy anything to the cloud. The model server is reachable only on the Compose network; only FastAPI is published to localhost.

## 1. Prerequisites

- Docker Desktop with Docker Compose
- Python is optional; tests run in CI
- A GGUF model file that is compatible with llama.cpp and whose license permits your intended use

## 2. Prepare the model

1. Create a `models` directory in the repository root.
2. Download a quantized GGUF model from a source you trust.
3. Read the model card and license before use.
4. Save the file as `models/model.gguf`, or change `MODEL_FILE` in the root `.env` file to match the filename.

Model weights are intentionally not stored in Git. Their license and redistribution terms must be checked separately; downloading a weight file is not itself fine-tuning.

## 3. Configure the root environment file

Copy `.env.compose.example` to `.env`. Set `AUTH_SECRET` to a fresh random string at least 32 UTF-8 bytes long. Example command:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the generated value into `.env`. Keep it private. The model alias in `NISAKSHI_MODEL_ID` must match the alias passed to llama-server by Docker Compose.

## 4. Start the stack

From the repository root:

```powershell
docker compose up --build
```

The FastAPI endpoint is published at `http://localhost:8000`. The model server is not published to the host network; it is reachable by the API container at `http://model-server:8080/v1`.

Verify liveness:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Verify model readiness:

```powershell
Invoke-RestMethod http://localhost:8000/ready
```

A 503 response means the model file/ID/server is not ready or the model service is not responding. Check `docker compose logs backend model-server`.

## 5. Connect the Next.js frontend

Set the frontend's `BACKEND_URL=http://localhost:8000`, make sure both frontend and backend use the same `AUTH_SECRET`, and configure OAuth/database variables as described in `DEPLOYMENT.md`.

The frontend service-token implementation now expects the exact same secret on the backend, at least 32 UTF-8 bytes. Rotate the value consistently in both environments if it is exposed.

## 6. GPU and resource notes

The Compose sample defaults to CPU inference (`MODEL_GPU_LAYERS=0`) to avoid assuming a working CUDA runtime. Your computer has 4 GB VRAM, so start with a small quantized model and a modest context length. GPU offload requires a compatible GPU-enabled llama.cpp image and container runtime; simply changing the number of layers does not install GPU support.

The API/model stack may run out of RAM if the GGUF model, context, and concurrent requests exceed available memory. Lower `MODEL_CONTEXT_SIZE`, lower the parallel request count if you add it, or select a smaller model. A cloud deployment should size compute and RAM/GPU independently of this local development setup.

## 7. Limitations

- Chat works only when the configured model speaks the expected OpenAI-compatible streaming protocol and has a compatible chat template.
- Image generation is not bundled in this Compose file. It remains safely unavailable unless a separate self-hosted, compatible image service is configured.
- Cloud Storage, managed PostgreSQL, cloud secrets, private cloud networking, backups, and production quotas are covered by later phases.
