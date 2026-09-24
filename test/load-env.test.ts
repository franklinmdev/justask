import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadKeyEnv } from "../scripts/load-env.ts";

// A name no real .env holds, so the tests never read or clobber the key.
const NAME = "JUSTASK_LOAD_ENV_TEST";

const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, stdio: "ignore" });

function errorOf(run: () => void): Error | undefined {
	try {
		run();
	} catch (error) {
		return error as Error;
	}
	return undefined;
}

describe("loadKeyEnv", () => {
	let root: string;
	let main: string;
	let worktree: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "justask-load-env-"));
		main = join(root, "main");
		worktree = join(root, "worktree");
		execFileSync("git", ["init", "-q", main]);
		git(
			main,
			"-c",
			"user.name=test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"init",
		);
		git(main, "worktree", "add", "-q", worktree);
		delete process.env[NAME];
	});

	/** A bare repository cloned from the main one, with a worktree and no .env. */
	function bareLayout() {
		const bare = join(root, "bare.git");
		const linked = join(root, "linked");
		execFileSync("git", ["clone", "-q", "--bare", main, bare]);
		git(bare, "worktree", "add", "-q", linked);
		return { bare, linked };
	}

	afterEach(() => {
		delete process.env[NAME];
		rmSync(root, { recursive: true, force: true });
	});

	it("loads the checkout's own .env first", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe("worktree");
	});

	it("loads the main checkout's .env from a worktree that has none", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe("main");
	});

	it("loads nothing when neither checkout has a .env", () => {
		expect(() => loadKeyEnv(worktree, NAME)).not.toThrow();
		expect(() => loadKeyEnv(main, NAME)).not.toThrow();
		expect(process.env[NAME]).toBeUndefined();
	});

	it("loads nothing outside a git checkout", () => {
		const loose = join(root, "loose");
		mkdirSync(loose);
		expect(() => loadKeyEnv(loose, NAME)).not.toThrow();
		expect(process.env[NAME]).toBeUndefined();
	});

	it("finds the checkout's .env from any folder inside it", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		const inside = join(worktree, "demo", "eval");
		mkdirSync(inside, { recursive: true });
		loadKeyEnv(inside, NAME);
		expect(process.env[NAME]).toBe("worktree");
	});

	it("reports a malformed line by its number, never showing the file's contents", () => {
		writeFileSync(
			join(worktree, ".env"),
			`# a comment\n${NAME}=stand-in-value\nstand-in-garbage\n`,
		);
		const error = errorOf(() => loadKeyEnv(worktree, NAME));
		expect(error?.message).toContain(`${join(worktree, ".env")} line 3`);
		expect(error?.message).not.toContain("stand-in");
		expect(process.env[NAME]).toBeUndefined();
	});

	it("reports a quote that never closes", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}="stand-in-value\n`);
		const error = errorOf(() => loadKeyEnv(worktree, NAME));
		expect(error?.message).toContain(`${join(worktree, ".env")} line 1`);
		expect(error?.message).not.toContain("stand-in");
	});

	it("reports a quote that runs into the next NAME=value line", () => {
		writeFileSync(
			join(worktree, ".env"),
			`${NAME}="stand-in-value\nOTHER_${NAME}=stand-in"\n`,
		);
		const error = errorOf(() => loadKeyEnv(worktree, NAME));
		expect(error?.message).toContain(`${join(worktree, ".env")} line 1`);
		expect(error?.message).not.toContain("stand-in");
		expect(process.env[NAME]).toBeUndefined();
	});

	it("reads a quoted value over several lines", () => {
		writeFileSync(
			join(worktree, ".env"),
			`${NAME}="stand-in\nvalue"\nOTHER_${NAME}=x\n`,
		);
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe("stand-in\nvalue");
		delete process.env[`OTHER_${NAME}`];
	});

	it("reads a quoted value whose lines end in base64 padding", () => {
		writeFileSync(
			join(worktree, ".env"),
			`${NAME}="-----BEGIN-----\nMIIBabcdEF==\n-----END-----"\n`,
		);
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe(
			"-----BEGIN-----\nMIIBabcdEF==\n-----END-----",
		);
	});

	it("reports text after a closing quote, which Node would drop", () => {
		for (const [text, line] of [
			[`${NAME}="stand-in" stand-in-tail\n`, 1],
			[`# a comment\n${NAME}="stand-in\nvalue"stand-in-tail\n`, 2],
		] as const) {
			writeFileSync(join(worktree, ".env"), text);
			const error = errorOf(() => loadKeyEnv(worktree, NAME));
			expect(error?.message).toContain(
				`${join(worktree, ".env")} line ${line}`,
			);
			expect(error?.message).not.toContain("stand-in");
		}
		expect(process.env[NAME]).toBeUndefined();
	});

	it("reads a comment after a closing quote", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}="stand-in" # a note\n`);
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe("stand-in");
	});

	it("reports a .env it cannot read instead of skipping it", () => {
		mkdirSync(join(worktree, ".env"));
		expect(() => loadKeyEnv(worktree, NAME)).toThrow(
			`justask: cannot read ${join(worktree, ".env")}`,
		);
	});

	it("says so in a bare-repository layout, where there is no main checkout, while the key is missing", () => {
		const { bare, linked } = bareLayout();
		// Beside the bare repository, where the old lookup looked.
		writeFileSync(join(root, ".env"), `${NAME}=stray\n`);

		expect(() => loadKeyEnv(linked, NAME)).toThrow(
			`justask: ${linked} has no .env, and its repository ${bare} is bare, so there is no main checkout to share one; put a .env in the worktree or set the key in the environment`,
		);
		expect(process.env[NAME]).toBeUndefined();

		writeFileSync(join(linked, ".env"), `${NAME}=linked\n`);
		loadKeyEnv(linked, NAME);
		expect(process.env[NAME]).toBe("linked");
	});

	it("skips the lookup when the key is already in the environment, even in a bare-repository layout", () => {
		const { linked } = bareLayout();
		process.env[NAME] = "shell";

		expect(() => loadKeyEnv(linked, NAME)).not.toThrow();
		expect(process.env[NAME]).toBe("shell");
	});

	it("leaves a variable already in the environment alone", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		process.env[NAME] = "shell";
		loadKeyEnv(worktree, NAME);
		expect(process.env[NAME]).toBe("shell");
	});
});
