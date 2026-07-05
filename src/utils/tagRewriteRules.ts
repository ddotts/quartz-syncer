import Logger from "js-logger";
import { TagRewriteRule } from "src/models/settings";

const logger = Logger.get("tag-rewrite-rules");

type CompiledTagRewriteRule = {
	regex: RegExp;
	replacement: string;
};

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

function parseSlashDelimitedRegex(pattern: string): RegExp | null {
	if (!pattern.startsWith("/")) {
		return null;
	}

	for (let index = pattern.length - 1; index > 0; index--) {
		if (pattern[index] === "/" && !isEscaped(pattern, index)) {
			const source = pattern.slice(1, index);
			const flags = pattern.slice(index + 1);

			return new RegExp(source, flags);
		}
	}

	return null;
}

function compileTagRewriteRule(
	rule: TagRewriteRule,
	index: number,
): CompiledTagRewriteRule | null {
	if (!rule.enabled || rule.pattern.trim() === "") {
		return null;
	}

	try {
		const regex =
			parseSlashDelimitedRegex(rule.pattern) ?? new RegExp(rule.pattern);

		return {
			regex,
			replacement: rule.replacement,
		};
	} catch (error) {
		logger.warn(
			`Skipping invalid tag rewrite rule at index ${index}: ${rule.pattern}`,
			error,
		);

		return null;
	}
}

export function applyTagRewriteRules(
	tags: string[],
	rules: TagRewriteRule[] = [],
): string[] {
	const compiledRules = rules
		.map(compileTagRewriteRule)
		.filter((rule): rule is CompiledTagRewriteRule => rule !== null);

	if (compiledRules.length === 0) {
		return tags;
	}

	return [
		...new Set(
			tags.map((tag) =>
				compiledRules.reduce(
					(currentTag, rule) =>
						currentTag.replace(rule.regex, rule.replacement),
					tag,
				),
			),
		),
	];
}
