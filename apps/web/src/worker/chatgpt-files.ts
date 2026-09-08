import { visualLimits, type VisualImport } from "@kharidyar/contracts";
import { ApiError } from "./api-errors";

type DownloadUrlRejection =
	| "malformed"
	| "scheme"
	| "credentials"
	| "port"
	| "fragment"
	| "host"
	| "path";

function invalidDownloadLocation(reason: DownloadUrlRejection, url?: URL) {
	// The native file handoff can hide the expanded URL from the model. Return
	// only a bounded diagnostic to the caller, never the URL or a server log.
	const http = url?.protocol === "https:" || url?.protocol === "http:";
	const segments = http ? url.pathname.split("/").filter(Boolean) : [];
	const pathShape = http
		? `/${segments
				.slice(0, 8)
				.map((segment) => {
					const prefix = segment.startsWith("file-")
						? "file-"
						: segment.startsWith("file_")
							? "file_"
							: "";
					const extension =
						/\.(png|jpe?g|webp)$/i.exec(segment)?.[0].toLowerCase() ?? "";
					return `${prefix}<redacted>${extension}`;
				})
				.join("/")}${segments.length > 8 ? "/<more>" : ""}`
		: null;
	const diagnostic = {
		reason,
		scheme: !url
			? null
			: ["https:", "http:", "data:", "file:", "sandbox:"].includes(url.protocol)
				? url.protocol
				: "other",
		hostname:
			http &&
			url.hostname.length <= 253 &&
			/^[a-z0-9.[\]:-]+$/.test(url.hostname)
				? url.hostname
				: null,
		pathShape,
	};
	return new ApiError(
		400,
		"INVALID_MEDIA",
		`This download location is not supported. CHATGPT_FILE_URL_REJECTED ${JSON.stringify(diagnostic)}. Share this redacted diagnostic with WantKit support. Do not construct a different URL or retry with a new operation ID.`,
	);
}

// Review origins separately: the Actions guide supplies files.oaiusercontent.com;
// the 2026-09-08 native file handoff supplied sdmntprcentralus with three opaque
// path segments (verified by our redacted diagnostic and a public HTTPS check).
// The MCP contract promises neither a host nor a /file-* path. No wildcard hosts.
export function chatgptDownloadUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw invalidDownloadLocation("malformed");
	}
	if (url.protocol !== "https:") throw invalidDownloadLocation("scheme", url);
	if (url.username || url.password)
		throw invalidDownloadLocation("credentials", url);
	if (url.port) throw invalidDownloadLocation("port", url);
	if (url.hash) throw invalidDownloadLocation("fragment", url);
	if (url.hostname === "files.oaiusercontent.com") {
		if (!url.pathname.startsWith("/file-"))
			throw invalidDownloadLocation("path", url);
	} else if (url.hostname === "sdmntprcentralus.oaiusercontent.com") {
		if (!/^\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname))
			throw invalidDownloadLocation("path", url);
	} else {
		throw invalidDownloadLocation("host", url);
	}
	return url;
}
const invalidFile = () =>
	new ApiError(
		400,
		"INVALID_MEDIA",
		"The ChatGPT download did not return a non-empty PNG, JPEG or WebP image.",
	);

export async function boundedBytes(
	response: Response,
	maximum: number,
): Promise<ArrayBuffer> {
	const declared = response.headers.get("content-length");
	if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
		await response.body?.cancel();
		throw new ApiError(
			400,
			"INVALID_MEDIA",
			"The file exceeds the transfer limit.",
		);
	}
	if (!response.body) throw invalidFile();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			length += next.value.byteLength;
			if (length > maximum)
				throw new ApiError(
					400,
					"INVALID_MEDIA",
					"The file exceeds the transfer limit.",
				);
			chunks.push(next.value);
		}
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	if (!length) throw invalidFile();
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes.buffer;
}

export async function downloadChatgptImage(
	file: VisualImport["file"],
	maximum: number,
): Promise<File> {
	const url = chatgptDownloadUrl(file.download_url);
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		visualLimits.importTimeoutMs,
	);
	try {
		// Never forward incoming headers, cookies, or OAuth credentials. Never follow redirects.
		const response = await fetch(url.href, {
			redirect: "manual",
			signal: controller.signal,
			headers: { accept: "image/png,image/jpeg,image/webp" },
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw invalidFile();
		}
		const type = response.headers
			.get("content-type")
			?.split(";")[0]
			.trim()
			.toLowerCase();
		if (
			!type ||
			!["image/png", "image/jpeg", "image/webp"].includes(type) ||
			(file.mime_type && file.mime_type !== type)
		) {
			await response.body?.cancel();
			throw invalidFile();
		}
		return new File([await boundedBytes(response, maximum)], "chatgpt-output", {
			type,
		});
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(
			400,
			"INVALID_MEDIA",
			"The ChatGPT file could not be downloaded. It may have expired.",
		);
	} finally {
		clearTimeout(timeout);
	}
}
