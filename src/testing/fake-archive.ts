import { z } from "zod";
import type {
	FakePermanent,
	FakeReply,
	FakeRequest,
} from "./fake-permanent.ts";

export interface FakeFolder {
	folderId: number;
	archiveNbr: string;
	folder_linkId: number;
	parentFolderId: number | undefined;
	displayName: string;
	type: string;
	description: string | null;
	sort: string;
	thumbArchiveNbr: string | null;
}

export interface FakeRecord {
	recordId: number;
	archiveNbr: string;
	parentFolderId: number;
	displayName: string;
	uploadFileName: string;
	description: string | null;
	displayTime: string | null;
	displayDT: string;
	altText: string | null;
	note: string | null;
	location: unknown;
	tags: string[];
	status: string;
	bytes: number;
}

export const ARCHIVE = {
	archiveId: 7,
	archiveNbr: "0a1b-0000",
	fullName: "The Ortiz Family",
	accessRole: "access.role.owner",
	type: "type.archive.family",
	status: "status.generic.ok",
};

export const MY_FILES_ID = 3;
export const PUBLIC_ID = 4;

const legacyData = z.object({
	RequestVO: z.object({
		data: z.array(z.record(z.string(), z.record(z.string(), z.unknown()))),
	}),
});

const ok = (body: unknown): FakeReply => ({ body });

const legacyOk = (): FakeReply =>
	ok({
		isSuccessful: true,
		Results: [{ data: [], message: ["ok"], status: true }],
	});

const legacyFail = (message: string): FakeReply =>
	ok({
		isSuccessful: false,
		Results: [{ data: null, message: [message], status: false }],
	});

export interface FakeShareLink {
	id: string;
	folderId: number;
	token: string;
	accessRestrictions: string;
}

export class FakeArchive {
	public readonly shareLinks: FakeShareLink[] = [];
	public copyDelayPolls = 0;
	public readonly folders = new Map<number, FakeFolder>();
	public readonly records = new Map<number, FakeRecord>();
	public readonly pendingUploads = new Map<string, number>();
	public currentArchiveNbr: string | undefined = undefined;
	private pendingCopies: Array<{ polls: number; finish: () => void }> = [];

	public get queuedCopies(): number {
		return this.pendingCopies.length;
	}
	private nextId = 100;

	public constructor() {
		this.addFolder({
			folderId: 1,
			displayName: "Archive Root",
			type: "type.folder.root.root",
		});
		this.addFolder({
			folderId: MY_FILES_ID,
			parentFolderId: 1,
			displayName: "My Files",
			type: "type.folder.root.private",
		});
		this.addFolder({
			folderId: PUBLIC_ID,
			parentFolderId: 1,
			displayName: "Public",
			type: "type.folder.root.public",
		});
	}

	public folderNamed(name: string): FakeFolder | undefined {
		return [...this.folders.values()].find(
			(folder) => folder.displayName === name,
		);
	}

	public resetDisplayDate(recordId: number, displayDT: string): void {
		const record = this.records.get(recordId);
		if (record !== undefined) {
			record.displayDT = displayDT;
		}
	}

	public recordsIn(folderId: number): FakeRecord[] {
		return [...this.records.values()].filter(
			(record) => record.parentFolderId === folderId,
		);
	}

