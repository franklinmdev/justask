// The README's GIF, by hand, never in CI: one sentence fills the expense card.
//
//   node --conditions=justask-source scripts/readme-gif.ts
//
// Builds the demo with the Form case's English recording swapped for the
// README GIF's (demo/recordings/gif-en.json, made by record.ts), so the
// demo's own replay types the sentence, presses Enter and fills the card from
// the recorded answer, as it does on the Form case's first visit. Headless
// Chromium plays it on a stopped clock: Playwright's fake clock runs the
// page's timers one GIF frame at a time, every CSS animation is held at the
// same time, and each frame is a screenshot at twice the CSS size, so no
// frame depends on how busy the machine is. ffmpeg crops the frames onto the
// card and writes docs/readme-card.gif with a palette of its own. No provider
// is called: the replay answers from the recording, and any request to /api
// is refused and fails the script. Needs ffmpeg on the PATH and Playwright's
// Chromium (`pnpm exec playwright install chromium`).

import { execFileSync } from "node:child_process";
import { link, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { chromium, type Page } from "playwright";
import { build, defaultClientConditions, type Plugin, preview } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const recording = here("../demo/recordings/gif-en.json");
const output = here("../docs/readme-card.gif");

/**
 * The page's size in CSS pixels: under 1100px the demo shows the app alone at
 * full width, so the box holds the whole sentence; the height takes the card
 * down to Save.
 */
const VIEWPORT = { width: 860, height: 900 };
/** Each frame at twice the CSS size, sharp on a high density screen and on a phone. */
const SCALE = 2;
/** The ground kept around the card above and beside it, in CSS pixels, as far as the page has it. */
const MARGIN = 12;
/** Frames a second in the GIF. */
const FPS = 25;
/** The empty card before the replay starts, and the filled card once it has settled, in ms. */
const HOLD_START_MS = 600;
const HOLD_END_MS = 2600;
/** After the announcement, the fill line's fade (1400ms in DESIGN.md) and a little more, in ms. */
const SETTLE_MS = 1600;
/** How long each frame waits for the page's own tasks, in real ms and in task hops. */
const SETTLE_PAUSE_MS = 20;
const SETTLE_HOPS = 10;
/** The longest the replay may take, in ms of the page's clock, before the script gives up. */
const LIMIT_MS = 15000;

/** Serves the Form case's English recording as the README GIF's. */
function gifRecording(): Plugin {
	return {
		name: "readme-gif-recording",
		enforce: "pre",
		resolveId(source) {
			return source.endsWith("/recordings/form-en.json") ? recording : null;
		},
	};
}

/**
 * Holds every CSS animation and transition on the page at the page's clock:
 * each one is paused and set to the time since it was first seen, so a frame
 * shows where it is at that moment, whatever time the screenshot takes.
 */
async function holdAnimations(page: Page, now: number) {
	await page.evaluate((now) => {
		const page = window as { gifSeen?: WeakMap<Animation, number> };
		const seen = page.gifSeen ?? new WeakMap<Animation, number>();
		page.gifSeen = seen;
		for (const animation of document.getAnimations()) {
			const first = seen.get(animation) ?? now;
			seen.set(animation, first);
			animation.pause();
			animation.currentTime = now - first;
		}
	}, now);
}

/**
 * Lets the work a clock step started finish before the frame is taken: the
 * recorded answer's promises and React's commits run on tasks the fake clock
 * does not hold, so without this the fill landed a frame apart on some runs.
 * A short real pause, then MessageChannel hops, which the clock leaves
 * real, run whatever is queued behind them.
 */
async function settle(page: Page) {
	await page.waitForTimeout(SETTLE_PAUSE_MS);
	await page.evaluate(async (hops) => {
		for (let hop = 0; hop < hops; hop++) {
			await new Promise<void>((resolve) => {
				const channel = new MessageChannel();
				channel.port1.onmessage = () => resolve();
				channel.port2.postMessage(null);
			});
		}
	}, SETTLE_HOPS);
}

const work = await mkdtemp(join(tmpdir(), "justask-readme-gif-"));
const config = {
	configFile: false as const,
	root: here("../demo/"),
	logLevel: "warn" as const,
	plugins: [gifRecording(), react()],
	resolve: { conditions: ["justask-source", ...defaultClientConditions] },
	build: { outDir: join(work, "dist"), emptyOutDir: true },
};

try {
	await build(config);
	const server = await preview({ ...config, preview: { port: 0 } });
	const url = server.resolvedUrls?.local[0];
	if (!url) throw new Error("The preview server has no local URL");
	const browser = await chromium.launch();
	const called: string[] = [];
	let frames = 0;
	let crop: { x: number; y: number; width: number; height: number };
	try {
		const page = await browser.newPage({
			viewport: VIEWPORT,
			deviceScaleFactor: SCALE,
			colorScheme: "light",
			reducedMotion: "no-preference",
		});
		await page.route("**/api/**", (route) => {
			called.push(route.request().url());
			return route.abort();
		});
		const start = Date.now();
		await page.clock.install({ time: start });
		await page.clock.pauseAt(start + 1);
		await page.goto(`${url}?case=form`);
		await page.evaluate(() => document.fonts.ready);
		await page
			.getByRole("searchbox", { name: "Describe the expense" })
			.waitFor();

		const step = 1000 / FPS;
		const shoot = async (now: number) => {
			await holdAnimations(page, now);
			const file = join(work, `frame-${String(frames).padStart(4, "0")}.png`);
			await page.screenshot({ path: file, animations: "allow", caret: "hide" });
			frames += 1;
		};
		// The empty card, held: the first frame again for HOLD_START_MS.
		await shoot(0);
		const first = join(work, "frame-0000.png");
		for (let held = step; held < HOLD_START_MS; held += step) {
			await link(
				first,
				join(work, `frame-${String(frames).padStart(4, "0")}.png`),
			);
			frames += 1;
		}
		const done = page.getByText("Nothing left to fill.");
		let now = 0;
		let settled: number | null = null;
		while (settled === null || now < settled + SETTLE_MS + HOLD_END_MS) {
			if (now > LIMIT_MS) throw new Error("The card never filled");
			await page.clock.runFor(step);
			await settle(page);
			now += step;
			await shoot(now);
			if (settled === null && (await done.count()) > 0) settled = now;
		}

		const window = await page.locator(".app").boundingBox();
		const save = await page
			.getByRole("button", { name: "Save expense" })
			.boundingBox();
		const suggestions = await page
			.getByRole("region", { name: "Try a request" })
			.boundingBox();
		if (!window || !save || !suggestions) {
			throw new Error("The card is not on the page");
		}
		// The crop ends halfway from Save to the suggestions, inside the window.
		const bottom = (save.y + save.height + suggestions.y) / 2;
		const side = Math.min(MARGIN, window.x);
		const top = window.y - Math.min(MARGIN, window.y);
		crop = {
			x: window.x - side,
			y: top,
			width: window.width + 2 * side,
			height: bottom - top,
		};
	} finally {
		await browser.close();
		await server.close();
	}
	if (called.length > 0) {
		throw new Error(
			`The page called ${called.join(", ")}; the GIF makes no call`,
		);
	}

	// In device pixels, even, as the crop filter rounds them anyway.
	const [x, y, width, height] = [crop.x, crop.y, crop.width, crop.height].map(
		(value) => 2 * Math.round((value * SCALE) / 2),
	);
	execFileSync(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-framerate",
			String(FPS),
			"-i",
			join(work, "frame-%04d.png"),
			"-filter_complex",
			[
				`crop=${width}:${height}:${x}:${y},split[a][b]`,
				"[a]palettegen=max_colors=256:stats_mode=full[p]",
				"[b][p]paletteuse=dither=none",
			].join(";"),
			"-loop",
			"0",
			output,
		],
		{ stdio: "inherit" },
	);
	const { size } = await stat(output);
	console.log(
		`${output}: ${width}×${height}, ${(frames / FPS).toFixed(1)} s, ${(size / 1024 / 1024).toFixed(2)} MB`,
	);
} finally {
	await rm(work, { recursive: true, force: true });
}
