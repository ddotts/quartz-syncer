import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "src/publisher/Publisher";
import { generateBlobHash, batchParallel } from "src/utils/utils";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { LoadingController } from "src/models/ProgressBar";
import Logger from "js-logger";

/**
 * PublishStatusManager class.
 * Manages the publishing status of notes and blobs for a digital garden.
 */
export default class PublishStatusManager implements IPublishStatusManager {
	siteManager: QuartzSyncerSiteManager;
	publisher: Publisher;

	constructor(siteManager: QuartzSyncerSiteManager, publisher: Publisher) {
		this.siteManager = siteManager;
		this.publisher = publisher;
	}

	/**
	 * Gets the paths of deleted notes.
	 *
	 * @returns A promise that resolves to an array of deleted note paths.
	 */
	getDeletedNotePaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Gets the paths of deleted blobs.
	 *
	 * @returns A promise that resolves to an array of deleted blob paths.
	 */
	getDeletedBlobsPaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<PathToRemove> {
		const markedSet = new Set(marked);
		const isJsFile = (key: string) => key.endsWith(".js");

		const isMarkedForPublish = (key: string) => markedSet.has(key);

		const deletedPaths = Object.keys(remoteNoteHashes).filter(
			(key) => !isJsFile(key) && !isMarkedForPublish(key),
		);

		const pathsWithSha = deletedPaths.map((path) => {
			return {
				path,
				sha: remoteNoteHashes[path],
			};
		});

		return pathsWithSha;
	}

