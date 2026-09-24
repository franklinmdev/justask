import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** This checkout, found from the loader's own file, whatever the cwd. */
const CHECKOUT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Loads the key's .env into process.env, never overriding what is already
 * set: the .env at the top of the checkout that holds `dir`, otherwise the
 * main checkout's, so every worktree shares the one file. Skips the lookup
 * when `key` is already in the environment; asks only whether it is set,
 * never its value. Loads nothing when neither .env exists. Throws on a .env
 * it cannot read or parse, naming the file and line, never its contents, and
 * in a bare-repository layout, which has no main checkout to share a .env.
 */
export function loadKeyEnv(
	dir: string = CHECKOUT,
	key: string = "TYPESAFE_API_KEY",
): void {
	if (Object.hasOwn(process.env, key)) return;
	const top = git(dir, "rev-parse", "--show-toplevel") ?? dir;
	const own = join(top, ".env");
	if (loaded(own)) return;
	// Asked only now: the worktree list is read only when the checkout has no .env.
	const main = mainCheckout(top);
	if (main === undefined) return;
	if (main.bare) {
		throw new Error(
			main.path === top
				? `justask: ${top} is a bare repository with no .env, so there is no main checkout to share one; put a .env in a worktree or set the key in the environment`
				: `justask: ${top} has no .env, and its repository ${main.path} is bare, so there is no main checkout to share one; put a .env in the worktree or set the key in the environment`,
		);
	}
	const shared = join(main.path, ".env");
	if (shared !== own) loaded(shared);
}

/** Loads one .env file; false when there is none to load. */
function loaded(file: string): boolean {
	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return false;
		throw new Error(`justask: cannot read ${file} (${code})`);
	}
	const line = malformedLine(text);
	if (line !== undefined) {
		throw new Error(
			`justask: ${file} line ${line} is not NAME=value; fix or remove it (its contents are not shown)`,
		);
	}
	process.loadEnvFile(file);
	return true;
}

const ASSIGNMENT = /^\s*(?:export\s+)?[A-Za-z_][\w.-]*\s*=\s*(.*)$/;

/**
 * The number of the first line Node's parser would skip or misread: not a
 * comment, not blank and not NAME=value, a quote that never closes, text
 * after a closing quote other than a comment, or a quoted value that runs
 * into a line that reads as NAME=value. Node takes such lines without a
 * word, so a broken key would load as nothing, cut short, or as part of the
 * line above it.
 */
function malformedLine(text: string): number | undefined {
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (line.trim() === "" || line.trim().startsWith("#")) continue;
		const value = ASSIGNMENT.exec(line)?.[1];
		if (value === undefined) return i + 1;
		const quote = value[0];
		if (quote !== '"' && quote !== "'" && quote !== "`") continue;
		const end = value.indexOf(quote, 1);
		if (end !== -1) {
			if (!commentOnly(value.slice(end + 1))) return i + 1;
			continue;
		}
		// A quoted value may run over lines, up to its closing quote.
		const close = lines.findIndex((next, j) => j > i && next.includes(quote));
		if (close === -1) return i + 1;
		const last = lines[close] as string;
		const inside = [
			...lines.slice(i + 1, close),
			last.slice(0, last.indexOf(quote)),
		];
		if (inside.some(isAssignment)) return i + 1;
		if (!commentOnly(last.slice(last.indexOf(quote) + 1))) return i + 1;
		i = close;
	}
	return undefined;
}

/** Nothing but blanks, or a comment. */
function commentOnly(text: string): boolean {
	return /^\s*(?:#.*)?$/.test(text);
}

/**
 * A line inside a quoted value that reads as NAME=value, so the quote likely
 * never closed where it should have. A base64 line's padding (`MIIB==`)
 * gives no value after the first `=`, so it does not count.
 */
function isAssignment(line: string): boolean {
	const value = ASSIGNMENT.exec(line)?.[1];
	return value !== undefined && value !== "" && !value.startsWith("=");
}

/** The main checkout, the first entry git lists, and whether it is bare. */
function mainCheckout(
	dir: string,
): { path: string; bare: boolean } | undefined {
	const list = git(dir, "worktree", "list", "--porcelain", "-z");
	if (list === undefined) return undefined;
	const first = list.split("\0\0")[0]?.split("\0") ?? [];
	const path = first[0]?.replace(/^worktree /, "");
	if (!path) return undefined;
	return { path, bare: first.includes("bare") };
}

/** A git command's output, or undefined outside a checkout or with no git. */
function git(dir: string, ...args: string[]): string | undefined {
	try {
		return execFileSync("git", args, {
			cwd: dir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return undefined;
	}
}
