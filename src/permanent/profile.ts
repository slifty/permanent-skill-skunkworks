import { z } from "zod";
import { LegacyApiError } from "./legacy-api.ts";
import { inArchive } from "./metadata.ts";
import type { PermanentClient } from "./api.ts";
import type { ArchiveSummary } from "./folders.ts";
import type { LegacyResponse } from "./legacy-api.ts";

export const BLURB_MAX_LENGTH = 200;
export const MILESTONE_TITLE_MAX_LENGTH = 140;
export const MILESTONE_DESCRIPTION_MAX_LENGTH = 200;

const BLURB = "profile.blurb";
const ABOUT = "profile.description";
const MILESTONE = "profile.milestone";
const PROFILE_EDITING_ROLES = new Set(["owner", "manager"]);
const NO_PROFILE_ITEMS = "error.profile_item.lookup";

const profileItemVo = z.looseObject({
	profile_itemId: z.number(),
	fieldNameUI: z.string(),
	string1: z.string().nullish(),
	string2: z.string().nullish(),
	textData1: z.string().nullish(),
	day1: z.string().nullish(),
	day2: z.string().nullish(),
	publicDT: z.string().nullish(),
});

type ProfileItemVo = z.infer<typeof profileItemVo>;

export interface Milestone {
	title: string;
	date?: string | undefined;
	endDate?: string | undefined;
	description?: string | undefined;
}

export interface ArchiveProfile {
	blurb?: string | undefined;
	about?: string | undefined;
	milestones: Milestone[];
	isPublic: boolean;
	publicFields: string[];
}

export interface ProfileChanges {
	blurb?: string | undefined;
	about?: string | undefined;
	milestones?: Milestone[] | undefined;
}

export interface ProfileUpdate {
	updated: string[];
	unchanged: string[];
}

const textOf = (value: string | null | undefined): string | undefined =>
	value === null || value === undefined || value.trim() === ""
		? undefined
		: value;

const sameTitle = (a: string, b: string | null | undefined): boolean =>
	a.trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const itemsIn = (response: LegacyResponse): ProfileItemVo[] =>
	response.Results.flatMap((result) => result.data ?? []).flatMap((entry) => {
		const parsed = profileItemVo.safeParse(entry.Profile_itemVO);
		return parsed.success ? [parsed.data] : [];
	});

const readItems = async (
	client: PermanentClient,
	archive: ArchiveSummary,
): Promise<ProfileItemVo[]> => {
	try {
		return itemsIn(
			await client.legacy("/profile_item/getAllByArchiveId", [
				{ Profile_itemVO: { archiveId: archive.archiveId } },
			]),
		);
	} catch (error) {
		if (
			error instanceof LegacyApiError &&
			error.messages.includes(NO_PROFILE_ITEMS)
		) {
			return [];
		}
		throw error;
	}
};

const milestoneOf = (item: ProfileItemVo): Milestone => ({
	title: item.string1 ?? "",
	date: textOf(item.day1),
	endDate: textOf(item.day2),
	description: textOf(item.string2),
});

const isPublicItem = (item: ProfileItemVo): boolean =>
	textOf(item.publicDT) !== undefined;

const labelOf = (item: ProfileItemVo): string => {
	if (item.fieldNameUI === BLURB) {
		return "blurb";
	}
	if (item.fieldNameUI === ABOUT) {
		return "about";
	}
	return item.fieldNameUI === MILESTONE
		? `milestone: ${item.string1 ?? ""}`
		: item.fieldNameUI.replace(/^profile\./v, "");
};

const profileOf = (items: ProfileItemVo[]): ArchiveProfile => {
	const first = (field: string): ProfileItemVo | undefined =>
		items.find((item) => item.fieldNameUI === field);
	return {
		blurb: textOf(first(BLURB)?.string1),
		about: textOf(first(ABOUT)?.textData1),
		milestones: items
			.filter((item) => item.fieldNameUI === MILESTONE)
			.map(milestoneOf),
		isPublic: items.some(isPublicItem),
		publicFields: items.filter(isPublicItem).map(labelOf),
	};
};

export const readArchiveProfile = async (
	client: PermanentClient,
	archive: ArchiveSummary,
): Promise<ArchiveProfile> => profileOf(await readItems(client, archive));

const assertCanEditProfile = (archive: ArchiveSummary): void => {
	if (!PROFILE_EDITING_ROLES.has(archive.role ?? "")) {
		throw new Error(
			`Editing the profile needs the owner or manager role in "${archive.name}"; the member is ${archive.role ?? "not a member"}.`,
		);
	}
};

interface PlannedItem {
	label: string;
	existing: ProfileItemVo | undefined;
	fields: Record<string, string>;
	fieldNameUI: string;
	type: string;
}

const definedFields = (
	fields: Record<string, string | undefined>,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(fields).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

const needsSaving = ({ existing, fields }: PlannedItem): boolean =>
	existing === undefined ||
	Object.entries(fields).some(
		([name, value]) => (existing[name] ?? "") !== value,
	);

const plannedItems = (
	items: ProfileItemVo[],
	changes: ProfileChanges,
): PlannedItem[] => {
	const first = (field: string): ProfileItemVo | undefined =>
		items.find((item) => item.fieldNameUI === field);
	return [
		...(changes.blurb === undefined
			? []
			: [
					{
						label: "blurb",
						existing: first(BLURB),
						fields: { string1: changes.blurb },
						fieldNameUI: BLURB,
						type: "type.widget.string",
					},
				]),
		...(changes.about === undefined
			? []
			: [
					{
						label: "about",
						existing: first(ABOUT),
						fields: { textData1: changes.about },
						fieldNameUI: ABOUT,
						type: "type.widget.description",
					},
				]),
		...(changes.milestones ?? []).map((milestone) => ({
			label: `milestone: ${milestone.title}`,
			existing: items.find(
				(item) =>
					item.fieldNameUI === MILESTONE &&
					sameTitle(milestone.title, item.string1),
			),
			fields: definedFields({
				string1: milestone.title,
				day1: milestone.date,
				day2: milestone.endDate,
				string2: milestone.description,
			}),
			fieldNameUI: MILESTONE,
			type: "type.widget.locn",
		})),
	];
};

const voFor = (
	archive: ArchiveSummary,
	planned: PlannedItem,
): Record<string, unknown> =>
	planned.existing === undefined
		? {
				archiveId: archive.archiveId,
				fieldNameUI: planned.fieldNameUI,
				type: planned.type,
				...planned.fields,
			}
		: {
				profile_itemId: planned.existing.profile_itemId,
				archiveId: archive.archiveId,
				fieldNameUI: planned.fieldNameUI,
				...planned.fields,
			};

export const updateArchiveProfile = async (
	client: PermanentClient,
	archive: ArchiveSummary,
	changes: ProfileChanges,
): Promise<ProfileUpdate> => {
	assertCanEditProfile(archive);
	let toSave: PlannedItem[] = [];
	let planned: PlannedItem[] = [];
	await inArchive(client, archive, async () => {
		planned = plannedItems(await readItems(client, archive), changes);
		toSave = planned.filter(needsSaving);
		if (toSave.length > 0) {
			await client.legacy(
				"/profile_item/safeAddUpdate",
				toSave.map((item) => ({ Profile_itemVO: voFor(archive, item) })),
			);
		}
	});
	return {
		updated: toSave.map((item) => item.label),
		unchanged: planned
			.filter((item) => !toSave.includes(item))
			.map((item) => item.label),
	};
};
