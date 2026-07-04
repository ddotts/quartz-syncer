import { App, MetadataCache, TFile, Vault } from "obsidian";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "src/publishFile/Validator";
import QuartzSyncerSettings from "src/models/settings";
import { SyncerPageCompiler } from "src/compiler/SyncerPageCompiler";
import {
	CompiledPublishFile,
	getSpecialFileType,
	PublishFile,
} from "src/publishFile/PublishFile";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import { DataStore } from "src/publishFile/DataStore";
import { AssetSyncer } from "src/compiler/integrations";
import { ExtendedCacheService } from "src/services/ExtendedCacheService";
import QuartzSyncer from "main";

/**
 * MarkedForPublishing interface.
 * Represents the files and blobs that are marked for publishing.
 */
export interface MarkedForPublishing {
	notes: PublishFile[];
	blobs: string[];
}

/**
 * Publisher class.
 * Prepares files to be published and publishes them to Github
 */
export default class Publisher {
	app: App;
	plugin: QuartzSyncer;
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: SyncerPageCompiler;
	settings: QuartzSyncerSettings;
	vaultPath: string;
	datastore: DataStore;
	extendedCache: ExtendedCacheService;

	constructor(
		app: App,
		plugin: QuartzSyncer,
		vault: Vault,
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
		datastore: DataStore,
		extendedCache: ExtendedCacheService,
	) {
		this.app = app;
		this.plugin = plugin;
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.vaultPath = settings.vaultPath;
		this.datastore = datastore;
		this.extendedCache = extendedCache;

		this.compiler = new SyncerPageCompiler(
			app,
			vault,
			settings,
			metadataCache,
			datastore,
		);
	}

	getPublishTargetKeys(): string[] {
		if (typeof this.plugin.getEnabledPublishTargets === "function") {
			return this.plugin
				.getEnabledPublishTargets()
				.map((target) => target.key);
		}

		return (this.settings.gitPublishTargets ?? [])
			.filter((target) => target.enabled !== false)
			.map((target) => target.key.trim())
			.filter((key) => key.length > 0);
	}

	private getTargetKeysForFiles(
		files: CompiledPublishFile[],
	): Array<string | undefined> {
		const keys = new Set<string | undefined>();

		for (const file of files) {
			keys.add(file.publishTargetKey);
		}

		return [...keys];
	}

