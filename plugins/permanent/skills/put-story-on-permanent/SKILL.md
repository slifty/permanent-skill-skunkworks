---
name: put-story-on-permanent
description: Put a curated event story (a story manifest the member has approved) onto their Permanent.org archive - sign in, choose the archive and where the event goes, upload the photos with their titles, descriptions, dates and alt text, and present each story folder. Use after curate-event-story, or when the member asks to upload, save, archive or put their photos or story "on Permanent".
---

# Put a story on Permanent

You are putting an event story the member has approved onto their Permanent
archive. The story lives in a manifest file (`story-manifest.json`), made
with the curate-event-story skill. If there is no manifest yet, curate
first. Never upload photos the member hasn't approved.

## How Permanent holds a story

- An **archive** belongs to a person, family or organization. A member can
  belong to several, with different roles. Adding files needs the
  contributor role or higher.
- **My Files** is the archive's private space. Put new events here.
- **Public** is visible to everyone on the internet. Never put anything
  there unless the member explicitly asks for it to be public.
- The event becomes a folder inside My Files, and each story becomes a
  folder inside the event. A story folder's description is its narrative,
  and its items are shown in date order.

## Steps

1. **Sign in.** Call `check_sign_in`. If the result has an `updateNote`,
   a newer version of the plugin is installed than the one running: ask
   the member to restart Claude before going further. If the member isn't signed in, call
   `sign_in` and tell them a Permanent sign-in page has opened in their
   browser. If it didn't open, give them the link. Then call
   `check_sign_in` with `waitSeconds: 60` until they're done. Never ask
   for their password in the chat; if they offer it, tell them to use the
   sign-in page instead. If the result has an `environmentNote`, the
   plugin isn't using the live permanent.org. Tell the member plainly
   which environment it is, and that photos put there aren't in their
   real archive.
2. **Choose the archive.** Call `list_archives`. If there is more than one,
   ask which archive the event belongs in. Check their role allows adding
   files.
3. **Choose where it goes.** Call `browse_folder` with only the archive to
   find **My Files**. Unless the member asks for somewhere else, the event
   goes directly inside My Files. If they want it inside an existing
   folder, browse to find it.
4. **Confirm.** Before uploading, tell the member in one or two sentences
   what will happen. For example: "I'll create 'Rosa's 90th' in your
   family archive's My Files, with 4 stories and 38 photos. Nothing will be
   public." When the environment isn't production, name it in the same
   sentence ("…on Permanent's **dev** server"). Wait for a yes.
5. **Upload.** Call `apply_story_manifest` with the archive, the parent
   folder and the manifest's path. It does the work in time-limited
   chunks. While `done` is false, tell the member how far along it is
   ("2 of 4 stories uploaded") and call it again. It records where each
   story went in the manifest (`permanentFolderId`). That's how a story
   renamed later keeps its folder, so leave those fields alone.
6. **Deal with problems.**
   - `conflicts`: a different file with the same name is already in that
     folder. Ask the member what to do; don't rename or delete anything on
     Permanent on your own.
   - `failed`: `done` stays false so a temporary problem gets retried.
     Call again once. If the same files fail a second time, stop and tell
     the member which files didn't make it and why, in plain words. Then
     look at the errors:
     - If they are about the files themselves (unreadable, changed while
       uploading), there's nothing more to do.
     - If they come from Permanent or the plugin (for example
       "Permanent returned 500", "not found" or "rejected"), also follow
       the report-plugin-problem skill.
   - `presented: false` on a story, or `eventProblem` on the result: the
     folder's narrative or date order didn't stick. Call again once; if
     it's still wrong, treat it like any other repeated failure.
   - Being signed out mid-way: sign in again, then call
     `apply_story_manifest` again. It picks up where it left off.
   - Anything else that looks like a fault in the plugin itself: follow
     the report-plugin-problem skill.
7. **Wait for processing.** Permanent makes thumbnails and previews after
   upload. Call `check_processing` with the story's `recordIds` and
   `waitSeconds: 60`, so you can tell the member when everything is ready.
   If any come back `stuck`, stop waiting for them. Tell the member those
   photos are safely saved with their titles and descriptions, but
   Permanent didn't finish making their previews, so they may show as a
   placeholder for now. Give them the file names, and suggest they contact
   Permanent support with the list. Don't upload those files again.
8. **Report back.** Summarize what is now on Permanent: the event folder,
   each story and how many photos it has. Outside production, say again
   which environment it went to. If the member later edits the
   manifest, or asks you to change a title or description, update the
   manifest and call `apply_story_manifest` again. Only what changed is
   updated.
9. **Share it.** Ask the member who they want to see the story.

## Sharing a story

Everything above stays private: only the archive's members can see it.
There are two ways to show it to others. Offer the link first.

- **A share link** (`share_folder`): the folder stays private, and only
  people with the link can see it. Share the event folder to share every
  story, or one story folder to share just that one. Ask who it's for:
  - `anyone_with_link`: guests can open it without an account. Tell the
    member that anyone the link is forwarded to can see it.
  - `permanent_account`: people must sign in to Permanent first.

  Give the member the URL to send. If the result has an
  `environmentNote`, warn them that most people won't be able to open it.
  Calling it again returns the same link.

- **Publishing** (`publish_folder`): a copy goes into the archive's Public
  space. Anyone on the internet can find it, and it appears on the
  archive's public page. Only do this when the member asks for it to be
  public. Before publishing, say plainly:
  - Anyone on the internet will be able to see these photos and their
    descriptions.
  - The public copy won't change when the private story is edited later.
  - It needs the owner or manager role.

  Then wait for an explicit yes, and only then pass
  `memberAgreedToPublish: true`. Check the descriptions and alt text
  first for anything private, such as addresses, children's full names or
  health details.

## Small changes

For a one-off change to a single photo or folder, use `set_record_details`
or `set_folder_details`. Then make the same change in the manifest, so a
later `apply_story_manifest` doesn't undo it.
