#!/usr/bin/env bun
/**
 * Compile this host's standalone omp, embedding the official natives package
 * of the same version. This fork does not rebuild the native ABI.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { compileCodingAgent } from "./compile-binary";

const repoRoot = path.join(import.meta.dir, "../../..");
const nativesPackage = await Bun.file(path.join(repoRoot, "packages/natives/package.json")).json();
const version = nativesPackage.version;
if (typeof version !== "string" || version.length === 0) throw new Error("natives package has no version");

const platform = process.platform;
const arch = process.arch;
if ((platform !== "win32" && platform !== "linux") || arch !== "x64") {
	throw new Error(`This workflow only builds win32/linux x64, not ${platform}-${arch}`);
}

const fileOs = platform === "win32" ? "windows" : "linux";
const asset = `omp-${fileOs}-x64${platform === "win32" ? ".exe" : ""}`;
const outfile = path.join(repoRoot, "packages/coding-agent/binaries", asset);
const nativeDir = path.join(repoRoot, "packages/natives/native");
const leaf = `@oh-my-pi/pi-natives-${platform}-x64@${version}`;

const fetchDir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-native-leaf-"));
try {
	await Bun.write(path.join(fetchDir, "package.json"), JSON.stringify({ name: "omp-native-leaf", version: "0.0.0" }));
	const added = await $`bun add ${leaf}`.cwd(fetchDir).nothrow();
	if (added.exitCode !== 0) {
		throw new Error(`Failed to fetch ${leaf}:\n${added.stderr.toString() || added.stdout.toString()}`);
	}
	const unpacked = path.join(fetchDir, "node_modules", `@oh-my-pi/pi-natives-${platform}-x64`);
	await fs.mkdir(nativeDir, { recursive: true });
	let copied = 0;
	for (const name of await fs.readdir(unpacked)) {
		if (!name.endsWith(".node")) continue;
		await fs.copyFile(path.join(unpacked, name), path.join(nativeDir, name));
		copied++;
	}
	if (copied === 0) throw new Error(`${leaf} contained no .node addons`);
} finally {
	await fs.rm(fetchDir, { recursive: true, force: true });
}

await fs.mkdir(path.dirname(outfile), { recursive: true });
await compileCodingAgent({
	repoRoot,
	entrypoint: path.join(repoRoot, "packages/coding-agent/src/cli.ts"),
	outfile,
	native: { platform, arch },
	minifyIdentifiers: true,
});

const bytes = await Bun.file(outfile).bytes();
const sha256 = new Bun.SHA256().update(bytes).digest("hex");
await Bun.write(`${outfile}.sha256`, `${sha256}\n`);
console.log(`Built ${asset} (${bytes.byteLength} bytes) sha256:${sha256}`);
