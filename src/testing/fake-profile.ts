import { z } from "zod";
import { ARCHIVE } from "./fake-archive.ts";
import type { FakeArchive } from "./fake-archive.ts";
import type { FakePermanent, FakeReply } from "./fake-permanent.ts";

export type FakeProfileItem = Record<string, unknown> & {
	profile_itemId: number;
	fieldNameUI: string;
};

const legacyData = z.object({
	RequestVO: z.object({
		data: z.array(
			z.object({ Profile_itemVO: z.record(z.string(), z.unknown()) }),
		),
	}),
});

const legacyReply = (
	isSuccessful: boolean,
	data: unknown[],
	message: string,
): FakeReply => ({
	body: {
		isSuccessful,
		Results: [{ data, message: [message], status: isSuccessful }],
	},
});

export class FakeProfile {
	public items: FakeProfileItem[] = [];

	public saves = 0;

	private nextId = 1;

	public install(fake: FakePermanent, archive: FakeArchive): void {
		fake.routes.set("POST /api/profile_item/getAllByArchiveId", () =>
			this.items.length === 0
				? legacyReply(false, [], "error.profile_item.lookup")
				: legacyReply(
						true,
						this.items.map((item) => ({ Profile_itemVO: item })),
						"Profile Items have been retrieved.",
					),
		);
		fake.routes.set("POST /api/profile_item/safeAddUpdate", ({ body }) => {
			if (archive.currentArchiveNbr !== ARCHIVE.archiveNbr) {
				return legacyReply(false, [], "error.generic.no_archive");
			}
			this.saves += 1;
			const saved = legacyData
				.parse(body)
				.RequestVO.data.map(({ Profile_itemVO: vo }) => this.save(vo));
			return legacyReply(
				true,
				saved.map((item) => ({ Profile_itemVO: item })),
				"saved",
			);
		});
	}

	public add(
		item: Record<string, unknown> & { fieldNameUI: string },
	): FakeProfileItem {
		const added: FakeProfileItem = {
			...item,
			fieldNameUI: item.fieldNameUI,
			profile_itemId: this.nextId,
		};
		this.nextId += 1;
		this.items.push(added);
		return added;
	}

	private save(vo: Record<string, unknown>): FakeProfileItem {
		const existing = this.items.find(
			(item) => item.profile_itemId === vo.profile_itemId,
		);
		if (existing === undefined) {
			return this.add({ ...vo, fieldNameUI: String(vo.fieldNameUI) });
		}
		Object.assign(existing, vo);
		return existing;
	}
}
