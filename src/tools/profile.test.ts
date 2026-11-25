import { afterEach, describe, expect, it } from "vitest";
import { callTool, connectClient } from "../testing/client.ts";
import { FakeArchive } from "../testing/fake-archive.ts";
import { FakeProfile } from "../testing/fake-profile.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import type { TestPermanent } from "../testing/permanent.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

let permanent: TestPermanent | undefined = undefined;

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

const setUp = async (): Promise<{
	archive: FakeArchive;
	profile: FakeProfile;
	client: Client;
}> => {
	const test = await startTestPermanent();
	permanent = test;
	await test.signIn();
	const archive = new FakeArchive();
	archive.install(test.fake);
	const profile = new FakeProfile();
	profile.install(test.fake, archive);
	return { archive, profile, client: await connectClient(test) };
};

const LIFE = {
	archiveId: 7,
	blurb: "Teacher, gardener and grandmother of nine.",
	about: "Rosa grew up in Ponce and moved to Chicago in 1958.",
	milestones: [
		{ title: "Born in Ponce", date: "1934-05-02" },
		{
			title: "Taught at Lincoln Elementary",
			date: "1962-09-01",
			endDate: "1994-06-15",
			description: "Third grade, for 32 years.",
		},
	],
};

describe("archive profile", () => {
	it("reads an empty profile", async () => {
		const { client } = await setUp();

		const outcome = await callTool(client, "get_archive_profile", {
			archiveId: 7,
		});

		expect(outcome.json()).toEqual({
			milestones: [],
			isPublic: false,
			publicFields: [],
		});
	});

	it("writes the blurb, about text and milestones, privately", async () => {
		const { client, profile } = await setUp();

		const outcome = await callTool(client, "set_archive_profile", LIFE);

		expect(outcome.isError).toBe(false);
		expect(profile.items.every((item) => item.publicDT === undefined)).toBe(
			true,
		);
		const read = await callTool(client, "get_archive_profile", {
			archiveId: 7,
		});
		expect(read.json()).toEqual({
			blurb: LIFE.blurb,
			about: LIFE.about,
			milestones: LIFE.milestones,
			isPublic: false,
			publicFields: [],
		});
	});

	it("updates milestones by title, keeps others, and is safe to repeat", async () => {
		const { client, profile } = await setUp();
		profile.add({
			fieldNameUI: "profile.milestone",
			string1: "Married Luis",
			day1: "1956-08-11",
			publicDT: "2024-01-01T00:00:00",
		});
		await callTool(client, "set_archive_profile", LIFE);
		const { saves: savesAfterFirst } = profile;

		const again = await callTool(client, "set_archive_profile", {
			archiveId: 7,
			milestones: [{ title: "born in ponce", date: "1934-05-03" }],
		});
		const repeat = await callTool(client, "set_archive_profile", LIFE);

		expect(again.json()).toEqual({
			updated: ["milestone: born in ponce"],
			unchanged: [],
		});
		expect(profile.saves).toBe(savesAfterFirst + 2);
		expect(repeat.json()).toMatchObject({
			updated: ["milestone: Born in Ponce"],
		});
		const read = await callTool(client, "get_archive_profile", {
			archiveId: 7,
		});
		expect(read.json()).toMatchObject({
			isPublic: true,
			publicFields: ["milestone: Married Luis"],
			milestones: [
				{ title: "Married Luis" },
				{ title: "Born in Ponce", date: "1934-05-02" },
				{ title: "Taught at Lincoln Elementary" },
			],
		});
	});

	it("doesn't save when nothing changed", async () => {
		const { client, profile } = await setUp();
		await callTool(client, "set_archive_profile", LIFE);
		const { saves } = profile;

		const outcome = await callTool(client, "set_archive_profile", LIFE);

		expect(profile.saves).toBe(saves);
		expect(outcome.json()).toMatchObject({ updated: [] });
	});

	it("rejects a blurb over Permanent's limit and partial dates", async () => {
		const { client } = await setUp();

		const long = await callTool(client, "set_archive_profile", {
			archiveId: 7,
			blurb: "x".repeat(201),
		});
		const partial = await callTool(client, "set_archive_profile", {
			archiveId: 7,
			milestones: [{ title: "Moved to Chicago", date: "1958" }],
		});

		expect(long.isError).toBe(true);
		expect(partial.isError).toBe(true);
	});
});
