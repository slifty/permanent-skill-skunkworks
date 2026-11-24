export const mapWithConcurrency = async <Input, Output>(
	inputs: readonly Input[],
	limit: number,
	transform: (input: Input) => Promise<Output>,
): Promise<Output[]> => {
	const results = new Array<Output>(inputs.length);
	const pending = inputs.entries();
	const work = async (): Promise<void> => {
		const next = pending.next();
		if (next.done === true) {
			return;
		}
		const {
			value: [index, input],
		} = next;
		results[index] = await transform(input);
		await work();
	};
	const workerCount = Math.min(limit, inputs.length);
	await Promise.all(Array.from({ length: workerCount }, work));
	return results;
};

export const runInOrder = async <Input>(
	inputs: readonly Input[],
	step: (input: Input) => Promise<boolean>,
): Promise<boolean> =>
	await inputs.reduce<Promise<boolean>>(
		async (previous, input) => (await previous) && (await step(input)),
		Promise.resolve(true),
	);
