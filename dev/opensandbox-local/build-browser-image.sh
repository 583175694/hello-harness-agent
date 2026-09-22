#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="${HARNESS_SANDBOX_BROWSER_IMAGE:-harness-sandbox-browser:local}"

docker build -f "$ROOT/Dockerfile.harness-sandbox-browser" -t "$IMAGE_NAME" "$ROOT"

echo ""
echo "Built: $IMAGE_NAME"
echo ""
echo "Image ID (use with SANDBOX_IMAGE=<name>@sha256:... after push, or tag for local OpenSandbox):"
docker image inspect "$IMAGE_NAME" --format '  {{.Id}}'
echo ""
echo "Local OpenSandbox typically references: $IMAGE_NAME"
echo "Pin digest after push to a registry, e.g.:"
echo "  docker tag $IMAGE_NAME your-registry/harness-sandbox-browser:latest"
echo "  docker push your-registry/harness-sandbox-browser:latest"
echo "  docker inspect --format='{{index .RepoDigests 0}}' your-registry/harness-sandbox-browser:latest"
echo ""
echo "POC (requires running OpenSandbox + SANDBOX_IMAGE=$IMAGE_NAME):"
echo "  agent-browser --version"
echo "  agent-browser open https://example.com"
echo "  agent-browser screenshot /workspace/poc.png"
