import { Setting, App, PluginSettingTab } from "obsidian";
import SettingView from "src/views/SettingsView/SettingView";
import QuartzSyncer from "main";
import { TagRewriteRule } from "src/models/settings";

function isEscaped(value: string, index: number): boolean {
	let slashCount = 0;

	for (
		let cursor = index - 1;
		cursor >= 0 && value[cursor] === "\\";
		cursor--
	) {
		slashCount++;
	}

	return slashCount % 2 === 1;
}

function validateRegexPattern(pattern: string): string | null {
	if (pattern.trim() === "") {
		return "Pattern is empty. Empty rules are ignored during publishing.";
	}

	try {
		if (pattern.startsWith("/")) {
			for (let index = pattern.length - 1; index > 0; index--) {
				if (pattern[index] === "/" && !isEscaped(pattern, index)) {
					new RegExp(
						pattern.slice(1, index),
						pattern.slice(index + 1),
					);

					return null;
				}
			}

			return "Slash-delimited regex is missing its closing slash.";
		}

		new RegExp(pattern);

		return null;
	} catch (error) {
		return error instanceof Error
			? error.message
			: "Invalid regular expression.";
	}
}

/**
 * FrontmatterSettings class.
 * This class is responsible for managing the frontmatter settings of the Quartz Syncer plugin.
 */
