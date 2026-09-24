import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

/**
 * Loads the key's .env into process.env, never overriding what is already
 * set: the checkout's own .env in `dir`, otherwise the main checkout's, so
 * every worktree shares the one file. Loads nothing when neither exists,
 * which is fine when TYPESAFE_API_KEY is already in the environment.
 */
export function loadKeyEnv(dir: string): void {
	if (loaded(join(dir, ".env"))) return;
	// Asked only now: git runs only when the checkout has no .env of its own.
	const main = mainCheckoutEnv(dir);
	if (main !== undefined) loaded(main);
}

/** Loads one .env file; false when there is none to load. */
function loaded(file: string): boolean {
	try {
		process.loadEnvFile(file);
		return true;
	} catch {
		return false;
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
