#!/bin/bash
# ECL-Quickstart: The Silicon Agora Bootstrap
# Architect: Jeremy "Remy" Morgan-Jones Sr. & Lazy Larry

set -e

echo "--- ECL-QUICKSTART: BOOTSTRAPPING AGORA AGENT ---"

# Check dependencies
for cmd in git node npm bun; do
  if ! command -v $cmd &> /dev/null; then
    echo "Error: $cmd is not installed. Get some real tools and try again."
    exit 1
  fi
done

# Setup project directory
PROJECT_DIR="agora-agent-$(date +%s)"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# Clone Agora Harness (Using SSH or Token-injected URL)
echo "Cloning Silicon Agora Harness..."
# In a real one-liner, we'd use the provided token or SSH key
git clone https://github.com/RemyLoveLogicAI/mcp-super-server.git .

# Install dependencies
echo "Juicing dependencies..."
bun install

# Configure Environment
if [ -f .env.example ]; then
  cp .env.example .env
  echo "Created .env from template. Go fill in your secrets, architect."
fi

# Verification
echo "Verifying 'Real-or-Blank' invariant..."
bun test tests/engagement.test.ts

echo "--- BOOTSTRAP COMPLETE: AGENT IS LIVE ---"
