// Weight axis only: Mona Sans 40 KB latin plus 15 KB latin-ext, and Fragment
// Mono's one weight 25 KB latin, as woff2. The browser fetches a subset only
// when the page uses one of its characters.
import "@fontsource-variable/mona-sans/wght.css";
import "@fontsource/fragment-mono/400.css";
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
