import { App, MetadataCache, TFile, Vault } from "obsidian";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import QuartzSyncerSettings from "src/models/settings";
import { DataStore } from "src/publishFile/DataStore";
import { PublishFile } from "src/publishFile/PublishFile";

function makeSettings(
	overrides: Partial<QuartzSyncerSettings> = {},
): QuartzSyncerSettings {
	return {
		vaultPath: "/",
		contentFolder: "content",
		publishFrontmatterKey: "publish",
		allNotesPublishableByDefault: false,
		gitPublishTargets: [
			{ key: "docs", remoteUrl: "https://example.com/docs.git" },
		],
		useCache: false,
		useBases: false,
		useCanvas: false,
		useExcalidraw: false,
		tagRewriteRules: [],
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		showPublishedTimestamp: false,
		createdTimestampKey: "created",
		updatedTimestampKey: "updated",
		publishedTimestampKey: "published",
		timestampFormat: "YYYY-MM-DD",
		...overrides,
	} as QuartzSyncerSettings;
}

function makePublishFile({
	path,
	name,
	extension = "md",
	frontmatter = {},
	settings = makeSettings(),
}: {
	path: string;
	name: string;
	extension?: string;
	frontmatter?: Record<string, unknown>;
	settings?: QuartzSyncerSettings;
}): PublishFile {
	const file = {
		path,
		name,
		extension,
		stat: { mtime: 0 },
	} as TFile;

	const metadataCache = {
		getCache: jest.fn().mockReturnValue({ frontmatter }),
	} as unknown as MetadataCache;

	return new PublishFile({
		file,
		compiler: {} as SyncerPageCompiler,
		metadataCache,
		vault: {} as Vault,
		settings,
		datastore: {} as DataStore,
	});
}

describe("PublishFile", () => {
	describe("getPublishPath", () => {
		it.each([
			["docs", "Campaign/Characters/Ada.md", "docs", true],
			["docs/characters/npcs", "characters/npcs/Ada.md", "docs", true],
			["docs/root", "Ada.md", "docs", true],
			["docs/root/child", "root/child/Ada.md", "docs", true],
			[" docs/root ", "Ada.md", "docs", true],
			[true, "Campaign/Characters/Ada.md", undefined, true],
			[false, "Campaign/Characters/Ada.md", undefined, false],
			["missing/root", "Campaign/Characters/Ada.md", undefined, false],
		])("routes %s to %s", (publish, path, target, publishable) => {
			const file = makePublishFile({
				path: "Campaign/Characters/Ada.md",
				name: "Ada.md",
				frontmatter: { publish, publishFolder: "ignored" },
			});
			expect(file.getPublishPath()).toBe(path);
			expect(file.publishTargetKey).toBe(target);
			expect(file.shouldPublish()).toBe(publishable);
		});

		it("uses a custom publish property name", () => {
			const file = makePublishFile({
				path: "Campaign/Ada.md",
				name: "Ada.md",
				frontmatter: { site: "docs/root" },
				settings: makeSettings({ publishFrontmatterKey: "site" }),
			});
			expect(file.publishTargetKey).toBe("docs");
			expect(file.getPublishPath()).toBe("Ada.md");
		});

		it("does not route to a disabled target", () => {
			const file = makePublishFile({
				path: "Campaign/Ada.md",
				name: "Ada.md",
				frontmatter: { publish: "docs/root" },
				settings: makeSettings({
					gitPublishTargets: [
						{
							key: "docs",
							remoteUrl: "https://example.com/docs.git",
							enabled: false,
						},
					],
				}),
			});
			expect(file.publishTargetKey).toBeUndefined();
			expect(file.shouldPublish()).toBe(false);
			expect(file.getPublishPath()).toBe("Campaign/Ada.md");
		});

		it("preserves the source vault path when the publish folder is absent", () => {
			const file = makePublishFile({
				path: "Campaign/Characters/Ada.md",
				name: "Ada.md",
			});

			expect(file.getPublishPath()).toBe("Campaign/Characters/Ada.md");
		});

		it("routes markdown notes to the publish folder plus the source filename", () => {
			const file = makePublishFile({
				path: "Campaign/Characters/Ada.md",
				name: "Ada.md",
				frontmatter: { publish: "docs/characters" },
			});

			expect(file.getPublishPath()).toBe("characters/Ada.md");
		});

		it("normalizes publish folder values before building the output path", () => {
			const file = makePublishFile({
				path: "Campaign/Characters/Ada.md",
				name: "Ada.md",
				frontmatter: { publish: "docs//characters/../npcs\\" },
			});

			expect(file.getPublishPath()).toBe("characters/npcs/Ada.md");
		});

		it("keeps special file types on their existing path", () => {
			const file = makePublishFile({
				path: "boards/Map.canvas",
				name: "Map.canvas",
				extension: "canvas",
				frontmatter: { publish: "docs/maps" },
			});

			expect(file.getPublishPath()).toBe("boards/Map.canvas");
		});

		it("uses the vault-relative source path as the fallback path", () => {
			const file = makePublishFile({
				path: "VaultRoot/Campaign/Characters/Ada.md",
				name: "Ada.md",
				settings: makeSettings({ vaultPath: "VaultRoot/" }),
			});

			expect(file.getPublishPath()).toBe("Campaign/Characters/Ada.md");
		});
	});

	describe("compile", () => {
		it("applies publish-time routing, remove blocks, and tag rewrites together", async () => {
			const settings = makeSettings({
				tagRewriteRules: [
					{
						enabled: true,
						pattern: "^d/(.*)$",
						replacement: "tag/$1+dnd",
					},
				],
			});

			const file = {
				path: "Campaign/Characters/Ada.md",
				name: "Ada.md",
				extension: "md",
				stat: { ctime: 0, mtime: 0, size: 0 },
			} as TFile;

			const frontmatter = {
				publish: "docs/characters",
				tags: ["d/character/12thday", "unchanged"],
			};

			const metadataCache = {
				getCache: jest.fn().mockReturnValue({ frontmatter }),
				getFirstLinkpathDest: jest.fn().mockReturnValue(null),
			} as unknown as MetadataCache;

			const vault = {
				cachedRead: jest
					.fn()
					.mockResolvedValue(
						[
							"---",
							"publish: docs/characters",
							"tags:",
							"  - d/character/12thday",
							"  - unchanged",
							"---",
							"Public text",
							"<!-- quartz-syncer:remove-start -->",
							"Private text",
							"<!-- quartz-syncer:remove-end -->",
						].join("\n"),
					),
				readBinary: jest.fn(),
				getFileByPath: jest.fn().mockReturnValue(null),
			} as unknown as Vault;

			const datastore = {} as DataStore;
			const compiler = new SyncerPageCompiler(
				new App(),
				vault,
				settings,
				metadataCache,
				datastore,
			);

			const publishFile = new PublishFile({
				file,
				compiler,
				metadataCache,
				vault,
				settings,
				datastore,
			});

			const compiledFile = await publishFile.compile();
			const [compiledMarkdown] = compiledFile.getCompiledFile();

			expect(publishFile.getPublishPath()).toBe("characters/Ada.md");
			expect(compiledMarkdown).toContain("Public text");
			expect(compiledMarkdown).not.toContain("Private text");
			expect(compiledMarkdown).toContain("tag/character/12thday+dnd");
			expect(compiledMarkdown).toContain("unchanged");
			expect(frontmatter.tags).toEqual([
				"d/character/12thday",
				"unchanged",
			]);
		});
	});
});
