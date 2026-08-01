import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

console.log(`process.env.AJPES_USERNAME exists: ${Boolean(process.env.AJPES_USERNAME)}`);
console.log(`process.env.AJPES_PASSWORD exists: ${Boolean(process.env.AJPES_PASSWORD)}`);