	/**
	 * Checks if the file should be published based on its frontmatter.
	 *
	 * @param file - The file to check.
	 * @returns true if the file should be published, false otherwise.
	 */
	shouldPublish(file: TFile): boolean {
		const specialType = getSpecialFileType(file);

		if (specialType) {
			return this.isSpecialTypeEnabled(specialType);
		}

		const frontMatter = this.metadataCache.getCache(file.path)?.frontmatter;

		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			frontMatter,
			this.settings.allNotesPublishableByDefault,
			this.getPublishTargetKeys(),
		);
	}

	/**
	 * Gets the files that are marked for publishing.
	 *
	 * @returns A promise that resolves to an object containing notes and blobs to be published.
	 */
	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const vaultIsRoot = this.settings.vaultPath === "/";

		const isInVault = (path: string): boolean =>
			vaultIsRoot || path.startsWith(this.settings.vaultPath);

		let markdownPaths: Set<string>;

		if (this.settings.allNotesPublishableByDefault) {
			markdownPaths = new Set(
				this.vault
					.getMarkdownFiles()
					.filter((f) => isInVault(f.path))
					.map((f) => f.path),
			);
		} else if (this.extendedCache.isReady) {
			const candidates =
				this.extendedCache.api.getFilesWithFrontmatterKey(
					this.settings.publishFrontmatterKey,
				);

			markdownPaths = new Set<string>();

			for (const path of candidates) {
				if (!isInVault(path)) continue;

				const fm = this.metadataCache.getCache(path)?.frontmatter;

				if (
					hasPublishFlag(
						this.settings.publishFrontmatterKey,
						fm,
						false,
						this.getPublishTargetKeys(),
					)
				) {
					markdownPaths.add(path);
				}
			}
		} else {
			markdownPaths = new Set(
				this.vault
					.getMarkdownFiles()
					.filter((f) => {
						if (!isInVault(f.path)) {
							return false;
						}

						const fm = this.metadataCache.getCache(
							f.path,
						)?.frontmatter;

						return hasPublishFlag(
							this.settings.publishFrontmatterKey,
							fm,
							false,
							this.getPublishTargetKeys(),
						);
					})
					.map((f) => f.path),
			);
		}

		// Collect base and canvas files in a single vault pass
		const baseFiles: TFile[] = [];
		const canvasFiles: TFile[] = [];

		if (this.settings.useBases || this.settings.useCanvas) {
			for (const f of this.vault.getFiles()) {
				if (!isInVault(f.path)) continue;

				if (this.settings.useBases && f.extension === "base") {
					baseFiles.push(f);
				} else if (
					this.settings.useCanvas &&
					f.extension === "canvas"
				) {
					canvasFiles.push(f);
				}
			}
		}

		const excalidrawFiles = this.settings.useExcalidraw
			? this.vault
					.getMarkdownFiles()
					.filter(
						(f) =>
							(f.path.endsWith(".excalidraw") ||
								f.path.endsWith(".excalidraw.md")) &&
							isInVault(f.path),
					)
			: [];

		for (const f of excalidrawFiles) {
			markdownPaths.delete(f.path);
		}

		const mdFiles = [...markdownPaths]
			.map((p) => this.vault.getFileByPath(p))
			.filter((f): f is TFile => f !== null);

		const files = [
			...mdFiles,
			...baseFiles,
			...canvasFiles,
			...excalidrawFiles,
		];

		const notesToPublish: PublishFile[] = [];
		const blobsToPublish: Set<string> = new Set();

		for (const file of files) {
			try {
				const publishFile = new PublishFile({
					file,
					compiler: this.compiler,
					metadataCache: this.metadataCache,
					vault: this.vault,
					settings: this.settings,
					datastore: this.datastore,
				});

				notesToPublish.push(publishFile);

				const blobs = await publishFile.getBlobLinks();

				blobs.forEach((i) => blobsToPublish.add(i));
			} catch (e) {
				console.error(e);
			}
		}

		return {
			notes: notesToPublish.sort((a, b) => a.compare(b)),
			blobs: Array.from(blobsToPublish),
		};
	}
	/**
	 * Creates a RepositoryConnection that can be shared across operations.
	 * Reusing a connection avoids redundant clone/fetch cycles.
	 */
	public createConnection(): RepositoryConnection {
		return this.createConnectionForTarget();
	}

	public createConnectionForTarget(targetKey?: string): RepositoryConnection {
		return new RepositoryConnection({
			gitSettings: this.plugin.getGitSettingsForTarget(targetKey),
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
		});
	}

	/**
	 * Deletes a batch of files from the repository.
	 *
	 * @param filePaths - An array of file paths to delete.
	 * @param connection - Optional shared RepositoryConnection to reuse.
	 * @returns A promise that resolves to true if the deletion was successful, false otherwise.
	 */
	public async deleteBatch(
		filePaths: string[],
		connection?: RepositoryConnection,
		onProgress?: (completed: number, total: number) => void | Promise<void>,
		targetKey?: string,
	): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection =
				connection ?? this.createConnectionForTarget(targetKey);

			await userQuartzConnection.deleteFiles(filePaths, onProgress);

			if (this.settings.useCache) {
				// Update the remote files and hashes in the datastore
				for (const filePath of filePaths) {
					await this.datastore.dropFile(filePath);
				}
			}

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	public async deleteBatchesByTarget(
		targetPaths: Map<string | undefined, string[]>,
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<boolean> {
		for (const [targetKey, filePaths] of targetPaths) {
			const connection = this.createConnectionForTarget(targetKey);

			const ok = await this.deleteBatch(
				filePaths,
				connection,
				onProgress,
				targetKey,
			);

			if (!ok) return false;
		}

		return true;
	}

	public async publishBatch(
		files: CompiledPublishFile[],
		connection?: RepositoryConnection,
		onProgress?: (completed: number, total: number) => void | Promise<void>,
		targetKey?: string,
	): Promise<boolean> {
		const filesToPublish = files.filter((f) => {
			const specialType = getSpecialFileType(f.file);

			if (specialType) {
				return this.isSpecialTypeEnabled(specialType);
			}

			return isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				f.frontmatter,
				this.settings.allNotesPublishableByDefault,
				this.getPublishTargetKeys(),
			);
		});

		const scopedFilesToPublish =
			targetKey === undefined
				? filesToPublish.filter((f) => f.publishTargetKey === undefined)
				: filesToPublish.filter(
						(f) => f.publishTargetKey === targetKey,
					);

		if (scopedFilesToPublish.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection =
				connection ?? this.createConnectionForTarget(targetKey);

			const assetSyncer = new AssetSyncer(this.settings);

			const assetResult =
				await assetSyncer.collectAssets(userQuartzConnection);

			await userQuartzConnection.updateFiles(
				scopedFilesToPublish,
				assetResult.filesToStage,
				assetResult.filesToDelete,
				onProgress,
			);

			if (this.settings.useCache) {
				for (const file of scopedFilesToPublish) {
					const data = await this.datastore.loadFile(file.file.path);

					if (data && data.localData) {
						await this.datastore.storeRemoteFile(
							file.file.path,
							file.file.stat.mtime,
							data.localData,
						);
					}
				}
			}

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	public async publishBatchesByTarget(
		files: CompiledPublishFile[],
		onProgress?: (completed: number, total: number) => void | Promise<void>,
	): Promise<boolean> {
		for (const targetKey of this.getTargetKeysForFiles(files)) {
			const connection = this.createConnectionForTarget(targetKey);

			const ok = await this.publishBatch(
				files,
				connection,
				onProgress,
				targetKey,
			);

			if (!ok) return false;
		}

		return true;
	}

	private isSpecialTypeEnabled(
		type: "base" | "canvas" | "excalidraw",
	): boolean {
		switch (type) {
			case "base":
				return this.settings.useBases;
			case "canvas":
				return this.settings.useCanvas;
			case "excalidraw":
				return this.settings.useExcalidraw;
		}
	}
}
