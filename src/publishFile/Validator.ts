import { FrontMatterCache, Notice } from "obsidian";

/**
 * Checks if the given flag exists in the front matter.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to check against.
 * @param override - Whether to override the check (default: false).
 * @returns true if the flag exists, false otherwise.
 */
export const hasPublishFlag = (
	flag: string,
	frontMatter?: FrontMatterCache,
	override = false,
	targetKeys: string[] = [],
): boolean => {
	if (override) return true;

	const value: unknown = frontMatter?.[flag];

	if (value === true) return true;

	if (typeof value === "string") {
		return targetKeys.includes(value.trim());
	}

	return false;
};

export const getPublishTargetKey = (
	flag: string,
	frontMatter?: FrontMatterCache,
	targetKeys: string[] = [],
): string | undefined => {
	const value: unknown = frontMatter?.[flag];

	if (typeof value !== "string") return undefined;

	const key = value.trim();

	return targetKeys.includes(key) ? key : undefined;
};

/**
 * Validates if the publish front matter is set correctly.
 *
 * @param flag - The flag to check in the front matter.
 * @param frontMatter - The front matter cache to validate.
 * @param override - Whether to override the check (default: false).
 * @returns true if the front matter is valid, false otherwise.
 * @throws Notice if the front matter is not valid.
 */
export function isPublishFrontmatterValid(
	flag: string,
	frontMatter?: FrontMatterCache,
	override = false,
	targetKeys: string[] = [],
): boolean {
	if (!hasPublishFlag(flag, frontMatter, override, targetKeys)) {
		new Notice(
			"Quartz Syncer: Note does not have a valid publish value. Use publish: true or a configured publish target key.",
		);

		return false;
	}

	return true;
}
