import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { LocaleProvider } from "./LocaleProvider.tsx";
import { resolveInitialLocale } from "./locale-runtime.ts";
import { initializeTheme } from "./theme.ts";

const stopTheme = initializeTheme();
import.meta.hot?.dispose(stopTheme);
const initialLocale = resolveInitialLocale();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<LocaleProvider initialLocale={initialLocale}>
			<App />
		</LocaleProvider>
	</StrictMode>,
);
