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

const COMMAND = "quartz-syncer:delete";

const FLAGS: CliFlags = {
	force: {
		description: "Apply deletions (required)",
	},
	"dry-run": {
		description: "Show what would be deleted without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createDeleteHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Delete removed notes from the remote repository",
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
				const filteredDeletedBlobs = filterDeletedBlobs(status);

				const deletions = [
					...status.deletedNotePaths.map((p) => p.path),
					...filteredDeletedBlobs.map((p) => p.path),
				];

				const data = {
					delete: deletions,
					summary: {
						deleted: deletions.length,
					},
				};

				if (dryRun) {
					const baseMessage = `Dry run: ${deletions.length} to delete.`;

					const message = buildVerboseMessage(
						includeVerbose,
						[
							{
								label: `Deleted ${deletions.length} ${pluralize(
									deletions.length,
									"file",
								)}:`,
								items: deletions,
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

				if (deletions.length === 0) {
					return formatCliOutput(
						params,
						cliSuccess(
							COMMAND,
							buildVerboseMessage(
								includeVerbose,
								[
									{
										label: `Deleted 0 ${pluralize(0, "file")}:`,
										items: [],
									},
								],
								"Nothing to delete.",
							),
							data,
							Date.now() - startTime,
						),
					);
				}

				if (!force) {
					return formatCliOutput(
						params,
						cliError(
							COMMAND,
							"Deletion requires the 'force' flag.",
						),
					);
				}

				const pathsByTarget = new Map<string | undefined, string[]>();

				for (const path of deletions) {
					const targetKey =
						status.deletedNotePaths.find((p) => p.path === path)
							?.targetKey ??
						filteredDeletedBlobs.find((p) => p.path === path)
							?.targetKey;
					const paths = pathsByTarget.get(targetKey) ?? [];
					paths.push(path);
					pathsByTarget.set(targetKey, paths);
				}

				const deleteOk =
					typeof publisher.deleteBatchesByTarget === "function"
						? await publisher.deleteBatchesByTarget(pathsByTarget)
						: await publisher.deleteBatch(
								deletions,
								publisher.createConnection(),
							);

				if (!deleteOk) {
					throw new Error("Failed to delete files.");
				}

				const baseMessage = `Deleted ${deletions.length} ${pluralize(
					deletions.length,
					"file",
				)}.`;

				const message = buildVerboseMessage(
					includeVerbose,
					[
						{
							label: `Deleted ${deletions.length} ${pluralize(
								deletions.length,
								"file",
							)}:`,
							items: deletions,
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
