import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import { profilePlan } from "../src/profiler.js";
import type { TransactionPlan } from "../src/types.js";

const erc20 = new Interface([
  "function transfer(address to,uint256 amount)",
  "function approve(address spender,uint256 amount)"
]);

const token = "0x0000000000000000000000000000000000001000";
const alice = "0x0000000000000000000000000000000000000001";
const bob = "0x0000000000000000000000000000000000000002";
const carol = "0x0000000000000000000000000000000000000003";

describe("profilePlan", () => {
  it("separates conflicting ERC-20 transfers into different batches", async () => {
    const plan: TransactionPlan = {
      transactions: [
        {
          id: "alice-to-bob",
          from: alice,
          to: token,
          data: erc20.encodeFunctionData("transfer", [bob, 100n])
        },
        {
          id: "alice-to-carol",
          from: alice,
          to: token,
          data: erc20.encodeFunctionData("transfer", [carol, 25n])
        }
      ]
    };

    const report = await profilePlan(plan);

    expect(report.summary.conflictCount).toBe(1);
    expect(report.summary.batchCount).toBe(2);
  });

  it("puts independent allowance writes in the same batch", async () => {
    const plan: TransactionPlan = {
      transactions: [
        {
          id: "alice-approves-bob",
          from: alice,
          to: token,
          data: erc20.encodeFunctionData("approve", [bob, 100n])
        },
        {
          id: "bob-approves-carol",
          from: bob,
          to: token,
          data: erc20.encodeFunctionData("approve", [carol, 100n])
        }
      ]
    };

    const report = await profilePlan(plan);

    expect(report.summary.conflictCount).toBe(0);
    expect(report.summary.batchCount).toBe(1);
    expect(report.parallelBatches[0].transactionIds).toEqual(["alice-approves-bob", "bob-approves-carol"]);
  });

  it("honors explicit access sets for custom contracts", async () => {
    const plan: TransactionPlan = {
      transactions: [
        {
          id: "vault-deposit",
          access: [{ contract: "vault", slot: "totalAssets", mode: "write" }]
        },
        {
          id: "vault-report",
          access: [{ contract: "vault", slot: "totalAssets", mode: "read" }]
        }
      ]
    };

    const report = await profilePlan(plan);

    expect(report.summary.conflictCount).toBe(1);
  });
});
