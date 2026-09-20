// Blocking, same-origin script: apply the saved appearance before the first paint.
// Keep storage key, fallback and theme colours aligned with react-app/theme.ts.
(() => {
	let preference = "system";
	try {
		preference = localStorage.getItem("wantkit.theme") || "system";
	} catch { /* Storage can be unavailable in private or restricted browsers. */ }
	const dark = preference === "dark" ||
		(preference !== "light" && preference !== "dark" &&
			matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	document.querySelector('meta[name="theme-color"]')?.setAttribute(
		"content", dark ? "#171717" : "#f7f7f7",
	);
})();
