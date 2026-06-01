# BatchWeaver

BatchWeaver is a Pharos Agent Centre skill for profiling transaction plans before an agent submits them onchain. It detects likely storage conflicts, groups compatible transactions into parallel execution batches, and optionally estimates gas through a Pharos RPC endpoint.

Pharos is designed around high-throughput EVM-compatible execution. BatchWeaver gives an agent a practical preflight step: "Can these transactions run together, or will they fight over the same state?"

## What the skill does

- Reads a JSON transaction plan.
- Infers access sets for common ERC-20 calls: `transfer`, `transferFrom`, `approve`, `balanceOf`, and `allowance`.
- Accepts explicit read/write access sets for custom contracts.
- Builds a conflict graph.
- Produces parallel batches that preserve conflicting transactions in separate lanes.
- Optionally calls a Pharos RPC endpoint for gas estimation.
- Emits human-readable output or JSON for other agents.

## Repository layout

```text
src/                 BatchWeaver TypeScript source
test/                Vitest test suite
examples/            Beginner-friendly transaction plans
README.md            Install and usage guide
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Pharos RPC URL for live gas estimation
- A wallet only if you later submit the transactions with another skill or wallet tool

BatchWeaver itself is read-only. It does not sign or broadcast transactions.

## Install from GitHub

```bash
git clone https://github.com/comzzy-comzzy/batchweaver.git
cd batchweaver
npm install
npm run build
```

Run the test suite:

```bash
npm test
```

Run the local CLI:

```bash
npm run dev -- profile examples/testnet-plan.json
```

After `npm run build`, you can also run:

```bash
node dist/src/cli.js profile examples/testnet-plan.json
```

## Install as a global CLI

From the project directory:

```bash
npm install -g .
batchweaver profile examples/testnet-plan.json
```

## Quick start

Run the bundled testnet example. This does not send transactions; it only reads the plan and prints the safest parallel batches.

```bash
npm run dev -- profile examples/testnet-plan.json
```

Expected output:

```text
BatchWeaver report: BatchWeaver Pharos testnet example
Chain: pharos-testnet
Transactions: 3
Conflicts: 1
Parallel batches: 2
Max parallel width: 2
Unknown access sets: 0
```

The two Alice transfers conflict because both write Alice's token balance. The Bob approval can be placed in the same batch as one of those transfers because it writes a different allowance slot.

## Testnet and mainnet support

BatchWeaver is built once with `npm run build`. The same CLI works for Pharos testnet and Pharos mainnet.

The network is selected by the JSON plan you pass in:

- `examples/testnet-plan.json` uses `"chain": "pharos-testnet"`.
- `examples/mainnet-plan.json` uses `"chain": "pharos-mainnet"`.

BatchWeaver is read-only. It does not deploy contracts, sign transactions, or broadcast transactions on either network. When you add `--estimate-gas`, it only asks the configured RPC to estimate gas.

## Use on Pharos testnet

1. Install dependencies:

```bash
npm install
```

2. Build the CLI:

```bash
npm run build
```

3. Open `examples/testnet-plan.json`.

4. Replace these placeholder values with real Pharos testnet values:

```json
{
  "from": "0xYourWallet",
  "to": "0xYourTokenOrContract",
  "data": "0xEncodedCalldata"
}
```

5. Run the profiler without RPC calls:

```bash
npm run dev -- profile examples/testnet-plan.json
```

6. Run the profiler with live gas estimation:

```bash
npm run dev -- profile examples/testnet-plan.json --rpc "$PHAROS_TESTNET_RPC" --estimate-gas
```

If your RPC URL is already inside the JSON plan, you can omit `--rpc`.

## Use on Pharos mainnet

1. Open `examples/mainnet-plan.json`.

2. Replace the placeholder RPC URL if you want live gas estimates:

```json
{
  "name": "BatchWeaver Pharos mainnet plan",
  "chain": "pharos-mainnet",
  "rpcUrl": "https://YOUR_MAINNET_RPC_URL"
}
```

3. Add your real mainnet transactions. For ERC-20 calls, include `from`, `to`, and encoded `data`.

4. Run read-only conflict profiling:

```bash
npm run dev -- profile examples/mainnet-plan.json
```

5. Run profiling with gas estimation:

```bash
npm run dev -- profile examples/mainnet-plan.json --estimate-gas
```

BatchWeaver does not broadcast transactions. Review the generated batches, then use your preferred Pharos wallet, deployer, or Agent Centre execution skill to submit each batch.

## JSON output for agents

Use `--json` when another agent or script needs structured output:

```bash
npm run dev -- profile examples/testnet-plan.json --json
```

The JSON report includes:

- `parallelBatches`
- `conflicts`
- `transactions[].inferredAccess`
- `transactions[].gasEstimate`
- `transactions[].warnings`
- `summary`

## Custom contract support

For non-ERC-20 contracts, add explicit access sets. This is the most reliable mode for advanced protocols.

```json
{
  "id": "vault-deposit",
  "access": [
    {
      "contract": "0xVault",
      "slot": "totalAssets",
      "mode": "write",
      "reason": "deposit increases vault assets"
    },
    {
      "contract": "0xVault",
      "slot": "shares:0xAlice",
      "mode": "write"
    }
  ]
}
```

Two transactions conflict when they touch the same `contract + slot` and at least one of them writes.

Run the custom example:

```bash
npm run dev -- profile examples/custom-contract-plan.json
```

## How to encode calldata

Use ethers, Foundry, Hardhat, Remix, or another ABI encoder. Example with ethers:

```bash
node -e "const { Interface } = require('ethers'); const i = new Interface(['function transfer(address,uint256)']); console.log(i.encodeFunctionData('transfer', ['0x0000000000000000000000000000000000000002', 100n]));"
```

Put the result in the transaction's `data` field.

## Supported framework

- Pharos Agent Centre Skill Engine
- OpenClaw-compatible CLI usage
- Claude Code / Codex usage through shell commands
- Any EVM-compatible Pharos RPC endpoint

## Skill submission summary

**Skill name:** BatchWeaver

**Short description:** BatchWeaver profiles Pharos transaction plans, detects storage conflicts, and groups transactions into parallel execution batches before agents submit them onchain.

**Instructions:** Install with `npm install`, run `npm run build`, then use `npm run dev -- profile examples/testnet-plan.json`.

**Dependencies:** Node.js, npm, ethers, commander, zod.

## Notes and limitations

- ERC-20 inference assumes the standard Solidity storage layout where balances use slot `0` and allowances use slot `1`. Many standard ERC-20 contracts follow this pattern, but custom layouts may differ.
- For production-grade custom contracts, provide explicit access sets.
- Gas estimation requires a live RPC and valid transaction fields.
- The current release is a read-only profiler. Broadcasting should be done by a separate execution skill after reviewing the output.
