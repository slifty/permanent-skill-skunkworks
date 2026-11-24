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
		(endOpen || isDate(end))
	);
};

export const isSupportedEdtf = (value: string): boolean =>
	value.includes("/") ? isInterval(value) : isInstant(value);
