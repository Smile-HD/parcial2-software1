#!/usr/bin/env bash
# ==============================================================================
# setup-ec2-ollama.sh — Instalación y configuración de Ollama en AWS EC2
# ==============================================================================
# Este script se ejecuta en la instancia EC2 (Ubuntu 22.04 / 24.04).
# Instala Ollama, lo configura como servicio systemd escuchando en 0.0.0.0:11434,
# y descarga el modelo recomendado (qwen2.5-coder:3b o 7b).
#
# Uso:
#   chmod +x setup-ec2-ollama.sh
#   sudo ./setup-ec2-ollama.sh [modelo]
#   Ejemplo: sudo ./setup-ec2-ollama.sh qwen2.5-coder:7b
# ==============================================================================

set -euo pipefail

MODEL="${1:-qwen2.5-coder:3b}"

echo "=== 1. Instalando Ollama en EC2 ==="
curl -fsSL https://ollama.com/install.sh | sh

echo "=== 2. Configurando servicio systemd para escuchar en 0.0.0.0:11434 ==="
mkdir -p /etc/systemd/system/ollama.service.d
cat << 'EOF' > /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
EOF

systemctl daemon-reload
systemctl restart ollama
systemctl enable ollama

echo "=== 3. Esperando que el servicio Ollama esté activo ==="
until curl -s http://127.0.0.1:11434/api/tags > /dev/null; do
  sleep 1
done

echo "=== 4. Descargando modelo: ${MODEL} ==="
ollama pull "${MODEL}"

echo "=== 5. Verificando endpoint compatible con OpenAI ==="
curl -s http://127.0.0.1:11434/v1/models

echo ""
echo "=== LISTO ==="
echo "Ollama está corriendo en el puerto 11434 con el modelo ${MODEL}."
echo "En tu archivo deploy/.env o apps/api/.env configura:"
echo "  OPENAI_BASE_URL=http://<IP_DE_ESTA_EC2>:11434/v1"
echo "  OPENAI_API_KEY=ollama"
echo "  LLM_MODEL=${MODEL}"