	/**
	 * Gets the current publish status, including unpublished, published, changed notes,
	 * and deleted note and blob paths.
	 *
	 * @param controller - The loading controller to manage the loading state.
	 * @returns A promise that resolves to an object containing the publish status.
	 */
	async getPublishStatus(
		controller: LoadingController,
	): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];
		const deletedNotePaths: Array<PathToRemove> = [];
		const deletedBlobPaths: Array<PathToRemove> = [];
		const compileIssues: Array<PublishCompileIssue> = [];

		if (controller) {
			controller.setText("Retrieving publish status...");
			controller.setProgress(0);
		}

		const marked = await this.publisher.getFilesMarkedForPublishing();

		const targetKeys = [
			undefined,
			...this.publisher.getPublishTargetKeys(),
		] as Array<string | undefined>;

		for (const targetKey of targetKeys) {
			const targetSiteManager =
				targetKey === undefined
					? this.siteManager
					: new QuartzSyncerSiteManager(
							this.siteManager.metadataCache,
							this.publisher.settings,
							this.publisher.plugin.getGitSettingsForTarget(
								targetKey,
							),
						);

			const targetNotes = marked.notes.filter(
				(file) => file.publishTargetKey === targetKey,
			);

			if (
				targetKey === undefined &&
				!this.publisher.settings.git.remoteUrl
			) {
				if (targetNotes.length === 0) continue;

				throw new Error(
					"Default Git remote URL is not configured, but at least one note uses publish: true.",
				);
			}

			if (targetNotes.length === 0 && targetKey !== undefined) {
				continue;
			}

			const contentTree =
				await targetSiteManager.userSyncerConnection.getContent("HEAD");

			if (!contentTree) {
				throw new Error("Could not get content tree from base garden");
			}

			const remoteNoteHashes =
				await targetSiteManager.getNoteHashes(contentTree);

			const remoteBlobHashes =
				await targetSiteManager.getBlobHashes(contentTree);

			const remoteBlobHashesArray = Object.entries(remoteBlobHashes);

			if (this.publisher.settings.useCache) {
				await this.publisher.datastore.preloadCache();

				const entriesToProcess = remoteBlobHashesArray.filter(
					([path, sha]) => {
						if (!sha) return false;

						return (
							path.endsWith(".md") ||
							(this.publisher.settings.useBases &&
								path.endsWith(".base")) ||
							(this.publisher.settings.useCanvas &&
								path.endsWith(".canvas"))
						);
					},
				);

				const syncTotal = entriesToProcess.length;
				const syncPadLength = syncTotal.toString().length;
				let syncIndex = 0;

				const allNoteContents =
					await targetSiteManager.getAllNoteContents();

				await batchParallel(
					entriesToProcess,
					async ([path, sha]) => {
						syncIndex++;

						if (controller) {
							controller.setProgress(
								Math.floor((syncIndex / syncTotal) * 100),
							);

							controller.setIndexText(
								`Syncing remote cache: ${syncIndex
									.toString()
									.padStart(syncPadLength)}/${syncTotal}`,
							);

							controller.setText(`Processing ${path}...`);
						}

						const hash =
							await this.publisher.datastore.loadRemoteHash(path);

						if (hash && hash === sha) return;

						if (!this.publisher.vault.getFileByPath(path)) return;

						const remoteContent = allNoteContents.get(path) ?? "";

						if (!remoteContent) return;

						const timestamp =
							(await this.publisher.datastore.getTime(path)) ??
							Date.now();

						await this.publisher.datastore.storeRemoteFile(
							path,
							timestamp,
							[remoteContent, { blobs: [] }],
						);

						await this.publisher.datastore.storeRemoteHash(
							path,
							timestamp,
							sha,
						);
					},
					10,
				);

				if (controller) {
					controller.setText("Syncing cache to disk...");
					controller.setProgress(0);
				}

				await this.publisher.datastore.flushCache(controller);

				await this.publisher.datastore.synchronize(
					targetNotes.map((f) => f.getPath()),
				);

				if (this.publisher.settings.syncCache) {
					await this.publisher.plugin.compareDataToCache();
				}
			}

			if (controller) {
				controller.setText("Compiling notes...");
				controller.setProgress(0);
			}

			const compileTotal = targetNotes.length;
			const compilePadLength = compileTotal.toString().length;
			let compileIndex = 0;

			try {
				await batchParallel(
					targetNotes,
					async (file) => {
						compileIndex++;

						if (controller && compileTotal > 0) {
							controller.setProgress(
								Math.floor((compileIndex / compileTotal) * 100),
							);

							controller.setIndexText(
								`Compiling: ${compileIndex
									.toString()
									.padStart(
										compilePadLength,
									)}/${compileTotal}`,
							);

							controller.setText(
								`Compiling ${file.getVaultPath()}...`,
							);
						}

						let compiledFile: CompiledPublishFile;

						try {
							compiledFile = await file.compile();
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: String(error);

							compileIssues.push({
								sourcePath: file.getPath(),
								publishPath: file.getPublishPath(),
								publishTargetKey: file.publishTargetKey,
								severity: "error",
								message,
							});

							Logger.error(
								`Failed to compile ${file.getPath()}: ${message}`,
								error,
							);

							return;
						}

						const [content] = compiledFile.getCompiledFile();

						const localHash = await generateBlobHash(content);

						const remoteHash =
							remoteNoteHashes[file.getPublishPath()];

						if (!remoteHash) {
							unpublishedNotes.push(compiledFile);
						} else if (remoteHash === localHash) {
							compiledFile.setRemoteHash(remoteHash);
							publishedNotes.push(compiledFile);
						} else {
							compiledFile.setRemoteHash(remoteHash);
							changedNotes.push(compiledFile);
						}
					},
					10,
				);
			} finally {
				if (controller) {
					controller.setText("Saving compiled cache to disk...");
					controller.setProgress(0);
				}

				await this.publisher.datastore.flushCache(controller);

				this.publisher.datastore.clearMemoryCache();
			}

			deletedNotePaths.push(
				...this.generateDeletedContentPaths(
					remoteNoteHashes,
					targetNotes.map((f) => f.getPublishPath()),
				).map((path) => ({ ...path, targetKey })),
			);

			const targetBlobs = new Set<string>();

			for (const file of targetNotes) {
				const blobs = await file.getBlobLinks();
				blobs.forEach((blob) => targetBlobs.add(blob));
			}

			deletedBlobPaths.push(
				...this.generateDeletedContentPaths(remoteBlobHashes, [
					...targetBlobs,
				]).map((path) => ({ ...path, targetKey })),
			);
		}

		deletedNotePaths.sort((a, b) => a.path.localeCompare(b.path));

		return {
			unpublishedNotes,
			publishedNotes,
			changedNotes,
			deletedNotePaths,
			deletedBlobPaths,
			compileIssues,
		};
	}
}

/**
 * PathToRemove interface.
 * Represents a path and its SHA for deleted content.
 */
interface PathToRemove {
	path: string;
	sha: string;
	targetKey?: string;
}

export interface PublishCompileIssue {
	sourcePath: string;
	publishPath: string;
	publishTargetKey?: string;
	severity: "error" | "warning";
	message: string;
}

/**
 * PublishStatus interface.
 * Represents the status of published notes, including unpublished, published, changed notes, and deleted note and blob paths.
 */
export interface PublishStatus {
	unpublishedNotes: Array<CompiledPublishFile>;
	publishedNotes: Array<CompiledPublishFile>;
	changedNotes: Array<CompiledPublishFile>;
	deletedNotePaths: Array<PathToRemove>;
	deletedBlobPaths: Array<PathToRemove>;
	compileIssues: Array<PublishCompileIssue>;
}

/**
 * IPublishStatusManager interface.
 * Defines the methods for managing publish status.
 */
export interface IPublishStatusManager {
	getPublishStatus(controller: LoadingController): Promise<PublishStatus>;
}
