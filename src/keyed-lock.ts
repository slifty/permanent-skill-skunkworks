export class KeyedLock {
	private readonly tails = new Map<string, Promise<unknown>>();

	public async run<Result>(
		key: string,
		work: () => Promise<Result>,
	): Promise<Result> {
		const previous = this.tails.get(key) ?? Promise.resolve();
		const result = previous.then(work);
		const settled = result.catch(() => undefined);
		this.tails.set(key, settled);
		void settled.then(() => {
			if (this.tails.get(key) === settled) {
				this.tails.delete(key);
			}
		});
		return await result;
	}
}
