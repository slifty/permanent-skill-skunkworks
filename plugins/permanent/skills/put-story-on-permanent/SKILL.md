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

1. **Sign in.** Call `check_sign_in`. If the member isn't signed in, call
   `sign_in` and tell them a Permanent sign-in page has opened in their
   browser. If it didn't open, give them the link. Then call
   `check_sign_in` with `waitSeconds: 60` until they're done. Never ask
   for their password in the chat; if they offer it, tell them to use the
   sign-in page instead.
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
   public." Wait for a yes.
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
     the member which files didn't make it and why, in plain words.
   - Being signed out mid-way: sign in again, then call
     `apply_story_manifest` again. It picks up where it left off.
7. **Wait for processing.** Permanent makes thumbnails and previews after
   upload. Call `check_processing` with the story's `recordIds` and
   `waitSeconds: 60`, so you can tell the member when everything is ready.
8. **Report back.** Summarize what is now on Permanent: the event folder,
   each story and how many photos it has. If the member later edits the
   manifest, or asks you to change a title or description, update the
   manifest and call `apply_story_manifest` again. Only what changed is
   updated.

## Small changes

For a one-off change to a single photo or folder, use `set_record_details`
or `set_folder_details`. Then make the same change in the manifest, so a
later `apply_story_manifest` doesn't undo it.
