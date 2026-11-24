const TIFF_HEADER_SIZE = 8;
const TIFF_LITTLE_ENDIAN_HEADER = Buffer.from([
	0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
]);
const IFD_ENTRY_SIZE = 12;
const IFD_COUNT_SIZE = 2;
const IFD_NEXT_OFFSET_SIZE = 4;
const INLINE_VALUE_SIZE = 4;

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;

const MINUTES_PER_DEGREE = 60;
const RATIONAL_PRECISION = 10_000;

interface IfdEntry {
	tag: number;
	type: number;
	count: number;
	data: Buffer;
}

export interface JpegExif {
	dateTimeOriginal?: string;
	offsetTimeOriginal?: string;
	make?: string;
	model?: string;
	latitude?: number;
	longitude?: number;
}

const ascii = (tag: number, value: string): IfdEntry => {
	const data = Buffer.from(`${value}\0`, "latin1");
	return { tag, type: TYPE_ASCII, count: data.length, data };
};

const long = (tag: number, value: number): IfdEntry => {
	const data = Buffer.alloc(INLINE_VALUE_SIZE);
	data.writeUInt32LE(value);
	return { tag, type: TYPE_LONG, count: 1, data };
};

const degrees = (tag: number, value: number): IfdEntry => {
	const absolute = Math.abs(value);
	const whole = Math.floor(absolute);
	const minutes = (absolute - whole) * MINUTES_PER_DEGREE;
	const data = Buffer.alloc(24);
	data.writeUInt32LE(whole, 0);
	data.writeUInt32LE(1, 4);
	data.writeUInt32LE(Math.round(minutes * RATIONAL_PRECISION), 8);
	data.writeUInt32LE(RATIONAL_PRECISION, 12);
	data.writeUInt32LE(0, 16);
	data.writeUInt32LE(1, 20);
	return { tag, type: TYPE_RATIONAL, count: 3, data };
};

const ifdSize = (entries: IfdEntry[]): number =>
	IFD_COUNT_SIZE +
	entries.length * IFD_ENTRY_SIZE +
	IFD_NEXT_OFFSET_SIZE +
	entries
		.filter((entry) => entry.data.length > INLINE_VALUE_SIZE)
		.reduce((total, entry) => total + entry.data.length, 0);

const buildIfd = (entries: IfdEntry[], offset: number): Buffer => {
	const sorted = [...entries].sort((a, b) => a.tag - b.tag);
	const head = Buffer.alloc(
		IFD_COUNT_SIZE + sorted.length * IFD_ENTRY_SIZE + IFD_NEXT_OFFSET_SIZE,
	);
	head.writeUInt16LE(sorted.length, 0);
	const overflow: Buffer[] = [];
	let dataOffset = offset + head.length;
	sorted.forEach((entry, index) => {
		const position = IFD_COUNT_SIZE + index * IFD_ENTRY_SIZE;
		head.writeUInt16LE(entry.tag, position);
		head.writeUInt16LE(entry.type, position + 2);
		head.writeUInt32LE(entry.count, position + 4);
		if (entry.data.length <= INLINE_VALUE_SIZE) {
			entry.data.copy(head, position + 8);
		} else {
			head.writeUInt32LE(dataOffset, position + 8);
			overflow.push(entry.data);
			dataOffset += entry.data.length;
		}
	});
	return Buffer.concat([head, ...overflow]);
};

const optional = (entry: IfdEntry | undefined): IfdEntry[] =>
	entry === undefined ? [] : [entry];

const optionalAscii = (tag: number, value?: string): IfdEntry[] =>
	optional(value === undefined ? undefined : ascii(tag, value));

const exifEntriesFor = (exif: JpegExif): IfdEntry[] => [
	...optionalAscii(TAG_DATE_TIME_ORIGINAL, exif.dateTimeOriginal),
	...optionalAscii(TAG_OFFSET_TIME_ORIGINAL, exif.offsetTimeOriginal),
];

const gpsEntriesFor = ({ latitude, longitude }: JpegExif): IfdEntry[] =>
	latitude === undefined || longitude === undefined
		? []
		: [
				ascii(TAG_GPS_LATITUDE_REF, latitude < 0 ? "S" : "N"),
				degrees(TAG_GPS_LATITUDE, latitude),
				ascii(TAG_GPS_LONGITUDE_REF, longitude < 0 ? "W" : "E"),
				degrees(TAG_GPS_LONGITUDE, longitude),
			];

interface SubIfd {
	pointerTag: number;
	entries: IfdEntry[];
}

const buildTiff = (exif: JpegExif): Buffer => {
	const subIfds: SubIfd[] = [
		{ pointerTag: TAG_EXIF_IFD, entries: exifEntriesFor(exif) },
		{ pointerTag: TAG_GPS_IFD, entries: gpsEntriesFor(exif) },
	].filter((subIfd) => subIfd.entries.length > 0);
	const rootEntries = [
		...optionalAscii(TAG_MAKE, exif.make),
		...optionalAscii(TAG_MODEL, exif.model),
	];
	let offset =
		TIFF_HEADER_SIZE + ifdSize(rootEntries) + subIfds.length * IFD_ENTRY_SIZE;
	const subIfdBuffers = subIfds.map(({ pointerTag, entries }) => {
		rootEntries.push(long(pointerTag, offset));
		const buffer = buildIfd(entries, offset);
		offset += buffer.length;
		return buffer;
	});
	return Buffer.concat([
		TIFF_LITTLE_ENDIAN_HEADER,
		buildIfd(rootEntries, TIFF_HEADER_SIZE),
		...subIfdBuffers,
	]);
};

export const buildJpeg = (exif: JpegExif = {}): Buffer => {
	const payload = Buffer.concat([
		Buffer.from("Exif\0\0", "latin1"),
		buildTiff(exif),
	]);
	const length = Buffer.alloc(2);
	length.writeUInt16BE(payload.length + 2);
	return Buffer.concat([
		Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
		length,
		payload,
		Buffer.from([0xff, 0xd9]),
	]);
};
