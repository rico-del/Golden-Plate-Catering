import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lambdaDirectory = path.join(root, "lambda");
const outputPath = path.resolve(process.argv[2] || path.join(root, "dist", "serverless-lambda.zip"));
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "golden-plate-lambda-"));
const stagingDirectory = path.join(temporaryDirectory, "package");

try {
  try {
    await fs.access(outputPath);
    throw new Error(`Refusing to overwrite existing Lambda artifact: ${outputPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(stagingDirectory, { recursive: true });
  for (const file of ["package.json", "package-lock.json"]) {
    await fs.copyFile(path.join(lambdaDirectory, file), path.join(stagingDirectory, file));
  }
  await fs.cp(path.join(lambdaDirectory, "src"), path.join(stagingDirectory, "src"), { recursive: true });

  const install = spawnSync("npm", ["ci", "--omit=dev", "--prefix", lambdaDirectory], { stdio: "inherit" });
  if (install.status !== 0) throw new Error("Could not install the locked Lambda dependencies.");
  await fs.cp(path.join(lambdaDirectory, "node_modules"), path.join(stagingDirectory, "node_modules"), { recursive: true });

  const archive = spawnSync("zip", ["-q", "-r", outputPath, "."], { cwd: stagingDirectory, stdio: "inherit" });
  if (archive.status !== 0) throw new Error("Could not create the Lambda deployment archive.");
  console.log(`Created ${outputPath}`);
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}