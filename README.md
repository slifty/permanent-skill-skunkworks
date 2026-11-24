# Permanent plugin for Claude (prototype)

An internal prototype of a Claude plugin that helps a Permanent.org member
gather photos for an event, curate them into stories, and put them on
Permanent.

The research and plan live in [docs/](docs/solution-shape.md). To show
it to someone, follow the [demo script](docs/demo.md), which also explains
how to rehearse against a fake Permanent on your own computer.

## Install

You need [Node.js](https://nodejs.org/) 22 or later on your `PATH`. The
plugin's local MCP server runs with it.

### Claude Code

```
/plugin marketplace add slifty/permanent-skill-skunkworks
/plugin install permanent@permanent-skunkworks
```

The plugin asks which Permanent environment to use (`production`,
`staging`, `dev` or `local`). The default is `production`.

### Cowork

Add `slifty/permanent-skill-skunkworks` as a plugin marketplace in Cowork's
plugin settings, then install `permanent`. Cowork does not prompt for
settings, so it always uses the default environment.

## Signing in

When Claude first needs your archive, it opens a Permanent sign-in page in
your browser. The page is served by the plugin on your own computer, and
your password goes from there straight to Permanent; Claude never sees it.
The plugin keeps the resulting session token in its data folder, readable
only by your user account. Ask Claude to sign out of Permanent to remove it.

This is a stopgap for the prototype. See
[Interim auth](docs/solution-shape.md#interim-auth).

## Layout

```
.claude-plugin/marketplace.json     this repo is its own marketplace
plugins/permanent/                  the plugin Claude installs
  .claude-plugin/plugin.json        manifest, MCP server, user settings
  skills/                           curation and workflow skills
  server/index.js                   bundled MCP server (generated, committed)
src/                                MCP server source (TypeScript)
```

Claude installs a plugin by copying it, without running a build. That is
why the MCP server is bundled into one committed file.

## Develop

Development needs Node.js 22.6 or later.

```
npm ci
npm run build     # rebuild plugins/permanent/server/index.js
npm run lint
npm test
```

Commit the rebuilt bundle together with the source change. CI fails if
they drift apart.

To try local changes in Claude Code, run `claude --plugin-dir ./plugins/permanent`.
