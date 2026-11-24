import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildJpeg } from "../testing/jpeg.ts";
import { Canvas } from "./canvas.ts";

const WIDTH = 800;
const HEIGHT = 600;
const GROUND = 520;
const SKY: [number, number, number] = [135, 190, 235];
const LAWN: [number, number, number] = [90, 160, 80];
const ROOM: [number, number, number] = [230, 215, 190];
const NIGHT: [number, number, number] = [30, 25, 50];
const AUSTIN = { latitude: 30.2672, longitude: -97.7431 };

interface Scene {
	file: string;
	takenAt: string;
	draw: () => Canvas;
}

const outdoors = (): Canvas =>
	new Canvas(WIDTH, HEIGHT, SKY)
		.rect({ x: 0, y: 420, width: WIDTH, height: 180 }, LAWN)
		.rect({ x: 420, y: 220, width: 300, height: 200 }, [150, 100, 70])
		.triangle({ left: 400, right: 740, base: 220, apex: 120 }, [170, 50, 50])
		.rect({ x: 540, y: 320, width: 60, height: 100 }, [90, 60, 40]);

const table = (): Canvas =>
	new Canvas(WIDTH, HEIGHT, ROOM).rect(
		{ x: 80, y: 380, width: 640, height: 40 },
		[120, 80, 50],
	);

const cake = (lit: boolean): Canvas => {
	const canvas = new Canvas(WIDTH, HEIGHT, ROOM)
		.rect({ x: 80, y: 420, width: 640, height: 40 }, [120, 80, 50])
		.rect({ x: 250, y: 300, width: 300, height: 120 }, [240, 230, 240])
		.rect({ x: 250, y: 290, width: 300, height: 20 }, [230, 120, 170]);
	for (let candle = 0; candle < 9; candle += 1) {
		const x = 275 + candle * 31;
		canvas.rect({ x, y: 250, width: 8, height: 40 }, [80, 140, 220]);
		canvas.circle(
			x + 4,
			240,
			lit ? 7 : 3,
			lit ? [255, 200, 40] : [150, 150, 150],
		);
	}
	return canvas;
};

const SCENES: Scene[] = [
	{
		file: "IMG_2041.jpg",
		takenAt: "2024:06:01 14:02:11",
		draw: () =>
			outdoors()
				.person(200, GROUND, [200, 60, 60])
				.person(290, GROUND, [60, 90, 200]),
	},
	{
		file: "IMG_2042.jpg",
		takenAt: "2024:06:01 14:05:40",
		draw: () =>
			outdoors()
				.person(330, GROUND, [220, 180, 220])
				.person(380, GROUND, [60, 90, 200])
				.person(430, GROUND, [200, 60, 60]),
	},
	{
		file: "IMG_2043.jpg",
		takenAt: "2024:06:01 14:05:41",
		draw: () =>
			outdoors()
				.person(332, GROUND, [220, 180, 220])
				.person(382, GROUND, [60, 90, 200])
				.person(432, GROUND, [200, 60, 60]),
	},
	{
		file: "IMG_2077.jpg",
		takenAt: "2024:06:01 18:31:02",
		draw: () => {
			const canvas = table();
			for (let seat = 0; seat < 6; seat += 1) {
				canvas.person(140 + seat * 105, 380, [
					60 + seat * 30,
					100,
					180 - seat * 20,
				]);
				canvas.circle(140 + seat * 105, 395, 16, [250, 250, 250]);
			}
			return canvas;
		},
	},
	{
		file: "IMG_2081.jpg",
		takenAt: "2024:06:01 18:47:30",
		draw: () =>
			table()
				.person(400, 380, [220, 180, 220])
				.rect({ x: 440, y: 230, width: 14, height: 40 }, [255, 220, 120])
				.rect({ x: 250, y: 240, width: 14, height: 40 }, [255, 220, 120])
				.rect({ x: 560, y: 235, width: 14, height: 40 }, [255, 220, 120]),
	},
	{
		file: "IMG_2101.jpg",
		takenAt: "2024:06:01 20:10:05",
		draw: () => cake(true),
	},
	{
		file: "IMG_2102.jpg",
		takenAt: "2024:06:01 20:10:19",
		draw: () => cake(true).person(400, 600, [220, 180, 220]),
	},
	{
		file: "IMG_2104.jpg",
		takenAt: "2024:06:01 20:11:02",
		draw: () => cake(false),
	},
	{
		file: "IMG_2133.jpg",
		takenAt: "2024:06:01 21:32:44",
		draw: () => {
			const canvas = new Canvas(WIDTH, HEIGHT, NIGHT);
			const lights: Array<[number, number, number]> = [
				[255, 80, 80],
				[80, 255, 120],
				[90, 140, 255],
				[255, 220, 60],
			];
			for (let bulb = 0; bulb < 16; bulb += 1) {
				canvas.circle(
					30 + bulb * 50,
					60 + (bulb % 2) * 20,
					9,
					lights[bulb % 4] ?? [255, 255, 255],
				);
			}
			return canvas
				.person(250, GROUND, [220, 180, 220])
				.person(400, GROUND, [60, 90, 200])
				.person(550, GROUND, [200, 60, 60]);
		},
	},
];

const withExif = (image: Buffer, takenAt: string): Buffer => {
	const exif = buildJpeg({
		dateTimeOriginal: takenAt,
		offsetTimeOriginal: "-05:00",
		make: "Apple",
		model: "iPhone 15",
		...AUSTIN,
	});
	const app1 = exif.subarray(2, exif.length - 2);
	return Buffer.concat([image.subarray(0, 2), app1, image.subarray(2)]);
};

const main = async (): Promise<void> => {
	const directory = resolve(process.argv[2] ?? "sample-photos");
	await mkdir(directory, { recursive: true });
	await Promise.all(
		SCENES.map(async (scene) => {
			await writeFile(
				join(directory, scene.file),
				withExif(scene.draw().toJpeg(), scene.takenAt),
			);
		}),
	);
	await copyFile(
		join(directory, "IMG_2101.jpg"),
		join(directory, "IMG_2101 copy.jpg"),
	);
	process.stdout.write(
		`Wrote ${SCENES.length + 1} sample photos to ${directory}\n`,
	);
};

await main();
