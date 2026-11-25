const escapeHtml = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --bg: #f6f5f2; --card: #ffffff; --text: #1d1d1f; --muted: #5f5f66; --accent: #131b4a; --accent-text: #ffffff; --border: #d6d4cf; --error: #a4161a; --warning-bg: #fff4d6; --warning-border: #e0b84a; }
@media (prefers-color-scheme: dark) { :root { --bg: #15161a; --card: #202127; --text: #f2f2f4; --muted: #a8a8b3; --accent: #c9cff5; --accent-text: #131b4a; --border: #3a3b44; --error: #ff8a8f; --warning-bg: #3a3014; --warning-border: #8a6d1e; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 32px 24px; }
h1 { font-size: 1.4rem; margin: 0 0 8px; }
p { color: var(--muted); margin: 0 0 20px; }
label { display: block; font-weight: 600; margin: 16px 0 6px; }
input { width: 100%; padding: 10px 12px; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
button { margin-top: 24px; width: 100%; padding: 12px; font: inherit; font-weight: 600; color: var(--accent-text); background: var(--accent); border: 0; border-radius: 8px; cursor: pointer; }
.error { color: var(--error); font-weight: 600; }
.warning { color: var(--text); background: var(--warning-bg); border: 1px solid var(--warning-border); border-radius: 8px; padding: 10px 12px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;

const errorLine = (error?: string): string =>
	error === undefined
		? ""
		: `<p class="error" role="alert">${escapeHtml(error)}</p>`;

export const credentialsPage = (
	environment: string,
	action: string,
	error?: string,
): string =>
	page(
		"Sign in to Permanent",
		`<h1>Sign in to Permanent</h1>
<p>Claude is asking to work in your Permanent archive. Your password goes straight to Permanent; Claude never sees it.</p>
${
	environment === "production"
		? ""
		: `<p class="warning" role="note">This is Permanent's <strong>${escapeHtml(environment)}</strong> test environment, not the live permanent.org. Use the account you have there.</p>`
}
${errorLine(error)}
<form method="post" action="${escapeHtml(action)}">
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button>
</form>`,
	);

export const mfaPage = (action: string, error?: string): string =>
	page(
		"Verify it's you",
		`<h1>Verify it's you</h1>
<p>Permanent sent you a verification code. Enter it to finish signing in.</p>
${errorLine(error)}
<form method="post" action="${escapeHtml(action)}">
<label for="code">Verification code</label>
<input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus>
<button type="submit">Verify</button>
</form>`,
	);

export const donePage = (email: string): string =>
	page(
		"Signed in",
		`<h1>You're signed in</h1>
<p>Signed in as ${escapeHtml(email)}. You can close this tab and go back to Claude.</p>`,
	);

export const expiredPage = (): string =>
	page(
		"Link expired",
		`<h1>This sign-in link has expired</h1>
<p>Go back to Claude and ask it to sign in to Permanent again.</p>`,
	);
