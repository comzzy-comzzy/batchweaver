import { JsonRpcProvider } from "ethers";
import { inferCommonErc20Access } from "./erc20.js";
import type { Access, Conflict, PlannedTransaction, ProfileReport, ProfiledTransaction, TransactionPlan } from "./types.js";

export type ProfileOptions = {
  rpcUrl?: string;
  estimateGas?: boolean;
};

export async function profilePlan(plan: TransactionPlan, options: ProfileOptions = {}): Promise<ProfileReport> {
  const provider = options.estimateGas && (options.rpcUrl || plan.rpcUrl)
    ? new JsonRpcProvider(options.rpcUrl || plan.rpcUrl)
    : undefined;

  const transactions: ProfiledTransaction[] = [];
  for (const tx of plan.transactions) {
    const inferred = normalizeAccess([...(tx.access ?? []), ...inferCommonErc20Access(tx)]);
    const warnings: string[] = [];
    let gasEstimate: string | undefined;

    if (inferred.length === 0) {
      warnings.push("No access set inferred. Add explicit access entries for precise conflict profiling.");
    }

    if (provider && tx.to) {
      try {
        gasEstimate = (await provider.estimateGas({
          from: tx.from,
          to: tx.to,
          data: tx.data,
          value: tx.value
        })).toString();
      } catch (error) {
        warnings.push(`Gas estimation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    transactions.push({
      ...tx,
      inferredAccess: inferred,
      unknownAccess: inferred.length === 0,
      gasEstimate,
      warnings
    });
  }

  const conflicts = detectConflicts(transactions);
  const parallelBatches = planBatches(transactions, conflicts);
  const maxParallelWidth = parallelBatches.reduce((max, batch) => Math.max(max, batch.transactionIds.length), 0);

  return {
    name: plan.name,
    chain: plan.chain,
    totalTransactions: transactions.length,
    parallelBatches,
    conflicts,
    transactions,
    summary: {
      conflictCount: conflicts.length,
      batchCount: parallelBatches.length,
      maxParallelWidth,
      unknownAccessCount: transactions.filter((tx) => tx.unknownAccess).length
    }
  };
}

export function detectConflicts(transactions: ProfiledTransaction[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < transactions.length; i += 1) {
    for (let j = i + 1; j < transactions.length; j += 1) {
      const resources = conflictingResources(transactions[i], transactions[j]);
      if (resources.length > 0) {
        conflicts.push({
          left: transactions[i].id,
          right: transactions[j].id,
          resources
        });
      }
    }
  }

  return conflicts;
}

export function planBatches(transactions: ProfiledTransaction[], conflicts: Conflict[]) {
  const conflictMap = new Map<string, Set<string>>();
  for (const tx of transactions) {
    conflictMap.set(tx.id, new Set());
  }
  for (const conflict of conflicts) {
    conflictMap.get(conflict.left)?.add(conflict.right);
    conflictMap.get(conflict.right)?.add(conflict.left);
  }

  const batches: Array<{ index: number; transactionIds: string[] }> = [];
  for (const tx of transactions) {
    const target = batches.find((batch) =>
      batch.transactionIds.every((id) => !conflictMap.get(tx.id)?.has(id))
    );

    if (target) {
      target.transactionIds.push(tx.id);
    } else {
      batches.push({ index: batches.length + 1, transactionIds: [tx.id] });
    }
  }

  return batches;
}

function conflictingResources(left: ProfiledTransaction, right: ProfiledTransaction): string[] {
  const resources: string[] = [];

  for (const a of left.inferredAccess) {
    for (const b of right.inferredAccess) {
      if (resourceKey(a) === resourceKey(b) && (a.mode === "write" || b.mode === "write")) {
        resources.push(resourceKey(a));
      }
    }
  }

  return [...new Set(resources)];
}

function normalizeAccess(access: Access[]): Access[] {
  const seen = new Set<string>();
  const normalized: Access[] = [];

  for (const item of access) {
    const entry = {
      ...item,
      contract: item.contract.toLowerCase(),
      slot: item.slot.toLowerCase()
    };
    const key = `${entry.contract}:${entry.slot}:${entry.mode}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(entry);
    }
  }

  return normalized;
}

function resourceKey(access: Access): string {
  return `${access.contract.toLowerCase()}:${access.slot.toLowerCase()}`;
}
