#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if ! curl -sf -X POST http://127.0.0.1:8545 -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
  echo "Start Anvil first: anvil"
  exit 1
fi

cd "$ROOT/contracts"
ADDR=$(forge script script/Deploy.s.sol:DeployPaylock --broadcast --rpc-url http://127.0.0.1:8545 --private-key "$ANVIL_KEY" \
  | awk '/Paylock/{print $NF}')
echo "Deployed $ADDR"
python3 - << PY
import json
from pathlib import Path
p = Path("$ROOT/src/assets/deployed.json")
data = json.loads(p.read_text())
data["31337"] = "$ADDR"
p.write_text(json.dumps(data, indent=2) + "\n")
print("wrote", p)
PY
