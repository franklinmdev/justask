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

	it("finds the checkout's .env from any folder inside it", () => {
		writeFileSync(join(main, ".env"), `${NAME}=main\n`);
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		const inside = join(worktree, "demo", "eval");
		mkdirSync(inside, { recursive: true });
		loadKeyEnv(inside);
		expect(process.env[NAME]).toBe("worktree");
	});

	it("reports a malformed line by its number, never showing the file's contents", () => {
		writeFileSync(
			join(worktree, ".env"),
			`# a comment\n${NAME}=stand-in-value\nstand-in-garbage\n`,
		);
		const error = errorOf(() => loadKeyEnv(worktree));
		expect(error?.message).toContain(`${join(worktree, ".env")} line 3`);
		expect(error?.message).not.toContain("stand-in");
		expect(process.env[NAME]).toBeUndefined();
	});

	it("reports a quote that never closes", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}="stand-in-value\n`);
		const error = errorOf(() => loadKeyEnv(worktree));
		expect(error?.message).toContain(`${join(worktree, ".env")} line 1`);
		expect(error?.message).not.toContain("stand-in");
	});

	it("reads a quoted value over several lines", () => {
		writeFileSync(
			join(worktree, ".env"),
			`${NAME}="stand-in\nvalue"\nOTHER_${NAME}=x\n`,
		);
		loadKeyEnv(worktree);
		expect(process.env[NAME]).toBe("stand-in\nvalue");
		delete process.env[`OTHER_${NAME}`];
	});

	it("reports a .env it cannot read instead of skipping it", () => {
		mkdirSync(join(worktree, ".env"));
		expect(() => loadKeyEnv(worktree)).toThrow(
			`justask: cannot read ${join(worktree, ".env")}`,
		);
	});

	it("says so in a bare-repository layout, where there is no main checkout", () => {
		const bare = join(root, "bare.git");
		const linked = join(root, "linked");
		execFileSync("git", ["clone", "-q", "--bare", main, bare]);
		git(bare, "worktree", "add", "-q", linked);
		// Beside the bare repository, where the old lookup looked.
		writeFileSync(join(root, ".env"), `${NAME}=stray\n`);

		expect(() => loadKeyEnv(linked)).toThrow(
			`justask: ${linked} has no .env, and its repository ${bare} is bare, so there is no main checkout to share one; put a .env in the worktree or set the key in the environment`,
		);
		expect(process.env[NAME]).toBeUndefined();

		writeFileSync(join(linked, ".env"), `${NAME}=linked\n`);
		loadKeyEnv(linked);
		expect(process.env[NAME]).toBe("linked");
	});

	it("leaves a variable already in the environment alone", () => {
		writeFileSync(join(worktree, ".env"), `${NAME}=worktree\n`);
		process.env[NAME] = "shell";
		loadKeyEnv(worktree);
		expect(process.env[NAME]).toBe("shell");
	});
});
