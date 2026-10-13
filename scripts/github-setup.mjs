import { execFileSync } from "node:child_process";
const credential = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
});
const values = Object.fromEntries(
  credential
    .trim()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const headers = {
  Authorization: `Bearer ${values.password}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};
async function call(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers,
  });
  const body = await response.json();
  return { response, body };
}
const { response: userResponse, body: user } = await call("/user");
if (!userResponse.ok) throw new Error("GitHub authentication failed.");
if (user.login !== "danilostoletovic")
  throw new Error("Authenticated account does not match the requested owner.");
let { response, body } = await call(`/repos/${user.login}/shorties-alpha`);
if (response.status === 404)
  ({ response, body } = await call("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: "shorties-alpha",
      private: true,
      description:
        "Local-first AI video editor alpha. Real timeline edits and browser-side MP4 export.",
    }),
  }));
if (!response.ok)
  throw new Error(`Repository operation failed (${response.status}).`);
if (!body.private || body.owner.login !== user.login)
  throw new Error(
    "Repository must be private and owned by the authenticated user.",
  );
if (body.size > 0) {
  const remote = execFileSync("git", ["remote", "-v"], { encoding: "utf8" });
  if (!remote.includes(body.clone_url))
    throw new Error(
      "An existing nonempty repository needs review before pushing.",
    );
}
const remotes = execFileSync("git", ["remote"], { encoding: "utf8" })
  .trim()
  .split("\n");
execFileSync(
  "git",
  remotes.includes("origin")
    ? ["remote", "set-url", "origin", body.clone_url]
    : ["remote", "add", "origin", body.clone_url],
);
console.log(
  JSON.stringify({
    repository: body.html_url,
    private: body.private,
    owner: body.owner.login,
  }),
);
