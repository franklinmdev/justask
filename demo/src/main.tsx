// Latin subsets, weight axis only: Plex Sans 46 KB plus 31 KB latin-ext, and
// JetBrains Mono 40 KB, as woff2. The browser fetches a subset only when the
// page uses one of its characters.
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("The page has no #root");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
