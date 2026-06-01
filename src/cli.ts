#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { PlanSchema } from "./types.js";
import { profilePlan } from "./profiler.js";

const program = new Command();

program
  .name("batchweaver")
  .description("Profile Pharos transaction plans for storage conflicts and parallel execution batches.")
  .version("0.1.0");

program
  .command("profile")
  .description("Analyze a JSON transaction plan.")
  .argument("<plan>", "Path to a BatchWeaver JSON plan")
  .option("--rpc <url>", "Override the plan RPC URL")
  .option("--estimate-gas", "Estimate gas for each transaction through the configured RPC")
  .option("--json", "Print the full machine-readable report")
  .action(async (planPath: string, options: { rpc?: string; estimateGas?: boolean; json?: boolean }) => {
    const raw = await readFile(planPath, "utf8");
    const plan = PlanSchema.parse(JSON.parse(raw));
    const report = await profilePlan(plan, {
      rpcUrl: options.rpc,
      estimateGas: options.estimateGas
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printHumanReport(report);
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function printHumanReport(report: Awaited<ReturnType<typeof profilePlan>>) {
  console.log(`BatchWeaver report${report.name ? `: ${report.name}` : ""}`);
  if (report.chain) console.log(`Chain: ${report.chain}`);
  console.log(`Transactions: ${report.totalTransactions}`);
  console.log(`Conflicts: ${report.summary.conflictCount}`);
  console.log(`Parallel batches: ${report.summary.batchCount}`);
  console.log(`Max parallel width: ${report.summary.maxParallelWidth}`);
  console.log(`Unknown access sets: ${report.summary.unknownAccessCount}`);

  console.log("\nExecution batches");
  for (const batch of report.parallelBatches) {
    console.log(`  ${batch.index}. ${batch.transactionIds.join(", ")}`);
  }

  if (report.conflicts.length > 0) {
    console.log("\nConflicts");
    for (const conflict of report.conflicts) {
      console.log(`  ${conflict.left} <-> ${conflict.right}`);
      for (const resource of conflict.resources) {
        console.log(`    ${resource}`);
      }
    }
  }

  const warnings = report.transactions.flatMap((tx) => tx.warnings.map((warning) => `${tx.id}: ${warning}`));
  if (warnings.length > 0) {
    console.log("\nWarnings");
    for (const warning of warnings) {
      console.log(`  ${warning}`);
    }
  }
}