	public install(fake: FakePermanent): void {
		const { routes } = fake;
		routes.set("GET /api/archive/getAllArchives", () => ok([ARCHIVE]));
		routes.set("GET /api/folder/getRoot", () => ok(this.folderVo(1)));
		routes.set("GET /api/folder/getWithChildren", ({ query }) => {
			this.settleCopies();
			return ok(this.folderVo(Number(query.get("folderId"))));
		});
		routes.set("POST /api/folder/post", ({ body }) => this.createFolder(body));
		routes.set("POST /api/record/getPresignedUrl", () => {
			const key = `upload-${this.allocate()}`;
			return ok({
				destinationUrl: `s3://bucket/${key}`,
				presignedPost: { url: `${fake.apiUrl}/s3`, fields: { key } },
			});
		});
		routes.set("POST /api/s3", ({ raw }) => {
			const key =
				/name="key"\r\n\r\n(?<key>[^\r]+)/v.exec(raw.toString("latin1"))?.groups
					?.key ?? "";
			this.pendingUploads.set(`s3://bucket/${key}`, raw.length);
			return { status: 204, body: "" };
		});
		routes.set("POST /api/record/registerRecord", ({ body }) =>
			this.register(body),
		);
		routes.set("GET /api/record/get", ({ query }) =>
			this.recordVo(Number(query.get("recordId"))),
		);
		routes.set("POST /api/record/update", ({ body }) =>
			this.updateRecord(body),
		);
		routes.set("PATCH /api/v2/records/*", (request) =>
			this.patchRecord(request),
		);
		routes.set("GET /api/v2/records", ({ query }) => {
			if (query.get("pageSize") === null) {
				return { status: 400, body: { error: '"pageSize" is required' } };
			}
			if (query.getAll("recordIds[]").length > 20) {
				return { status: 400, body: { error: '"recordIds" must be an array' } };
			}
			return ok({
				items: query.getAll("recordIds[]").map((recordId) => {
					const record = this.records.get(Number(recordId));
					return {
						recordId,
						displayName: record?.displayName,
						status: record?.status ?? "status.generic.error",
					};
				}),
				pagination: { totalPages: 1 },
			});
		});
		routes.set("POST /api/archive/change", ({ body }) => {
			const {
				RequestVO: {
					data: [entry],
				},
			} = legacyData.parse(body);
			this.currentArchiveNbr = z
				.string()
				.optional()
				.parse(entry?.ArchiveVO?.archiveNbr);
			return legacyOk();
		});
		routes.set("POST /api/tag/post", ({ body }) =>
			this.legacyInArchive(() => this.tag(body)),
		);
		routes.set("POST /api/folder/update", ({ body }) =>
			this.legacyInArchive(() => this.updateFolder(body)),
		);
		routes.set("POST /api/folder/sort", ({ body }) =>
			this.legacyInArchive(() => this.sortFolder(body)),
		);
		routes.set("GET /api/v2/folders/*", ({ path }) => {
			const folderId = Number(path.split("/").at(-2));
			return ok({
				items: this.shareLinks.filter((link) => link.folderId === folderId),
			});
		});
		routes.set("POST /api/v2/share-links", ({ body }) => {
			const request = z
				.object({
					itemId: z.string(),
					itemType: z.literal("folder"),
					accessRestrictions: z.enum(["none", "account"]),
				})
				.parse(body);
			const link: FakeShareLink = {
				id: String(this.allocate()),
				folderId: Number(request.itemId),
				token: `token-${this.shareLinks.length + 1}`,
				accessRestrictions: request.accessRestrictions,
			};
			this.shareLinks.push(link);
			return { status: 201, body: { data: link } };
		});
		routes.set("POST /api/folder/copy", ({ body }) =>
			this.legacyInArchive(() => this.copyFolder(body)),
		);
	}

	private allocate(): number {
		this.nextId += 1;
		return this.nextId;
	}

	private addFolder(
		folder: Partial<FakeFolder> &
			Pick<FakeFolder, "folderId" | "displayName" | "type">,
	): FakeFolder {
		const complete: FakeFolder = {
			archiveNbr: `0a1b-f${folder.folderId}`,
			folder_linkId: folder.folderId + 1000,
			parentFolderId: undefined,
			description: null,
			sort: "sort.alphabetical_asc",
			thumbArchiveNbr: null,
			...folder,
		};
		this.folders.set(complete.folderId, complete);
		return complete;
	}

	private folderVo(folderId: number): object {
		const folder = this.folders.get(folderId);
		if (folder === undefined) {
			throw new Error(`no folder ${folderId}`);
		}
		const children = [
			...[...this.folders.values()]
				.filter((child) => child.parentFolderId === folderId)
				.map((child) => ({ ...child, ChildItemVOs: [] })),
			...this.recordsIn(folderId)
				.flatMap((record) =>
					Array.from({ length: Math.max(1, record.tags.length) }, () => record),
				)
				.map((record) => ({
					recordId: record.recordId,
					archiveNbr: record.archiveNbr,
					displayName: record.displayName,
					uploadFileName: record.uploadFileName,
					description: record.description,
					displayDT: record.displayDT,
					type: "type.record.image",
					status: record.status,
				})),
		];
		return { ...folder, ChildItemVOs: children };
	}

	private createFolder(body: unknown): FakeReply {
		const { displayName, parentFolderId } = z
			.object({ displayName: z.string(), parentFolderId: z.number() })
			.parse(body);
		const parent = this.folders.get(parentFolderId);
		const type =
			parent?.type.includes("public") === true
				? "type.folder.public"
				: "type.folder.private";
		return ok(
			this.addFolder({
				folderId: this.allocate(),
				parentFolderId,
				displayName,
				type,
			}),
		);
	}

	private register(body: unknown): FakeReply {
		const request = z
			.object({
				uploadFileName: z.string(),
				parentFolderId: z.number(),
				s3url: z.string(),
			})
			.parse(body);
		const bytes = this.pendingUploads.get(request.s3url);
		if (bytes === undefined) {
			return { status: 400, body: { error: "nothing uploaded" } };
		}
		if (
			this.recordsIn(request.parentFolderId).some(
				(record) => record.uploadFileName === request.uploadFileName,
			)
		) {
			return {
				status: 400,
				body: {
					error: "An item with this name already exists in this location",
				},
			};
		}
		const recordId = this.allocate();
		const record: FakeRecord = {
			recordId,
			archiveNbr: `0a1b-${recordId}`,
			parentFolderId: request.parentFolderId,
			displayName: request.uploadFileName.replace(/\.\w+$/v, ""),
			uploadFileName: request.uploadFileName,
			description: null,
			displayTime: null,
			displayDT: "2026-11-25T12:00:00",
			altText: null,
			note: "keep me",
			location: null,
			tags: [],
			status: "status.generic.ok",
			bytes,
		};
		this.records.set(recordId, record);
		return ok({ ...record, type: "type.record.image" });
	}

