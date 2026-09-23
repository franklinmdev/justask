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

	afterEach(() => {
		delete process.env[NAME];
		rmSync(root, { recursive: true, force: true });
	});

	it("loads the checkout's own .env first", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		loadKeyEnv(worktree);
		expect(process.env[NAME]).toBe("worktree");
	});

	it("loads the main checkout's .env from a worktree that has none", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		loadKeyEnv(worktree);
		expect(process.env[NAME]).toBe("main");
	});

	it("loads nothing when neither checkout has a .env", () => {
		expect(() => loadKeyEnv(worktree)).not.toThrow();
		expect(() => loadKeyEnv(main)).not.toThrow();
		expect(process.env[NAME]).toBeUndefined();
	});

	it("loads nothing outside a git checkout", () => {
		const loose = join(root, "loose");
		mkdirSync(loose);
		expect(() => loadKeyEnv(loose)).not.toThrow();
		expect(process.env[NAME]).toBeUndefined();
	});

	it("leaves a variable already in the environment alone", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		process.env[NAME] = "shell";
		loadKeyEnv(worktree);
		expect(process.env[NAME]).toBe("shell");
	});
});
