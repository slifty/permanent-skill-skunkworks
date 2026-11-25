---
name: describe-existing-records
description: Help a Permanent.org member add titles, descriptions, dates and alt text to files already in their archive - photos uploaded with only file names, folders nobody has captioned. Use when the member wants to describe, caption, title, date or add alt text to what's already on Permanent, "tidy up" or "make searchable" an existing folder, or make their archive accessible to screen-reader users. Works on the archive itself; no local files needed.
---

# Describe what's already on Permanent

Many archives hold hundreds of files with nothing but a file name. You
help the member give them titles, descriptions, dates and alt text. Work
on one folder at a time, and change nothing on Permanent until the member
has reviewed your drafts.

## Steps

1. **Sign in and choose the folder.** Sign in as in the
   put-story-on-permanent skill (`check_sign_in`, then `sign_in` if
   needed). Then use `list_archives` and `browse_folder` to find the folder
   the member means. Tell them how many files it has.
2. **Agree the scope.** Ask which of these they want: titles,
   descriptions, dates, alt text. By default, fill in only what's missing
   and leave anything they already wrote alone.
3. **Look at each file.** Call `view_record` for each one. It shows the
   preview image and the file's current details; fields that are empty,
   or a title that's just the file name, are left out. For large folders,
   work in batches of about 20, and tell the member how far along you are.
4. **Draft.** For each file, write only what's missing or what the member
   asked for:
   - **title**: short and specific, not a file name.
   - **description**: one or two sentences on what's happening. Use names
     only when the member has told you who people are. Never guess names,
     relationships or places.
   - **alt text**: what the image shows, for someone who can't see it.
   - **date**: in EDTF, and only when you have real evidence, such as
     something the member told you or something written in the image.
     Every file already has a date (at least its upload time), so a new
     date needs `"overwrite": ["date"]` on that entry. Don't replace a
     date that looks like a real camera date.
   - Leave a field out rather than guess.
5. **Save the plan.** Call `save_description_plan` with every entry
   (`recordId`, `fileName` and the fields you drafted), saved somewhere the
   member can open it, for example
   `~/Documents/permanent-describe-<folder>.json`. Set `overwrite` only
   for fields the member asked you to replace.
6. **Review.** Show the member your drafts next to what's there now, a
   batch at a time. Invite changes. If they edit the file themselves, call
   `read_description_plan` to pick up their edits.
7. **Apply.** Once they approve, call `apply_description_plan`. While
   `done` is false, call it again. Tell the member which fields were kept
   because they already had text (`keptExisting`).
8. **Report back.** Say how many files now have titles, descriptions,
   dates and alt text.

## Care with people's photos

The same rules as curate-event-story apply:

- Describe what is visible, without commentary on people's appearance.
- Don't put private details (home addresses, children's full names,
  medical details) in titles or descriptions unless the member asks.
- Don't add exact locations without asking.
- If a photo looks private or sensitive, ask before describing it.
- Leaving a detail out of a description doesn't hide it: the file and its
  preview still show it. If a file shows something the member wouldn't
  want kept, tell them, and let them decide whether to replace or remove
  it themselves in Permanent.

If a tool fails in a way that looks like a fault in the plugin, follow the
report-plugin-problem skill.