	private recordVo(recordId: number): FakeReply {
		const record = this.records.get(recordId);
		if (record === undefined) {
			return { status: 404, body: {} };
		}
		return ok({
			recordId,
			displayName: record.displayName,
			description: record.description,
			displayDT: record.displayDT,
			displayEndDT: null,
			publicDT: null,
			note: record.note,
			altText: record.altText,
			locnId: null,
		});
	}

	private updateRecord(body: unknown): FakeReply {
		const update = z
			.looseObject({
				recordId: z.number(),
				displayName: z.string().nullish(),
				description: z.string().nullish(),
				note: z.string().nullish(),
				altText: z.string().nullish(),
				displayDt: z.string().nullish(),
			})
			.parse(body);
		const record = this.records.get(update.recordId);
		if (record === undefined) {
			return { status: 404, body: {} };
		}
		record.displayName = update.displayName ?? "";
		record.description = update.description ?? null;
		record.note = update.note ?? null;
		record.altText = update.altText ?? null;
		record.displayDT = update.displayDt ?? record.displayDT;
		return ok({});
	}

	private patchRecord({ path, body }: FakeRequest): FakeReply {
		const record = this.records.get(Number(path.split("/").pop()));
		if (record === undefined) {
			return { status: 404, body: {} };
		}
		const patch = z
			.object({
				displayName: z.string().optional(),
				description: z.string().optional(),
				displayTime: z.string().optional(),
				location: z.unknown().optional(),
			})
			.strict()
			.parse(body);
		record.displayName = patch.displayName ?? record.displayName;
		record.description = patch.description ?? record.description;
		record.displayTime = patch.displayTime ?? record.displayTime;
		record.location = patch.location ?? record.location;
		return ok({ data: { recordId: String(record.recordId) } });
	}

	private legacyInArchive(work: () => FakeReply): FakeReply {
		return this.currentArchiveNbr === ARCHIVE.archiveNbr
			? work()
			: legacyFail("error.generic.no_archive");
	}

	private tag(body: unknown): FakeReply {
		for (const entry of legacyData.parse(body).RequestVO.data) {
			const record = this.records.get(Number(entry.TagLinkVO?.refId));
			record?.tags.push(String(entry.TagVO?.name));
		}
		return legacyOk();
	}

	private updateFolder(body: unknown): FakeReply {
		const {
			RequestVO: { data: entries },
		} = legacyData.parse(body);
		if (entries.some((entry) => typeof entry.FolderVO?.folderId !== "number")) {
			return legacyFail(
				"Cannot update a VO without the primary key (folderId)",
			);
		}
		for (const entry of entries) {
			const folder = [...this.folders.values()].find(
				(candidate) =>
					candidate.folder_linkId === entry.FolderVO?.folder_linkId,
			);
			if (folder !== undefined) {
				const { displayName, description, thumbArchiveNbr } = z
					.object({
						displayName: z.string().optional(),
						description: z.string().optional(),
						thumbArchiveNbr: z.string().optional(),
					})
					.parse(entry.FolderVO);
				folder.displayName = displayName ?? folder.displayName;
				folder.description = description ?? folder.description;
				folder.thumbArchiveNbr = thumbArchiveNbr ?? folder.thumbArchiveNbr;
			}
		}
		return legacyOk();
	}

	private copyFolder(body: unknown): FakeReply {
		const {
			RequestVO: {
				data: [entry],
			},
		} = legacyData.parse(body);
		const source = this.folders.get(Number(entry?.FolderVO?.folderId));
		const destination = [...this.folders.values()].find(
			(folder) => folder.folder_linkId === entry?.FolderDestVO?.folder_linkId,
		);
		if (source === undefined || destination === undefined) {
			return legacyFail("error.folder.not_found");
		}
		const finishCopy = (): void => {
			const folderId = this.allocate();
			this.addFolder({
				...source,
				folderId,
				archiveNbr: `0a1b-f${folderId}`,
				folder_linkId: folderId + 1000,
				parentFolderId: destination.folderId,
				type: "type.folder.public",
			});
		};
		this.pendingCopies.push({ polls: this.copyDelayPolls, finish: finishCopy });
		this.settleCopies();
		return legacyOk();
	}

	private settleCopies(): void {
		const ready = this.pendingCopies.filter((copy) => copy.polls === 0);
		this.pendingCopies = this.pendingCopies
			.filter((copy) => copy.polls > 0)
			.map((copy) => ({ ...copy, polls: copy.polls - 1 }));
		ready.forEach((copy) => {
			copy.finish();
		});
	}

	private sortFolder(body: unknown): FakeReply {
		for (const entry of legacyData.parse(body).RequestVO.data) {
			const folder = [...this.folders.values()].find(
				(candidate) =>
					candidate.folder_linkId === entry.FolderVO?.folder_linkId,
			);
			if (folder !== undefined) {
				folder.sort = String(entry.FolderVO?.sort);
			}
		}
		return legacyOk();
	}
}
