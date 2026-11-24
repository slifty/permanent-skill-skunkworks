import { spawn } from "node:child_process";

const openCommand = (url: string): [string, string[]] => {
	switch (process.platform) {
		case "darwin":
			return ["open", [url]];
		case "win32":
			return ["cmd", ["/c", "start", '""', url]];
		default:
			return ["xdg-open", [url]];
	}
};

export const openInBrowser = (url: string): void => {
	const [command, args] = openCommand(url);
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => undefined);
	child.unref();
};
