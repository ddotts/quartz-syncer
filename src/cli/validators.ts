import type QuartzSyncer from "main";

/**
 * Pre-flight validation for CLI commands that depend on Git settings.
 * Returns an error message string if validation fails, or null if valid.
 * Catches common misconfigurations before expensive operations.
 */
export function validatePreFlight(plugin: QuartzSyncer): string | null {
	const publishTargets =
		typeof plugin.getEnabledPublishTargets === "function"
			? plugin.getEnabledPublishTargets()
			: (plugin.settings.gitPublishTargets ?? []).filter(
					(target) =>
						target.enabled !== false &&
						target.key.trim().length > 0 &&
						target.remoteUrl.trim().length > 0,
				);

	if (!plugin.settings.git.remoteUrl && publishTargets.length === 0) {
		return "Git remote URL is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=git.remoteUrl value=<url>'.";
	}

	if (!plugin.settings.git.branch) {
		return "Git branch is not configured. Set it in plugin settings or via 'obsidian quartz-syncer:config action=set key=git.branch value=<branch>'.";
	}

	return null;
}
