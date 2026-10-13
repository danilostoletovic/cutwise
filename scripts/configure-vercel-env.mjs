import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const text = await readFile(".env.local", "utf8");
const values = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
if (!values.OPENAI_API_KEY)
  throw new Error("Add OPENAI_API_KEY to .env.local first.");
if (!values.DEMO_ACCESS_CODE) {
  values.DEMO_ACCESS_CODE = randomBytes(24).toString("base64url");
  await appendFile(
    ".env.local",
    `\nDEMO_ACCESS_CODE=${values.DEMO_ACCESS_CODE}\n`,
  );
}
for (const name of ["OPENAI_API_KEY", "OPENAI_MODEL", "DEMO_ACCESS_CODE"]) {
  const value = values[name] || (name === "OPENAI_MODEL" ? "gpt-4.1-mini" : "");
  const child = spawn(
    "cmd.exe",
    [
      "/d",
      "/c",
      "vercel.cmd",
      "env",
      "add",
      name,
      "production",
      "--type",
      name === "OPENAI_MODEL" ? "config" : "secret",
      "--yes",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stdin.end(value);
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exit = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exit !== 0)
    throw new Error(
      `Could not configure ${name}. Check Vercel environment settings.`,
    );
  console.log(
    `${name}: configured for production (${name === "OPENAI_MODEL" ? "config" : "secret"})`,
  );
}
