import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import {
	buildVerboseMessage,
	checkPreFlight,
	filterDeletedBlobs,
	getErrorMessage,
	initPublishStatus,
	parseVerboseFlags,
	pluralize,
} from "../handlerUtils";

const COMMAND = "quartz-syncer:sync";

const FLAGS: CliFlags = {
	force: {
		description: "Apply deletions (required to delete remote files)",
	},
	"dry-run": {
		description: "Show what would be published/deleted without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createSyncHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Publish pending notes and optionally delete removed notes",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const preFlightError = checkPreFlight(plugin, params, COMMAND);

				if (preFlightError) return preFlightError;

				const startTime = Date.now();
				const dryRun = params["dry-run"] === "true";
				const force = params.force === "true";
				const { includeVerbose } = parseVerboseFlags(params);

				const { publisher, status } = await initPublishStatus(plugin);

				const filesToPublish = [
					...status.unpublishedNotes,
					...status.changedNotes,
				];

				const filteredDeletedBlobs = filterDeletedBlobs(status);

				const deletions = [
					...status.deletedNotePaths.map((p) => p.path),
					...filteredDeletedBlobs.map((p) => p.path),
				];

				const data = {
					publish: filesToPublish.map((f) => f.getPath()),
					delete: deletions,
					skippedDeletes: [] as string[],
					summary: {
						published: filesToPublish.length,
						deleted: 0,
						skippedDeletes: 0,
					},
				};

				if (dryRun) {
					data.summary.deleted = deletions.length;

					const baseMessage = `Dry run: ${data.summary.published} to publish, ${deletions.length} to delete.`;

					const message = buildVerboseMessage(
						includeVerbose,
						[
							{
								label: `Published ${data.publish.length} ${pluralize(
									data.publish.length,
									"file",
								)}:`,
								items: data.publish,
							},
							{
								label: `Deleted ${data.delete.length} ${pluralize(
									data.delete.length,
									"file",
								)}:`,
								items: data.delete,
							},
						],
						baseMessage,
					);

					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							message,
							data,
							Date.now() - startTime,
						),
					);
				}

				if (filesToPublish.length === 0 && deletions.length === 0) {
					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							buildVerboseMessage(
								includeVerbose,
								[
									{
										label: `Published 0 ${pluralize(0, "file")}:`,
										items: [],
									},
									{
										label: `Deleted 0 ${pluralize(0, "file")}:`,
										items: [],
									},
									{
										label: `Skipped 0 ${pluralize(0, "deletion")}:`,
										items: [],
									},
								],
								"Nothing to sync.",
							),
							data,
							Date.now() - startTime,
						),
					);
				}

				const connection =
					typeof publisher.publishBatchesByTarget === "function" &&
					typeof publisher.deleteBatchesByTarget === "function"
						? undefined
						: publisher.createConnection();

				const publishOk =
					typeof publisher.publishBatchesByTarget === "function"
						? await publisher.publishBatchesByTarget(filesToPublish)
						: await publisher.publishBatch(
								filesToPublish,
								connection,
							);

				if (!publishOk) {
					throw new Error("Failed to publish files.");
				}

				let deletedCount = 0;
				let skippedDeletes: string[] = [];

				if (deletions.length > 0) {
					if (force) {
						const pathsByTarget = new Map<
							string | undefined,
							string[]
						>();

						for (const path of deletions) {
							const targetKey =
								status.deletedNotePaths.find(
									(p) => p.path === path,
								)?.targetKey ??
								filteredDeletedBlobs.find(
									(p) => p.path === path,
								)?.targetKey;
							const paths = pathsByTarget.get(targetKey) ?? [];
							paths.push(path);
							pathsByTarget.set(targetKey, paths);
						}

						const deleteOk =
							typeof publisher.deleteBatchesByTarget ===
							"function"
								? await publisher.deleteBatchesByTarget(
										pathsByTarget,
									)
								: await publisher.deleteBatch(
										deletions,
										connection,
									);

						if (!deleteOk) {
							throw new Error("Failed to delete files.");
						}
						deletedCount = deletions.length;
					} else {
						skippedDeletes = deletions;
					}
				}

				data.skippedDeletes = skippedDeletes;
				data.summary.deleted = deletedCount;
				data.summary.skippedDeletes = skippedDeletes.length;

				const messageParts = [
					`Published ${filesToPublish.length} ${pluralize(
						filesToPublish.length,
						"file",
					)}`,
					`Deleted ${deletedCount} ${pluralize(deletedCount, "file")}`,
				];

				if (skippedDeletes.length > 0) {
					messageParts.push(
						`Skipped ${skippedDeletes.length} ${pluralize(
							skippedDeletes.length,
							"deletion",
						)} (use force)`,
					);
				}

				const baseMessage = messageParts.join(". ") + ".";

				const actuallyDeleted = force ? deletions : [];

				const message = buildVerboseMessage(
					includeVerbose,
					[
						{
							label: `Published ${data.publish.length} ${pluralize(
								data.publish.length,
								"file",
							)}:`,
							items: data.publish,
						},
						{
							label: `Deleted ${actuallyDeleted.length} ${pluralize(
								actuallyDeleted.length,
								"file",
							)}:`,
							items: actuallyDeleted,
						},
						{
							label: `Skipped ${skippedDeletes.length} ${pluralize(
								skippedDeletes.length,
								"deletion",
							)}:`,
							items: skippedDeletes,
						},
					],
					baseMessage,
				);

				return formatCliOutput(
					params,
					cliSuccess(COMMAND, message, data, Date.now() - startTime),
				);
			} catch (error) {
				return formatCliOutput(
					params,
					cliError(COMMAND, getErrorMessage(error)),
				);
			}
		},
	);
}
