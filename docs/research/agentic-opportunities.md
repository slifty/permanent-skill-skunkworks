# Agentic opportunities on Permanent today

What a Claude agent could do with Permanent as it exists today. Each
opportunity is rated by value and difficulty, with the event-story use case
as the lens.

> **The ask:** sit down with a member, open Claude, and have Claude collect
> the photos for a celebration, sort them into stories, put them on
> Permanent, and curate the story for the public gallery / archive page.

## Summary

- **Curation is easy; getting it into Permanent is the hard part.**
  - Claude can already sort, deduplicate, group and caption a folder of
    photos with no Permanent integration.
  - Writing the result into Permanent is blocked by **authentication**. No
    member-facing way exists for a third-party client to get a token.
- **Permanent has no "story" or "album" object.** A story is a folder:
  - its description is the narrative
  - its dates drive the order
  - it becomes public by being copied into the Public workspace
- **The backend can do more than the web app shows.** It has folder views
  named `storyscroll`, `storyslider` and `slideshow`, and settable folder
  cover images. The web app exposes neither.
- **The story doesn't have to be public.** The intent behind "public gallery
  page" is to present the story with Permanent's own views. A share link to
  a private story folder does that. Publishing to the public archive
  (`/p/archive/…`) is optional. The `/gallery` "Featured" list is a
  separate thing that staff curate per archive.

## How the ask maps onto Permanent

| Ask                                            | Closest thing in Permanent today                                  | Fit                                             |
| ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| "Collect all the pictures"                     | Local folders (Cowork / Claude Code), Google Drive connector      | Good. Done on the Claude side.                  |
| "Sort them into stories"                       | Sub-folders, each with a description, dates and a cover thumbnail | OK. No manual order, plain-text narrative only. |
| "Get them added on the platform"               | Presigned S3 upload + `record/registerRecord`, or SFTP/rclone     | Works, but no member-facing auth for agents.    |
| "Curate the story for the public gallery page" | Copy the story folder into Public; edit the archive profile       | OK. Publishing is a copy, not a link.           |
| Public Gallery "Featured" placement            | `make-featured`, admin only, whole archive                        | Out of scope for agents. A staff decision.      |

## Opportunities

Value is value to the event-story use case. Difficulty is engineering effort
given the current codebase.

### Available now (no Permanent changes)

| #   | Opportunity                                                                                                                                                                                                               | Value  | Difficulty   | Notes                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Curation skill**: gather photos from local folders or Drive, drop duplicates and blurry shots, group into stories by EXIF time and place, draft titles, descriptions, alt text and dates, produce a reviewable manifest | High   | Low          | Pure Claude-side work. Needs Cowork or Claude Code for local files. EXIF date and GPS are re-extracted server-side on upload anyway.                                          |
| A2  | **Drive the web app through the browser**, as the existing `permanent-archive:manager` skill (tank repo) does                                                                                                             | Medium | Low (exists) | Works today and is good enough for an internal demo. Slow, fragile, needs Claude for Chrome, and not something to ship to members.                                            |
| A3  | **Bulk upload through rclone/SFTP** (`sftp.permanent.org`)                                                                                                                                                                | Medium | Low          | Puts bytes and folder trees in place. The password sits in `rclone.conf`, MFA users are excluded, there is no rename or metadata, and content type is forced to octet-stream. |

### Unlocked by member-facing agent auth

All of these depend on **B0**.

| #   | Opportunity                                                                                                                                         | Value              | Difficulty | Notes                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0  | **Member auth for agents**: a FusionAuth public client using auth-code + PKCE (loopback) or device code, with refresh tokens, accepted by both APIs | Critical (enabler) | Medium     | Nothing like this exists. stela allow-lists FusionAuth app IDs, so a new app ID must be added. back-end checks only the issuer. **Interim workaround:** sign in the way the web app does (`/api/auth/login`), as described in [solution-shape.md](../solution-shape.md#interim-auth). |
| B1  | **Browse**: list archives, folders and records                                                                                                      | Medium             | Low        | stela `GET /archives`, `/folders`, `/records`. The SDK covers most of it.                                                                                                                                                                                                             |
| B2  | **Create the event and story folders**                                                                                                              | High               | Low        | back-end `folder/post` (V2). Covered by the SDK.                                                                                                                                                                                                                                      |
| B3  | **Upload with processing wait**                                                                                                                     | High               | Medium     | Presigned POST plus `registerRecord` (in the SDK). Multipart is needed for video and large files (not in the SDK). Poll `status` and `thumbnailUrls` until processing finishes. No webhook exists.                                                                                    |
| B4  | **Record metadata**: title, description, date (EDTF), location                                                                                      | High               | Low        | stela `PATCH /records/:id`.                                                                                                                                                                                                                                                           |
| B5  | **Alt text and keywords**                                                                                                                           | Medium             | Medium     | back-end `record/update` (V2) for alt text, `tag/post` (V1) for keywords. These may null out fields that aren't sent, so read before writing.                                                                                                                                         |
| B6  | **Story presentation**: folder description, cover image, sort by date, view                                                                         | High               | Medium     | Only possible through V1 `folder/update` and `folder/sort`. Cover and story views are API-only. The web app may not render the story views (unverified).                                                                                                                              |
| B7  | **Publish a story**: copy the folder into Public, return the public URL                                                                             | High               | Medium     | No publish endpoint; publishing means copy or move into the public root. Needs Manager or Owner. The copy diverges from Private afterwards.                                                                                                                                           |
| B8  | **Archive profile**: blurb, about text, banner                                                                                                      | Medium             | Medium     | V1 `profile_item/*`. How milestones are stored is unverified.                                                                                                                                                                                                                         |
| B9  | **Share link to the story**, for guests before or instead of going public                                                                           | Medium             | Low        | stela `/share-links` (in the SDK).                                                                                                                                                                                                                                                    |
| B10 | **Invite family as contributors** to an archive                                                                                                     | Low–Med            | Low        | back-end `archive/share`. Useful for a shared celebration.                                                                                                                                                                                                                            |

