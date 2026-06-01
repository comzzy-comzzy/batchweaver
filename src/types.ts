import { z } from "zod";

export const AccessModeSchema = z.enum(["read", "write"]);

export const AccessSchema = z.object({
  contract: z.string().min(1),
  slot: z.string().min(1),
  mode: AccessModeSchema,
  reason: z.string().optional()
});

export const TransactionSchema = z.object({
  id: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  data: z.string().optional(),
  value: z.string().optional(),
  description: z.string().optional(),
  access: z.array(AccessSchema).optional()
});

export const PlanSchema = z.object({
  name: z.string().optional(),
  chain: z.string().optional(),
  rpcUrl: z.string().optional(),
  transactions: z.array(TransactionSchema).min(1)
});

export type AccessMode = z.infer<typeof AccessModeSchema>;
export type Access = z.infer<typeof AccessSchema>;
export type PlannedTransaction = z.infer<typeof TransactionSchema>;
export type TransactionPlan = z.infer<typeof PlanSchema>;

export type ProfiledTransaction = PlannedTransaction & {
  inferredAccess: Access[];
  unknownAccess: boolean;
  gasEstimate?: string;
  warnings: string[];
};

export type Conflict = {
  left: string;
  right: string;
  resources: string[];
};

export type Batch = {
  index: number;
  transactionIds: string[];
};

export type ProfileReport = {
  name?: string;
  chain?: string;
  totalTransactions: number;
  parallelBatches: Batch[];
  conflicts: Conflict[];
  transactions: ProfiledTransaction[];
  summary: {
    conflictCount: number;
    batchCount: number;
    maxParallelWidth: number;
    unknownAccessCount: number;
  };
};
