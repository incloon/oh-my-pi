import { describe, expect, it } from "bun:test";
import { answerFromGitHubRelease, versionFromReleaseTag } from "../../src/cli/github-release";

const SHA = "a".repeat(64);

describe("GitHub release answers", () => {
	it("reads a whole-file asset and does not invent a patch", () => {
		const answer = answerFromGitHubRelease(
			{
				tag_name: "v18.18.0",
				assets: [
					{
						name: "omp-windows-x64.exe",
						size: 42,
						browser_download_url: "https://github.com/incloon/oh-my-pi/releases/download/v18.18.0/omp-windows-x64.exe",
					},
				],
			},
			"omp-windows-x64.exe",
			SHA,
		);
		expect(answer.version).toBe("18.18.0");
		expect(answer.file).toEqual({ name: "omp-windows-x64.exe", size: 42, sha256: SHA });
		expect(answer.download).toBe(
			"https://github.com/incloon/oh-my-pi/releases/download/v18.18.0/omp-windows-x64.exe",
		);
		expect(answer.patch).toBeUndefined();
	});

	it("rejects a tag that is not a version", () => {
		expect(() => versionFromReleaseTag("incloon")).toThrow("not a version");
	});
});
