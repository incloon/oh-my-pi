/**
 * Standalone-binary updates for this fork. A release is a full file on
 * GitHub Releases — never a stencil patch — so install and `omp update`
 * replace the same asset.
 */
import { APP_NAME, isRecord, VERSION } from "@oh-my-pi/pi-utils";
import {
	type BuildAnswer,
	type BuildHost,
	type BuildSelector,
	currentBuildHost,
	type Fetch,
	type FetchBuildOptions,
} from "./build-service";
import {
	isTimeoutError,
	isUnsupportedProxyError,
	unsupportedProxyMessage,
	withTimeoutSignal,
} from "../utils/fetch-timeout";

/** GitHub repo whose Releases are this fork's binary channel. */
export const GITHUB_UPDATE_REPO = "incloon/oh-my-pi";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

interface ReleaseAsset {
	name: string;
	size: number;
	browser_download_url: string;
	digest?: string;
}

/** `v1.2.3` or `1.2.3` → `1.2.3`. */
export function versionFromReleaseTag(tag: string): string {
	const version = tag.startsWith("v") ? tag.slice(1) : tag;
	if (!SEMVER.test(version)) throw new Error(`release tag ${tag} is not a version`);
	return version;
}

function assetSha256(asset: ReleaseAsset): string | undefined {
	const digest = asset.digest?.toLowerCase();
	if (!digest) return undefined;
	const hex = digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
	return SHA256_HEX.test(hex) ? hex : undefined;
}

/**
 * Map one GitHub Release to the download the installer already verifies.
 * No patch: the caller downloads the whole file.
 */
export function answerFromGitHubRelease(release: unknown, fileName: string, sha256: string): BuildAnswer {
	if (!isRecord(release) || typeof release.tag_name !== "string") throw new Error("release has no tag");
	const version = versionFromReleaseTag(release.tag_name);
	if (!Array.isArray(release.assets)) throw new Error("release has no assets");
	const asset = release.assets.find(
		(entry): entry is ReleaseAsset =>
			isRecord(entry) &&
			entry.name === fileName &&
			typeof entry.size === "number" &&
			Number.isSafeInteger(entry.size) &&
			entry.size > 0 &&
			typeof entry.browser_download_url === "string" &&
			entry.browser_download_url.startsWith("https://"),
	);
	if (!asset) throw new Error(`${fileName} is not in this release`);
	const digest = sha256.toLowerCase();
	if (!SHA256_HEX.test(digest)) throw new Error(`${fileName} has an invalid sha256`);
	return {
		version,
		file: { name: fileName, size: asset.size, sha256: digest },
		download: asset.browser_download_url,
	};
}

function releaseUrl(selector: BuildSelector): string {
	const base = `https://api.github.com/repos/${GITHUB_UPDATE_REPO}/releases`;
	return "version" in selector ? `${base}/tags/v${selector.version}` : `${base}/latest`;
}

async function readSha256(url: string, fetchImpl: Fetch, timeoutMs: number): Promise<string> {
	const response = await fetchImpl(url, {
		headers: { Accept: "application/octet-stream", "User-Agent": `${APP_NAME}/${VERSION}` },
		signal: withTimeoutSignal(timeoutMs),
	});
	if (!response.ok) throw new Error(`SHA-256 sidecar returned ${response.status}`);
	const text = (await response.text()).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
	if (!SHA256_HEX.test(text)) throw new Error(`SHA-256 sidecar is not a digest`);
	return text;
}

/** The newest GitHub Release, or one tag, as a whole-file download for this host. */
export async function fetchGitHubReleaseBuild(
	selector: BuildSelector,
	options: FetchBuildOptions = {},
): Promise<BuildAnswer> {
	const host: BuildHost = options.host ?? (await currentBuildHost());
	const timeoutMs = options.timeoutMs ?? 30_000;
	const fetchImpl = options.fetchImpl ?? fetch;
	const url = releaseUrl(selector);
	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: { Accept: "application/vnd.github+json", "User-Agent": `${APP_NAME}/${VERSION}` },
			signal: withTimeoutSignal(timeoutMs),
		});
	} catch (err) {
		if (isTimeoutError(err)) throw new Error(`Timed out asking GitHub for ${host.fileName}`, { cause: err });
		if (isUnsupportedProxyError(err)) throw new Error(unsupportedProxyMessage(), { cause: err });
		throw err;
	}
	if (response.status === 404) {
		throw new Error(`No ${APP_NAME} release for ${host.fileName} is published on ${GITHUB_UPDATE_REPO} yet.`);
	}
	if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${url}`);
	const body: unknown = await response.json();
	if (!isRecord(body) || !Array.isArray(body.assets)) throw new Error("GitHub release has no assets");
	const sidecar = body.assets.find(
		(entry): entry is ReleaseAsset => isRecord(entry) && entry.name === `${host.fileName}.sha256`,
	);
	const file = body.assets.find((entry): entry is ReleaseAsset => isRecord(entry) && entry.name === host.fileName);
	const stamped = file ? assetSha256(file) : undefined;
	const sha256 = stamped ?? (sidecar ? await readSha256(sidecar.browser_download_url, fetchImpl, timeoutMs) : "");
	return answerFromGitHubRelease(body, host.fileName, sha256);
}
