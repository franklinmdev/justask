import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

/**
 * Loads the key's .env into process.env, never overriding what is already
 * set: the checkout's own .env in `dir`, otherwise the main checkout's, so
 * every worktree shares the one file. Loads nothing when neither exists,
 * which is fine when TYPESAFE_API_KEY is already in the environment.
 */
export function loadKeyEnv(dir: string): void {
	for (const file of [join(dir, ".env"), mainCheckoutEnv(dir)]) {
		if (file === undefined) continue;
		try {
			process.loadEnvFile(file);
			return;
		} catch {
			// No .env there; try the next place.
		}
	}
}

/** The main checkout's .env: beside the git directory every worktree shares. */
function mainCheckoutEnv(dir: string): string | undefined {
	try {
		const common = execFileSync(
			"git",
			["rev-parse", "--path-format=absolute", "--git-common-dir"],
			{ cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
		return join(dirname(common.trim()), ".env");
	} catch {
		// Not a git checkout, or no git.
		return undefined;
	}
}
