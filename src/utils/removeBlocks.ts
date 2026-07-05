export const REMOVE_BLOCK_START = "<!-- quartz-syncer:remove-start -->";
export const REMOVE_BLOCK_END = "<!-- quartz-syncer:remove-end -->";

export type RemoveBlockIssueKind =
	| "missing-start"
	| "missing-end"
	| "nested-marker";

export interface RemoveBlockIssue {
	kind: RemoveBlockIssueKind;
	message: string;
	index: number;
}

export type RemoveBlockResult =
	| { ok: true; text: string }
	| { ok: false; error: RemoveBlockIssue };

export class RemoveBlockError extends Error {
	readonly issue: RemoveBlockIssue;

	constructor(issue: RemoveBlockIssue) {
		super(issue.message);
		this.name = "RemoveBlockError";
		this.issue = issue;
	}
}

function getFencedCodeRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	const lineRegex = /.*(?:\r?\n|$)/g;

	let open:
		| {
				start: number;
				char: "`" | "~";
				length: number;
		  }
		| undefined;
	let match: RegExpExecArray | null;

	while ((match = lineRegex.exec(text)) !== null) {
		const line = match[0];

		if (line.length === 0) {
			break;
		}

		const fenceMatch = line.match(/^( {0,3})(`{3,}|~{3,})/);

		if (fenceMatch) {
			const marker = fenceMatch[2];
			const char = marker[0] as "`" | "~";

			if (!open) {
				open = {
					start: match.index,
					char,
					length: marker.length,
				};
			} else if (open.char === char && marker.length >= open.length) {
				ranges.push([open.start, match.index + line.length]);
				open = undefined;
			}
		}

		if (lineRegex.lastIndex >= text.length) {
			break;
		}
	}

	if (open) {
		ranges.push([open.start, text.length]);
	}

	return ranges;
}

function isIgnoredIndex(
	index: number,
	ranges: Array<[number, number]>,
): boolean {
	return ranges.some(([start, end]) => index >= start && index < end);
}

function findMarkerOutsideIgnoredRanges(
	text: string,
	marker: string,
	fromIndex: number,
	ignoredRanges: Array<[number, number]>,
): number {
	let index = text.indexOf(marker, fromIndex);

	while (index !== -1 && isIgnoredIndex(index, ignoredRanges)) {
		index = text.indexOf(marker, index + marker.length);
	}

	return index;
}

export function removeQuartzSyncerRemoveBlocks(
	text: string,
): RemoveBlockResult {
	const ignoredRanges = getFencedCodeRanges(text);
	let cursor = 0;
	let cleaned = "";

	while (cursor < text.length) {
		const startIndex = findMarkerOutsideIgnoredRanges(
			text,
			REMOVE_BLOCK_START,
			cursor,
			ignoredRanges,
		);

		const endIndex = findMarkerOutsideIgnoredRanges(
			text,
			REMOVE_BLOCK_END,
			cursor,
			ignoredRanges,
		);

		if (endIndex !== -1 && (startIndex === -1 || endIndex < startIndex)) {
			return {
				ok: false,
				error: {
					kind: "missing-start",
					message:
						"Found a quartz-syncer remove-end marker without a preceding remove-start marker.",
					index: endIndex,
				},
			};
		}

		if (startIndex === -1) {
			cleaned += text.slice(cursor);

			return { ok: true, text: cleaned };
		}

		cleaned += text.slice(cursor, startIndex);

		const matchingEndIndex = findMarkerOutsideIgnoredRanges(
			text,
			REMOVE_BLOCK_END,
			startIndex + REMOVE_BLOCK_START.length,
			ignoredRanges,
		);

		if (matchingEndIndex === -1) {
			return {
				ok: false,
				error: {
					kind: "missing-end",
					message:
						"Found a quartz-syncer remove-start marker without a matching remove-end marker.",
					index: startIndex,
				},
			};
		}

		const nestedStartIndex = findMarkerOutsideIgnoredRanges(
			text,
			REMOVE_BLOCK_START,
			startIndex + REMOVE_BLOCK_START.length,
			ignoredRanges,
		);

		if (nestedStartIndex !== -1 && nestedStartIndex < matchingEndIndex) {
			return {
				ok: false,
				error: {
					kind: "nested-marker",
					message:
						"Nested quartz-syncer remove blocks are not supported.",
					index: nestedStartIndex,
				},
			};
		}

		cursor = matchingEndIndex + REMOVE_BLOCK_END.length;
	}

	return { ok: true, text: cleaned };
}
