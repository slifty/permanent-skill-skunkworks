const DATE =
	/^(?<year>\d{4})(?:-(?<month>\d{2})(?:-(?<day>\d{2}))?)?(?<qualifier>[?~%])?$/v;
const DATE_TIME =
	/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<zone>Z|[+\-](?<zoneHour>\d{2}):(?<zoneMinute>\d{2}))?$/v;
const OPEN_INTERVAL_ENDS = new Set(["", ".."]);
const INTERVAL_PARTS = 2;

const MAX_MONTH = 12;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MAX_ZONE_HOUR = 14;

const isCalendarDate = (year: number, month: number, day: number): boolean => {
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
};

const inRange = (value: string | undefined, max: number): boolean =>
	value === undefined || Number(value) <= max;

const isDate = (value: string): boolean => {
	const groups = DATE.exec(value)?.groups;
	if (groups === undefined) {
		return false;
	}
	const { year = "", month, day } = groups;
	if (month === undefined) {
		return true;
	}
	if (Number(month) < 1 || Number(month) > MAX_MONTH) {
		return false;
	}
	return (
		day === undefined ||
		isCalendarDate(Number(year), Number(month), Number(day))
	);
};

const isTimeOfDay = ({
	hour,
	minute,
	second,
	zoneHour,
	zoneMinute,
}: Partial<Record<string, string>>): boolean =>
	inRange(hour, MAX_HOUR) &&
	inRange(minute, MAX_MINUTE) &&
	inRange(second, MAX_MINUTE) &&
	inRange(zoneHour, MAX_ZONE_HOUR) &&
	inRange(zoneMinute, MAX_MINUTE);

export const isEdtfDateTime = (value: string): boolean => {
	const groups = DATE_TIME.exec(value)?.groups;
	if (groups === undefined) {
		return false;
	}
	const { year = "", month = "", day = "" } = groups;
	return (
		isCalendarDate(Number(year), Number(month), Number(day)) &&
		isTimeOfDay(groups)
	);
};

const isInstant = (value: string): boolean =>
	isDate(value) || isEdtfDateTime(value);

const isInOrder = (start: string, end: string): boolean => {
	if (OPEN_INTERVAL_ENDS.has(start) || OPEN_INTERVAL_ENDS.has(end)) {
		return true;
	}
	const from = start.replace(/[?~%]/gv, "");
	const to = end.replace(/[?~%]/gv, "");
	const shared = Math.min(from.length, to.length);
	return from.slice(0, shared) <= to.slice(0, shared);
};

const isInterval = (value: string): boolean => {
	const parts = value.split("/");
	if (parts.length !== INTERVAL_PARTS) {
		return false;
	}
	const [start = "", end = ""] = parts;
	const startOpen = OPEN_INTERVAL_ENDS.has(start);
	const endOpen = OPEN_INTERVAL_ENDS.has(end);
	return (
		!(startOpen && endOpen) &&
		(startOpen || isDate(start)) &&
		(endOpen || isDate(end)) &&
		isInOrder(start, end)
	);
};

export const isSupportedEdtf = (value: string): boolean =>
	value.includes("/") ? isInterval(value) : isInstant(value);

const QUALIFIERS = /[?~%]/gv;
const MONTH_LENGTH = 7;
const YEAR_LENGTH = 4;

export const edtfToDisplayDate = (value: string): string | undefined => {
	if (!isSupportedEdtf(value)) {
		return undefined;
	}
	const [start = "", end = ""] = value.split("/");
	const instant = (OPEN_INTERVAL_ENDS.has(start) ? end : start).replace(
		QUALIFIERS,
		"",
	);
	if (instant.includes("T")) {
		return instant;
	}
	if (instant.length === YEAR_LENGTH) {
		return `${instant}-01-01T00:00:00`;
	}
	if (instant.length === MONTH_LENGTH) {
		return `${instant}-01T00:00:00`;
	}
	return `${instant}T00:00:00`;
};

export const edtfToDisplayRange = (
	value: string,
): { start: string; end: string } | undefined => {
	const start = edtfToDisplayDate(value);
	if (start === undefined) {
		return undefined;
	}
	const [, endPart = ""] = value.split("/");
	const end = OPEN_INTERVAL_ENDS.has(endPart)
		? undefined
		: edtfToDisplayDate(endPart);
	return { start, end: end ?? start };
};
