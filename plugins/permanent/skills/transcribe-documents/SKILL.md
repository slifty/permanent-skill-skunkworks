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
6. **Check for sensitive details.** Before anything goes on Permanent,
   look for ID or account numbers, addresses of living people, medical,
   legal or financial details, and anything said about living people that
   they might not want kept. List what you found and ask the member
   whether to include it, leave it out (`[redacted]`), or skip that
   document. Don't decide on their behalf.
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
to 6 above to each one.
