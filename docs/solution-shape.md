# Solution shape: a Permanent plugin for Claude

The recommended architecture, what to build in what order, and the decisions
made so far. It is based on
[agentic-opportunities.md](research/agentic-opportunities.md).

**Current goal: an internal MVP / prototype.**

## Recommendation

Build **one Claude plugin, `permanent`**, in this repository. The repository
also serves as its own plugin marketplace. The plugin bundles two parts:

1. **Skills**, the know-how:
   - how to curate event photos into stories
   - how Permanent's concepts map onto that (event folder, story folders,
     share links, Public)
   - when to stop and confirm with the member
2. **A local Permanent MCP server**, the actions: browse, create folders,
   upload, set metadata, share and optionally publish. Each tool is narrow,
   and read and write tools are kept separate.

### Plugin or MCP?

Both: a plugin is the package, and an MCP server is one of the things it
carries.

- Skills alone can't reliably reach Permanent's API from claude.ai, because
  the sandbox has limited network access.
- An MCP server alone gives Claude actions but no judgement about curation.

### Target surfaces

- **Cowork and Claude Code.** These are the only surfaces that can read a
  member's local photo folders and run a bundled local MCP server.
- **claude.ai chat is out of scope for the MVP.** Reaching it would need a
  Permanent-hosted remote connector.

## Decisions

| Question                                                | Decision                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the story need to be public?                       | **No.** The goal is to use Permanent's own views to present the story. Publishing to Public is optional; a share link or the member's own archive view is enough. |
| Auth                                                    | Use the interim web-app-style login, behind a swappable auth module. FusionAuth configuration work is decoupled from this project and comes later.                |
| Do the `storyscroll` / `slideshow` folder views render? | **No, not anywhere today** (see below). The MVP uses List, Grid and Timeline.                                                                                     |
| Where does the plugin live?                             | This repository for now. It moves to a PermanentOrg home later.                                                                                                   |
| Public Claude directory listing?                        | Not yet. Install from this repo's marketplace internally. List it publicly eventually.                                                                            |

### Story views

The story views exist only as leftover constants:

- The web app's view enum has only List, Grid and Timeline
  (`web-app/src/app/shared/services/folder-view/folder-view.enum.ts`).
- Any other stored view falls back to List
  (`web-app/src/app/shared/services/folder-view/folder-view.service.ts:20-29`).
- The story view names appear only as translation strings in
  `web-app/constants/master_en.json`, which came from the original import
  of the legacy files repo. They also appear in the back-end and stela
  constants.
- Nothing in the current code renders them.

Reviving one would be web-app work, so it is not part of the MVP.

## How an event becomes a story on Permanent

```
Private / <Event name>                 ← source of truth; full upload
  ├── <Story 1>   description = narrative, cover = chosen photo,
  │               sort = display date, item dates set to order the story
  ├── <Story 2>
  └── …
→ share link to the event folder       ← default way to show it
→ (optional) copy into Public          ← only if the member wants it public
```

**Timeline view is limited to Public.** The web app offers its Views panel
only for non-root folders in Public. A private story renders as List or
Grid. If the timeline presentation matters for the demo, publishing (or
building the story in Public) is the way to get it. _Unverified:_ whether
the share-link view honours a folder's saved view.

1. **Gather.** Claude reads the folders the member points at.
2. **Curate.** Claude drops duplicates and poor shots, groups photos into
   stories, and drafts titles, descriptions, alt text and dates.
3. **Review.** Claude writes a manifest the member can read and edit. **This
   is the main confirmation point.**
4. **Upload.** Claude creates the folders, uploads the photos, sets their
   metadata, and waits for processing.
5. **Present.** Claude sets each story folder's description, cover and
   sort order.
6. **Share.** Claude returns a link the member can open or share. Copying
   the event into Public happens only on a second explicit confirmation.

## MVP phases

| Phase                  | Goal                        | Ships                                                                                                                                                           |
| ---------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Scaffold**        | Installable plugin          | `plugin.json`, `marketplace.json`, skill and MCP server skeletons                                                                                               |
| **1. Curation skill**  | Gather → curate → manifest  | Works with no Permanent API                                                                                                                                     |
| **2. Interim auth**    | Sign in from the MCP server | Web-app-style login behind a swappable auth module (see below)                                                                                                  |
| **3. MCP server v0**   | The actions                 | Browse, folders, upload + wait, metadata, folder presentation, share link, optional publish. Built on `@permanentorg/sdk`, with direct calls where it has gaps. |
| **4. End-to-end demo** | The ask, start to finish    | Demo script and a test archive on dev or staging                                                                                                                |

**After the MVP:**

- proper agent auth (FusionAuth PKCE client and the stela allow-list)
- upstreaming the SDK gaps into `@permanentorg/sdk`
- a remote connector for claude.ai chat
- a public directory listing
- product asks: story views, manual order, cover picker

## Interim auth

The MCP server signs in the same way the web app does. It needs no secret
and no new FusionAuth client.

1. On first use, the MCP server opens a page on a local (loopback) address
   in the member's browser. The member types their email and password
   there, so the password never enters the conversation or the model's
   context.
2. The server calls back-end `POST /api/auth/login`. FusionAuth checks the
   password and returns an access token as `authToken`. The web app sends
   that same token to stela as a bearer token, so one token works on both
   APIs.
3. If the account has MFA, the server calls `/api/auth/verify`. The pending
   MFA state lives in the PHP session, so the server keeps cookies between
   the login and verify calls.
4. The server stores the token in the plugin's data folder, in a file only
   the member's user account can read (`0600`). It is not in the OS
   keychain, because that would need native modules the plugin bundle
   can't ship.

All of this sits behind a single auth module. When proper OAuth lands, only
that module changes; no tool code does.

**Limits. This is fine for an internal prototype, not a public release:**

- **No refresh token.** The member signs in again when the token expires.
  The token lifetime is set in FusionAuth's configuration and is
  unverified.
- **Our code handles the member's password.**
- **It depends on undocumented web-app internals.** A change to web-app
  auth could break it without warning.

## Design principles for the tools and skills

- **Confirm before anything that touches the member's archive.** Confirm
  once for the upload plan, and again before anything becomes public.
- **Use idempotent, resumable uploads.** Use `failOnDuplicateName` and keep
  a local manifest of what has been uploaded, so a dropped connection
  doesn't create duplicates.
- **Read before every update.** Some legacy update endpoints may null out
  fields that aren't sent.
- **Keep tools narrow and annotated** (`readOnlyHint` / `destructiveHint`),
  so a later public listing doesn't need a redesign.
- **Never delete in v0.**

<details>
<summary>Code references</summary>

- **Interim auth**
  - Login endpoint: `back-end/api/controller/auth/auth.controller.php:45-86`
  - FusionAuth call and MFA session state: `back-end/api/core/fusionauth/bo/fusionauth.bo.php:22-60`
  - Web app's use of the login and verify endpoints: `web-app/src/app/shared/services/api/auth.repo.ts:37,59,185`
- **Views panel enabled only for Public**
  - `web-app/src/app/file-browser/components/sidebar/sidebar.component.ts:133-137`

</details>
