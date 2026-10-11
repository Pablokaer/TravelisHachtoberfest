#!/usr/bin/env bash
# Run on a fresh DigitalOcean GPU Droplet (Ubuntu + NVIDIA drivers, e.g. the "AI/ML Ready" image)
# to serve the open-weight models the app uses (D-084). Then set, on the city builder:
#   PLANNER=ollama  OLLAMA_URL=http://<droplet private IP>:11434
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/dev/deploy/digitalocean/ollama-gpu-droplet.sh | bash
set -euo pipefail

MODELS="${MODELS:-qwen2.5:7b gemma3:4b nomic-embed-text}"
PRIVATE_IP="$(curl -fsS http://169.254.169.254/metadata/v1/interfaces/private/0/ipv4/address || true)"

command -v ollama >/dev/null 2>&1 || curl -fsSL https://ollama.com/install.sh | sh

# Listen on the VPC's private address only: Ollama has no authentication.
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=%s:11434"\n' "${PRIVATE_IP:-127.0.0.1}" |
  sudo tee /etc/systemd/system/ollama.service.d/host.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sleep 3

for model in $MODELS; do
  OLLAMA_HOST="${PRIVATE_IP:-127.0.0.1}:11434" ollama pull "$model"
done
echo "Ollama ready on http://${PRIVATE_IP:-127.0.0.1}:11434 with: $MODELS"