### Product changes that would improve the experience

| #   | Opportunity                                                         | Value        | Difficulty | Notes                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------- | ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Manual ordering** in folders                                      | Medium       | Medium     | `position` sort exists, but nothing sets positions (`UpdateFolderLinkVOPosition` has no callers). Workaround: order by display date.                                                                     |
| C2  | **Show story views in the web app** (`storyscroll`, `slideshow`, …) | High         | Med–High   | The constants exist in back-end and stela. The web app only offers List, Grid and Timeline. Biggest visual payoff for "a story".                                                                         |
| C3  | **Sub-folder cover picker in the UI**                               | Low          | Low        | Already settable through the API.                                                                                                                                                                        |
| C4  | **Rich-text story narrative**                                       | Medium       | Medium     | Folder descriptions are plain text.                                                                                                                                                                      |
| C5  | **Remote MCP connector hosted by Permanent**                        | High (reach) | High       | The only way to reach claude.ai chat and mobile users. Needs an OAuth server that meets Anthropic's connector rules. The upload story is weaker, because a remote server can't read the member's laptop. |
| C6  | **Bring photos in from Google Photos or Drive**                     | Medium       | Medium     | Drive connector exists on the Claude side. Moving bytes from Drive to Permanent needs a bridge.                                                                                                          |

## Constraints that shape the design

- **Where it runs.** Only **Cowork** and **Claude Code** can read a member's
  local photo folders and run a local MCP server.
  - claude.ai chat runs skills and remote connectors only.
  - Skill scripts in chat run in a sandbox whose network access is limited.
    Don't rely on them to call Permanent.
- **Two APIs.** Uploads, folder edits, tags, publishing and the profile live
  in the legacy back-end. Several of these are still V1 RequestVO
  envelopes, and they depend on the session's "active archive". stela
  covers reads, record metadata and share links. A client needs both.
- **Async processing.** Thumbnails and access copies arrive after upload,
  so an agent has to poll before it can show the result.
- **Roles.** Publishing needs Manager or Owner. Moving and copying need
  Curator or above.
- **Publish is a copy.** Keep the event folder in Private as the source of
  truth, and republish rather than edit the public copy (or the reverse).
  Pick one and say so to the member.

<details>
<summary>Code references</summary>

Paths are relative to the PermanentOrg repos checked out next to this one.

- **stela auth**
  - App-ID allow-list: `stela/packages/api/src/middleware/authentication.ts:106-136`
- **back-end bearer-token auth**
  - Issuer check only: `back-end/api/core/oauth/bo/oauth.bo.php:66-97`
  - Login: `back-end/api/controller/auth/auth.controller.php:45-86`
- **SFTP**
  - Trusted-server auth pattern: `sftp-service/src/classes/AuthenticationSession.ts:54-150`, `AuthTokenManager.ts:40-55`
- **Upload**
  - Presigned URL: `back-end/api/controller/record/record.controller.php:628-690`
  - Multipart: `:781-860`
  - Register: `:892-960`
- **Record metadata**
  - stela `PATCH /records/:id` validators: `stela/packages/api/src/record/validators.ts:65-90`
  - back-end `record/update`: `back-end/api/controller/record/record.controller.php:264-299`
- **Folder update and sort** (V1)
  - `back-end/api/controller/folder/folder.controller.php:540`, `:1078`
- **Folder views**
  - Constants: `back-end/library/definition/perm.constants.php:157-174`
  - stela enum: `stela/packages/api/src/folder/models.ts:178-184`
  - Web-app enum: `web-app/src/app/shared/services/folder-view/folder-view.enum.ts`
- **Publishing**
  - Web app copies into Public: `web-app/src/app/file-browser/components/publish/publish.component.ts:73-117`
  - Public flag recomputed: `back-end/api/core/archive/bo/archive.bo.php:2726-2752`
- **Featured archives** (admin only)
  - `stela/packages/api/src/archive/controller/controller.ts:146-172`
- **Manual position setter with no callers**
  - `back-end/api/core/folder/bo/folder.link.bo.php:752`
- **Plugin surface support**
  - https://claude.com/docs/plugins/platform-support
- **Connector auth requirements**
  - https://claude.com/docs/connectors/building/authentication

</details>
