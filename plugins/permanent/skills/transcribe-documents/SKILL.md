---
name: transcribe-documents
description: Put letters, diaries, certificates, recipes and other documents onto Permanent.org with a faithful transcription, a title and a date for each - read each scan or PDF, transcribe it word for word, date it from its content, group related documents into folders, and check with the member before including sensitive details. Use when the member wants to archive, transcribe, digitize or describe letters, papers or documents, as scans, photos of pages or PDFs.
---

# Transcribe documents

You are helping the member put documents on Permanent so they can be read
and searched: letters, diaries, certificates, recipes, newspaper clippings.
Each document becomes a record with a title, a date and its transcription as
the description. Permanent descriptions have no length limit, so the whole
text fits.

## Steps

1. **Gather.** Ask where the documents are. Call `scan_photos` on the
   files or folders. It finds scans and photos of pages as well as PDFs
   (`kind: "document"`). Its dates are when each file was made, not when
   the document was written, so ignore them for documents.
2. **Keep each document in one file.** Each file becomes its own record
   on Permanent. If a document's pages are separate images, ask the member
   to combine them into one PDF first, for example with Preview on a Mac
   or their phone's document scanner. If they'd rather not, each page
   becomes its own record: title the pages "page 1 of 3" and so on, and
   put the whole transcription on page 1.
3. **Read each document.** Open it and read every page yourself.
4. **Transcribe faithfully.** Write down what the page says, not what it
   meant to say:
   - Keep the writer's spelling, grammar and line of thought. Don't
     correct or modernize.
   - Mark a word you can't read as `[illegible]`, and a best guess as
     `[?word]`.
   - Note what isn't text in square brackets: `[crossed out: ...]`,
     `[drawing of a house]`, `[stamp]`.
   - Mark page breaks as `[page 2]`.
   - If the document is in another language, transcribe it in that
     language. Offer a translation, clearly labelled, after the
     transcription.
     After each document, tell the member how sure you are of the reading.
     If much of it is uncertain, say so and suggest they check it.
5. **Title and date it.** Give each document a plain title ("Letter from
   Rosa to her sister Ana"). Date it from its content: a dateline, a
   postmark, events it mentions. Use EDTF: `1952-03-14` when it's written
   on the page, `1952-03~` for "about March 1952", `1952?` when you're
   inferring the year. If there's nothing to go on, leave the date out
   rather than guess.
   Permanent has no "unknown" date. An item without one shows the day it
   was uploaded, and the date order puts it last. Uncertain dates are stored
   as plain dates too: `1962~` shows as 1 January 1962. So before saving,
   tell the member which items have no date and let them choose: an
   approximate date they agree to (such as the date of related documents,
   marked `~`), or no date, knowing it will show the upload date.
6. **Check for sensitive details.** Before anything goes on Permanent,
   look for ID or account numbers, addresses of living people, medical,
   legal or financial details, and anything said about living people that
   they might not want kept. List what you found and ask the member
   what to do. Don't decide on their behalf.

   Leaving a detail out of the transcription (`[redacted]`) doesn't hide
   it: the scan itself, and its preview on Permanent, still show it. Say
   so plainly, then offer these choices:
   - **Upload the file anyway**, with the detail left out of the
     transcription only.
   - **Redact the file first.** The member covers the detail before
     scanning, or blacks it out with a PDF or image editor, and gives you
     the new file.
   - **Keep only the transcription.** Write it to a text file next to the
     original, with the same name and a `.txt` extension (`letter-03.jpg`
     becomes `letter-03.txt`), and put that file in the manifest instead
     of the scan, with the document's title as its `title`. The scan
     stays on the member's computer.
   - **Skip the document.**

7. **Group them.** Suggest folders for related documents, such as one
   correspondence or one year of a diary. Show the member the list:
   titles, dates and how they're grouped. Wait for their yes.
8. **Write the manifest.** Use `save_story_manifest` as the
   curate-event-story skill describes. The collection is the event; each
   group is a story. For each item set `title`, `date`, and `description`
   to the transcription, then a blank line and a note of anything
   uncertain. Add `keywords` for the people and places named, if the
   member wants them.
9. **Put it on Permanent.** Follow the put-story-on-permanent skill from
   step 1. It handles sign-in, choosing where it goes, uploading and
   checking it all arrived.

## Documents already on Permanent

If the documents are already in the member's archive, use the
describe-existing-records skill to read and update them, and apply steps 4
to 6 above to each one. A document's preview shows only its first page, so
download the original with `download_record_file` and transcribe every
page from it. Never present a transcription of the first page as the
whole document.

The file is already on Permanent, so leaving a sensitive detail out of its
description doesn't hide it. Tell the member, and let them choose between
keeping the file as it is or replacing it with a redacted copy themselves
in Permanent. Never delete or replace files on Permanent yourself.
