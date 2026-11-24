export const must = <Value>(
	value: Value | undefined,
	what = "value",
): Value => {
	if (value === undefined) {
		throw new Error(`Expected a ${what}`);
	}
	return value;
};
