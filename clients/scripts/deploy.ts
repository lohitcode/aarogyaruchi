#!/usr/bin/env bun

import { $ } from "bun";
import { checkbox } from "@inquirer/prompts";

const apps = ["user", "admin"] as const;
type App = (typeof apps)[number];

async function main() {
  console.log("\n🚀 Aarogya Ruchi Deploy\n");

  // Enable raw mode for interactive checkbox in Bun
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }

  const selected = await checkbox({
    message: "Select apps to deploy (Space to select, Enter to confirm)",
    choices: [
      { name: "user - customer-facing app", value: "user" },
      { name: "admin - admin dashboard", value: "admin" },
    ],
  });

  if (selected.length === 0) {
    console.log("\n❌ No apps selected\n");
    process.exit(0);
  }

  const targets = selected as App[];

  console.log(`\n📋 Apps: ${targets.join(", ")}`);
  console.log(`🔄 Deploying ${targets.length} app(s)...\n`);

  for (const app of targets) {
    console.log(`\n📦 Deploying ${app}...`);
    await $`turbo deploy --filter=${app}`;
    console.log(`✅ ${app} deployed\n`);
  }

  console.log("🎉 Deploy complete!\n");
}

main().catch((error) => {
  // Handle user cancellation gracefully (Ctrl+C)
  if (
    error.name === "ExitPromptError" ||
    error.message?.includes("User force closed")
  ) {
    console.log("\n\n👋 Deploy cancelled.\n");
    process.exit(0);
  }

  console.error("❌ Deploy failed:", error);
  process.exit(1);
});
