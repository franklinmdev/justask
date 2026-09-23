import { useEffect, useState } from "react";
import type { Content } from "./content/types.ts";

export type Theme = "system" | "light" | "dark";

const KEY = "justask-demo-theme";
const themes: Theme[] = ["system", "light", "dark"];

/** The saved choice, or the system's when storage is empty or blocked. */
function savedTheme(): Theme {
	try {
		const saved = localStorage.getItem(KEY);
		return saved === "light" || saved === "dark" ? saved : "system";
	} catch {
		return "system";
	}
}

/**
 * Auto, Light, Dark. Auto follows the operating system; the other two stamp
 * data-theme on the root, which the tokens in styles.css read. index.html
 * applies the saved choice before the first paint, so there is no flash.
 */
export function ThemeToggle({ copy }: { copy: Content["copy"] }) {
	const [theme, setTheme] = useState(savedTheme);

	useEffect(() => {
		const root = document.documentElement;
		if (theme === "system") root.removeAttribute("data-theme");
		else root.dataset.theme = theme;
		try {
			if (theme === "system") localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, theme);
		} catch {
			// Storage blocked: the choice lasts this visit.
		}
	}, [theme]);

	return (
		<fieldset className="themes" aria-label={copy.themeLabel}>
			{themes.map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={option === theme}
					onClick={() => setTheme(option)}
				>
					{copy.themes[option]}
				</button>
			))}
		</fieldset>
	);
}
