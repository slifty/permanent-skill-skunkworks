import exifr from "exifr";
import { isEdtfDateTime } from "../dates/edtf.ts";

export interface PhotoMetadata {
	takenAt?: string;
	latitude?: number;
	longitude?: number;
	camera?: string;
	width?: number;
	height?: number;
}

type RawExif = Partial<Record<string, unknown>>;

const EXIF_DATE_PATTERN =
	/^(?<year>\d{4}):(?<month>\d{2}):(?<day>\d{2}) (?<time>\d{2}:\d{2}:\d{2})$/v;

const EXIF_FIELDS = [
	"DateTimeOriginal",
	"CreateDate",
	"OffsetTimeOriginal",
	"Make",
	"Model",
	"ExifImageWidth",
	"ExifImageHeight",
	"GPSLatitude",
	"GPSLatitudeRef",
	"GPSLongitude",
	"GPSLongitudeRef",
];

const asString = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const isRecord = (value: unknown): value is RawExif =>
	typeof value === "object" && value !== null;

export const exifDateToIso = (
	exifDate: string,
	offset?: string,
): string | undefined => {
	const groups = EXIF_DATE_PATTERN.exec(exifDate)?.groups;
	if (groups === undefined) {
		return undefined;
	}
	const { year, month, day, time } = groups;
	const withOffset = `${year}-${month}-${day}T${time}${offset ?? ""}`;
	if (isEdtfDateTime(withOffset)) {
		return withOffset;
	}
	const local = `${year}-${month}-${day}T${time}`;
	return isEdtfDateTime(local) ? local : undefined;
};

const describeCamera = (make?: string, model?: string): string | undefined => {
	if (make === undefined || model === undefined) {
		return model ?? make;
	}
	return model.startsWith(make) ? model : `${make} ${model}`;
};

const readTakenAt = (raw: RawExif): Pick<PhotoMetadata, "takenAt"> => {
	const exifDate = asString(raw.DateTimeOriginal) ?? asString(raw.CreateDate);
	const takenAt =
		exifDate === undefined
			? undefined
			: exifDateToIso(exifDate, asString(raw.OffsetTimeOriginal));
	return takenAt === undefined ? {} : { takenAt };
};

const readLocation = (
	raw: RawExif,
): Pick<PhotoMetadata, "latitude" | "longitude"> => {
	const latitude = asNumber(raw.latitude);
	const longitude = asNumber(raw.longitude);
	return latitude === undefined || longitude === undefined
		? {}
		: { latitude, longitude };
};

const readCamera = (raw: RawExif): Pick<PhotoMetadata, "camera"> => {
	const camera = describeCamera(asString(raw.Make), asString(raw.Model));
	return camera === undefined ? {} : { camera };
};

const readDimensions = (
	raw: RawExif,
): Pick<PhotoMetadata, "width" | "height"> => {
	const width = asNumber(raw.ExifImageWidth);
	const height = asNumber(raw.ExifImageHeight);
	return width === undefined || height === undefined ? {} : { width, height };
};

const parseExif = async (contents: Buffer): Promise<unknown> =>
	await exifr
		.parse(contents, { pick: EXIF_FIELDS, gps: true, reviveValues: false })
		.catch(() => undefined);

export const readPhotoMetadata = async (
	contents: Buffer,
): Promise<PhotoMetadata> => {
	const raw = await parseExif(contents);
	if (!isRecord(raw)) {
		return {};
	}
	return {
		...readTakenAt(raw),
		...readLocation(raw),
		...readCamera(raw),
		...readDimensions(raw),
	};
};
