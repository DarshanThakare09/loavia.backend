import { spawn } from "child_process";
import path from "path";

const TEST_FILES = [
  "testAuth.ts",
  "testProductCatalog.ts",
  "testInventory.ts",
  "testCart.ts",
  "testOrder.ts",
  "testPayment.ts",
  "testEmail.ts",
  "testAdmin.ts",
  "testConcurrency.ts",
  "testHardening.ts",
];

function runTestFile(fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n======================================================`);
    console.log(`🏃 Running Test Suite: ${fileName}`);
    console.log(`======================================================\n`);

    const filePath = path.join(__dirname, fileName);
    const child = spawn("npx", ["ts-node", filePath], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_ENV: "test" }
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ Test Suite ${fileName} passed.`);
        resolve(true);
      } else {
        console.error(`\n❌ Test Suite ${fileName} failed with exit code ${code}.`);
        resolve(false);
      }
    });
  });
}

async function runAll() {
  console.log("🏁 Starting Unified E2E Test Suite Orchestrator...");
  const startTime = Date.now();
  const results: Record<string, boolean> = {};

  for (const file of TEST_FILES) {
    const success = await runTestFile(file);
    results[file] = success;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`📊 TEST SUITE SUMMARY REPORT`);
  console.log(`======================================================`);
  
  let allPass = true;
  for (const file of TEST_FILES) {
    const status = results[file] ? "PASSED ✅" : "FAILED ❌";
    if (!results[file]) allPass = false;
    console.log(`- ${file.padEnd(28)} : ${status}`);
  }

  console.log(`======================================================`);
  console.log(`⏱️ Total Time Elapsed: ${durationSec} seconds`);
  console.log(`======================================================\n`);

  if (allPass) {
    console.log("🎉 ALL E2E TEST SUITES COMPLETED AND PASSED SUCCESSFULLY! 🎉\n");
    process.exit(0);
  } else {
    console.error("🚨 ONE OR MORE TEST SUITES ENCOUNTERED FAILURES! 🚨\n");
    process.exit(1);
  }
}

runAll();