export class FrontmatterSettings extends PluginSettingTab {
	app: App;
	plugin: QuartzSyncer;
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		settings: SettingView,
		settingsRootElement: HTMLElement,
	) {
		super(app, plugin);
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
		this.plugin = plugin;
		this.settingsRootElement = settingsRootElement;
	}

	/**
	 * Display the frontmatter settings.
	 * This method initializes the settings UI for managing Quartz Syncer's frontmatter properties.
	 */
	display(): void {
		this.settingsRootElement.empty();
		this.settingsRootElement.addClass("quartz-syncer-github-settings");

		this.initializeFrontmatterHeader();
		this.initializePublishFrontmatterKeySetting();
		this.initializeFrontmatterFormatSetting();
		this.initializeAllNotesPublishableByDefaultSetting();
		this.initializeShowCreatedTimestampSetting();
		this.initializeCreatedTimestampKeysSetting();
		this.initializeShowUpdatedTimestampSetting();
		this.initializeUpdatedTimestampKeysSetting();
		this.initializeShowPublishedTimestampSetting();
		this.initializePublishedTimestampKeysSetting();
		this.initializeEnablePermalinkSetting();
		this.initializeIncludeAllFrontmatterSetting();
		this.initializeTagRewriteRulesSetting();

		// Set defaults for users that upgraded instead of fresh install.
		const oldCreatedDefaults = ["created"];

		if (
			this.settings.settings.createdTimestampKey === "" ||
			oldCreatedDefaults.includes(
				this.settings.settings.createdTimestampKey,
			)
		) {
			this.settings.settings.createdTimestampKey =
				"created, created_at, date";
		}

		const oldUpdatedDefaults = ["modified"];

		if (
			this.settings.settings.updatedTimestampKey === "" ||
			oldUpdatedDefaults.includes(
				this.settings.settings.updatedTimestampKey,
			)
		) {
			this.settings.settings.updatedTimestampKey =
				"modified, lastmod, updated, last-modified";
		}

		const oldPublishedDefaults = ["published"];

		if (
			this.settings.settings.publishedTimestampKey === "" ||
			oldPublishedDefaults.includes(
				this.settings.settings.publishedTimestampKey,
			)
		) {
			this.settings.settings.publishedTimestampKey =
				"published, publishDate, date";
		}

		this.settings.settings.lastUsedSettingsTab = "frontmatter";
		void this.settings.plugin.saveSettings();
	}

	/**
	 * Initializes the header for the frontmatter settings section.
	 * This method creates a heading for the frontmatter settings in the UI.
	 */
	initializeFrontmatterHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Note properties (frontmatter)")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes' properties or frontmatter.",
			)
			.setHeading();
	};

	private initializeFrontmatterFormatSetting() {
		new Setting(this.settingsRootElement)
			.setName("Frontmatter format")
			.setDesc(
				"Output format for frontmatter in published notes. YAML is more readable, JSON is supported in case you need it.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("yaml", "YAML")
					.addOption("json", "JSON")
					.setValue(
						this.settings.settings.frontmatterFormat ?? "yaml",
					)
					.onChange(async (value) => {
						this.settings.settings.frontmatterFormat = value as
							| "yaml"
							| "json";
						await this.settings.plugin.saveSettings();
					}),
			);
	}

	private initializePublishFrontmatterKeySetting() {
		if (!this.settings.settings.allNotesPublishableByDefault) {
			new Setting(this.settingsRootElement)
				.setName("Publish key")
				.setDesc(
					'Note property key used to mark a note as eligible to publish. Use true for the default repo, or key/folder/subfolder for a target repo and folder. Use key/root for its content root, or key alone to inherit the note path. By default "publish".',
				)
				.addText((text) =>
					text
						.setPlaceholder("publish")
						.setValue(this.settings.settings.publishFrontmatterKey)
						.onChange(async (value) => {
							if (value.length === 0) {
								value = "publish";
							}

							this.settings.settings.publishFrontmatterKey =
								value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to make all notes publishable by default.
	 * This method allows users to override the publish key setting and make all notes eligible for publication.
	 */
	private initializeAllNotesPublishableByDefaultSetting() {
		new Setting(this.settingsRootElement)
			.setName("All notes publishable by default")
			.setDesc(
				"Make all notes publishable by default. This will override the publish key setting and make all notes eligible for publication.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.allNotesPublishableByDefault,
					)
					.onChange(async (value) => {
						this.settings.settings.allNotesPublishableByDefault =
							value;
						await this.settings.plugin.saveSettings();
						this.display();
					}),
			);
	}

	/**
	 * Initializes the setting to include all frontmatter properties.
	 * This method allows users to include all note properties in the Quartz Syncer note,
	 * overriding other property settings.
	 */
	private initializeIncludeAllFrontmatterSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include all properties")
			.setDesc(
				"Include all note properties in the Quartz Syncer note. Enabling this will overrides other property settings to include all properties keys and values. Even note properties that are not used by Quartz will be included in the note's frontmatter. You shouldn't need this setting unless you have Quartz components that require non-standard properties.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.includeAllFrontmatter = value;
						await this.settings.plugin.saveSettings();
						this.display();
					}),
			);
	}

	/**
	 * Initializes the setting to show the created timestamp in the note's properties.
	 * This method allows users to include the created timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowCreatedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include created timestamp")
				.setDesc(
					"Include the created timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showCreatedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showCreatedTimestamp = value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the created timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the created timestamp.
	 */
	private initializeCreatedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showCreatedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Created timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the created timestamp. By default, Quartz Syncer will look for 'created', 'created_at', and 'date'.",
				)
				.addText((text) =>
					text
						.setPlaceholder("created, created_at, date")
						.setValue(this.settings.settings.createdTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.createdTimestampKey ===
									""
							) {
								value = "created, created_at, date";
							}

							this.settings.settings.createdTimestampKey = value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to show the updated timestamp in the note's properties.
	 * This method allows users to include the updated timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowUpdatedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include modified timestamp")
				.setDesc(
					"Include the modified timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showUpdatedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showUpdatedTimestamp = value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the updated timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the updated timestamp.
	 */
	private initializeUpdatedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showUpdatedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Modified timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the modified timestamp. By default, Quartz Syncer will look for 'modified', 'lastmod', 'updated', and 'last-modified'.",
				)
				.addText((text) =>
					text
						.setPlaceholder(
							"modified, lastmod, updated, last-modified",
						)
						.setValue(this.settings.settings.updatedTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.updatedTimestampKey ===
									""
							) {
								value =
									"modified, lastmod, updated, last-modified";
							}

							this.settings.settings.updatedTimestampKey = value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to show the published timestamp in the note's properties.
	 * This method allows users to include the published timestamp in the Quartz Syncer note's frontmatter.
	 */
	private initializeShowPublishedTimestampSetting() {
		if (!this.settings.settings.includeAllFrontmatter) {
			new Setting(this.settingsRootElement)
				.setName("Include published timestamp")
				.setDesc(
					"Include the published timestamp in your note's properties.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.settings.settings.showPublishedTimestamp)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							this.settings.settings.showPublishedTimestamp =
								value;
							await this.settings.plugin.saveSettings();
							this.display();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to configure the published timestamp keys.
	 * This method allows users to configure a comma-separated list of keys to look for to determine the published timestamp.
	 */
	private initializePublishedTimestampKeysSetting() {
		if (
			!this.settings.settings.includeAllFrontmatter &&
			this.settings.settings.showPublishedTimestamp
		) {
			new Setting(this.settingsRootElement)
				.setName("Published timestamp keys")
				.setDesc(
					"Comma-separated list of keys to look for to determine the published timestamp. By default, Quartz Syncer will look for 'published', 'publishDate', and 'date'.",
				)
				.addText((text) =>
					text
						.setPlaceholder("published, publishDate, date")
						.setValue(this.settings.settings.publishedTimestampKey)
						.setDisabled(
							this.settings.settings.includeAllFrontmatter,
						)
						.onChange(async (value) => {
							if (
								value.length === 0 ||
								this.settings.settings.publishedTimestampKey ===
									""
							) {
								value = "published, publishDate, date";
							}

							this.settings.settings.publishedTimestampKey =
								value;
							await this.settings.plugin.saveSettings();
						}),
				);
		}
	}

	/**
	 * Initializes the setting to enable permalinks in the note's properties.
	 * This method allows users to use the note's permalink as the Quartz note's URL
	 * even if "permalink" is not in the frontmatter.
	 */
	private initializeEnablePermalinkSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable permalinks")
			.setDesc(
				"Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter. This will override the default Quartz URL.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.usePermalink)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.usePermalink = value;
						await this.settings.plugin.saveSettings();
					}),
			);
	}

	private initializeTagRewriteRulesSetting() {
		new Setting(this.settingsRootElement)
			.setName("Published tag rewrite rules")
			.setDesc(
				"Rewrite tags in published frontmatter with ordered JavaScript regex replacements. Source notes are not changed.",
			)
			.setHeading();

		const rules = this.settings.settings.tagRewriteRules ?? [];

		rules.forEach((rule, index) => {
			this.initializeTagRewriteRuleRow(rule, index);
		});

		new Setting(this.settingsRootElement)
			.setName("Add tag rewrite rule")
			.setDesc(
				"Example pattern: ^d/character/(.+)$, replacement: tag/character/$1+dnd.",
			)
			.addButton((button) =>
				button
					.setButtonText("Add rule")
					.setCta()
					.onClick(async () => {
						this.settings.settings.tagRewriteRules = [
							...(this.settings.settings.tagRewriteRules ?? []),
							{
								pattern: "",
								replacement: "",
								enabled: true,
							},
						];
						await this.settings.plugin.saveSettings();
						this.display();
					}),
			);
	}

	private initializeTagRewriteRuleRow(rule: TagRewriteRule, index: number) {
		let validationMessage = validateRegexPattern(rule.pattern);

		const validationDescription = (message: string | null) =>
			message
				? `Invalid pattern: ${message}`
				: "Pattern, replacement, enabled toggle, and remove control.";

		const setting = new Setting(this.settingsRootElement)
			.setName(`Tag rewrite rule ${index + 1}`)
			.setDesc(validationDescription(validationMessage));

		if (validationMessage) {
			setting.settingEl.addClass("quartz-syncer-setting-error");
		}

		setting.addText((text) =>
			text
				.setPlaceholder("^d/character/(.+)$")
				.setValue(rule.pattern)
				.onChange(async (value) => {
					rule.pattern = value;
					validationMessage = validateRegexPattern(value);
					setting.setDesc(validationDescription(validationMessage));

					setting.settingEl.toggleClass(
						"quartz-syncer-setting-error",
						validationMessage !== null,
					);
					await this.settings.plugin.saveSettings();
				}),
		);

		setting.addText((text) =>
			text
				.setPlaceholder("tag/character/$1+dnd")
				.setValue(rule.replacement)
				.onChange(async (value) => {
					rule.replacement = value;
					await this.settings.plugin.saveSettings();
				}),
		);

		setting.addToggle((toggle) =>
			toggle.setValue(rule.enabled !== false).onChange(async (value) => {
				rule.enabled = value;
				await this.settings.plugin.saveSettings();
			}),
		);

		setting.addButton((button) =>
			button
				.setIcon("trash")
				.setTooltip("Remove rule")
				.onClick(async () => {
					this.settings.settings.tagRewriteRules = (
						this.settings.settings.tagRewriteRules ?? []
					).filter((_, ruleIndex) => ruleIndex !== index);
					await this.settings.plugin.saveSettings();
					this.display();
				}),
		);
	}
}
