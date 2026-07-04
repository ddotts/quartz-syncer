import type QuartzSyncer from "main";
import { CliData, CliFlags, RegisterFn } from "../types";
import { formatCliOutput, cliSuccess, cliError } from "../formatOutput";
import {
	buildVerboseMessage,
	checkPreFlight,
	getErrorMessage,
	initPublishStatus,
	parseVerboseFlags,
	pluralize,
} from "../handlerUtils";

const COMMAND = "quartz-syncer:publish";

const FLAGS: CliFlags = {
	"dry-run": {
		description: "Show what would be published without changes",
	},
	format: {
		value: "<json|text>",
		description: "Output format (default: text)",
	},
};

export function createPublishHandler(
	register: RegisterFn,
	plugin: QuartzSyncer,
): void {
	register(
		COMMAND,
		"Publish pending notes without deletions",
		FLAGS,
		async (params: CliData): Promise<string> => {
			try {
				const preFlightError = checkPreFlight(plugin, params, COMMAND);

				if (preFlightError) return preFlightError;

				const startTime = Date.now();
				const dryRun = params["dry-run"] === "true";
				const { includeVerbose } = parseVerboseFlags(params);

				const { publisher, status } = await initPublishStatus(plugin);

				const filesToPublish = [
					...status.unpublishedNotes,
					...status.changedNotes,
				];

				const data = {
					publish: filesToPublish.map((f) => f.getPath()),
					summary: {
						published: filesToPublish.length,
					},
				};

				if (dryRun) {
					const baseMessage = `Dry run: ${filesToPublish.length} to publish.`;

					const message = buildVerboseMessage(
						includeVerbose,
						[
							{
								label: `Published ${filesToPublish.length} ${pluralize(
									filesToPublish.length,
									"file",
								)}:`,
								items: data.publish,
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

				if (filesToPublish.length === 0) {
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
								],
								"Nothing to publish.",
							),
							data,
							Date.now() - startTime,
						),
					);
				}

				const publishOk =
					typeof publisher.publishBatchesByTarget === "function"
						? await publisher.publishBatchesByTarget(filesToPublish)
						: await publisher.publishBatch(
								filesToPublish,
								publisher.createConnection(),
							);

				if (!publishOk) {
					throw new Error("Failed to publish files.");
				}

				const baseMessage = `Published ${filesToPublish.length} ${pluralize(
					filesToPublish.length,
					"file",
				)}.`;

				const message = buildVerboseMessage(
					includeVerbose,
					[
						{
							label: `Published ${filesToPublish.length} ${pluralize(
								filesToPublish.length,
								"file",
							)}:`,
							items: data.publish,
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
