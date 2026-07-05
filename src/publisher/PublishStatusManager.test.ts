import PublishStatusManager from "src/publisher/PublishStatusManager";
import Publisher from "src/publisher/Publisher";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

jest.mock("src/utils/utils", () => {
	const actual = jest.requireActual("src/utils/utils");

	return {
		...actual,
		generateBlobHash: jest.fn().mockResolvedValue("local-sha"),
		batchParallel: jest.fn(
			async <T, R>(items: T[], fn: (item: T) => Promise<R>) =>
				Promise.all(items.map(fn)),
		),
	};
});

describe("PublishStatusManager", () => {
	it("uses publish paths for remote status comparison and deleted-note detection", async () => {
		const compiledFile = {
			getCompiledFile: jest.fn().mockReturnValue(["compiled", { blobs: [] }]),
			getPublishPath: jest.fn().mockReturnValue("characters/Ada.md"),
		};

		const publishFile = {
			publishTargetKey: undefined,
			getVaultPath: jest
				.fn()
				.mockReturnValue("Campaign/Characters/Ada.md"),
			getPublishPath: jest.fn().mockReturnValue("characters/Ada.md"),
			compile: jest.fn().mockResolvedValue(compiledFile),
			getBlobLinks: jest.fn().mockResolvedValue([]),
		};

		const siteManager = {
			userSyncerConnection: {
				getContent: jest.fn().mockResolvedValue({ tree: [] }),
			},
			getNoteHashes: jest.fn().mockResolvedValue({
				"Campaign/Characters/Ada.md": "old-sha",
			}),
			getBlobHashes: jest.fn().mockResolvedValue({}),
		} as unknown as QuartzSyncerSiteManager;

		const publisher = {
			settings: {
				useCache: false,
				git: { remoteUrl: "https://example.com/repo.git" },
			},
			datastore: {
				flushCache: jest.fn().mockResolvedValue(undefined),
				clearMemoryCache: jest.fn(),
			},
			getFilesMarkedForPublishing: jest.fn().mockResolvedValue({
				notes: [publishFile],
				blobs: [],
			}),
			getPublishTargetKeys: jest.fn().mockReturnValue([]),
		} as unknown as Publisher;

		const status = await new PublishStatusManager(
			siteManager,
			publisher,
		).getPublishStatus(null as never);

		expect(status.unpublishedNotes).toEqual([compiledFile]);
		expect(status.changedNotes).toEqual([]);
		expect(status.publishedNotes).toEqual([]);
		expect(status.deletedNotePaths).toEqual([
			{
				path: "Campaign/Characters/Ada.md",
				sha: "old-sha",
				targetKey: undefined,
			},
		]);
		expect(status.compileIssues).toEqual([]);
		expect(publishFile.getPublishPath).toHaveBeenCalled();
		expect(publishFile.getVaultPath).not.toHaveBeenCalled();
	});

	it("collects per-file compile issues and continues compiling other notes", async () => {
		const compiledFile = {
			getCompiledFile: jest.fn().mockReturnValue(["compiled", { blobs: [] }]),
			getPublishPath: jest.fn().mockReturnValue("Good.md"),
		};

		const goodFile = {
			publishTargetKey: undefined,
			getPath: jest.fn().mockReturnValue("Good.md"),
			getPublishPath: jest.fn().mockReturnValue("Good.md"),
			compile: jest.fn().mockResolvedValue(compiledFile),
			getBlobLinks: jest.fn().mockResolvedValue([]),
		};

		const badFile = {
			publishTargetKey: undefined,
			getPath: jest.fn().mockReturnValue("Bad.md"),
			getPublishPath: jest.fn().mockReturnValue("routed/Bad.md"),
			compile: jest
				.fn()
				.mockRejectedValue(new Error("Missing remove-end marker")),
			getBlobLinks: jest.fn().mockResolvedValue([]),
		};

		const siteManager = {
			userSyncerConnection: {
				getContent: jest.fn().mockResolvedValue({ tree: [] }),
			},
			getNoteHashes: jest.fn().mockResolvedValue({}),
			getBlobHashes: jest.fn().mockResolvedValue({}),
		} as unknown as QuartzSyncerSiteManager;

		const publisher = {
			settings: {
				useCache: false,
				git: { remoteUrl: "https://example.com/repo.git" },
			},
			datastore: {
				flushCache: jest.fn().mockResolvedValue(undefined),
				clearMemoryCache: jest.fn(),
			},
			getFilesMarkedForPublishing: jest.fn().mockResolvedValue({
				notes: [goodFile, badFile],
				blobs: [],
			}),
			getPublishTargetKeys: jest.fn().mockReturnValue([]),
		} as unknown as Publisher;

		const status = await new PublishStatusManager(
			siteManager,
			publisher,
		).getPublishStatus(null as never);

		expect(status.unpublishedNotes).toEqual([compiledFile]);
		expect(status.changedNotes).toEqual([]);
		expect(status.publishedNotes).toEqual([]);
		expect(status.compileIssues).toEqual([
			{
				sourcePath: "Bad.md",
				publishPath: "routed/Bad.md",
				publishTargetKey: undefined,
				severity: "error",
				message: "Missing remove-end marker",
			},
		]);
		expect(goodFile.compile).toHaveBeenCalled();
		expect(badFile.compile).toHaveBeenCalled();
	});
});
