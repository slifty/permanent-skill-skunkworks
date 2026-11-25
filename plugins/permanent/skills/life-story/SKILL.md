---
name: life-story
description: Help a family gather the photos, letters and records of someone's life into a Permanent.org archive, arranged into chapters by life stage, with a narrative for each chapter and the archive's profile (blurb, about text and milestones). Use for memorial, remembrance or life-story archives, when someone has died or is ageing and the member wants to keep their life in one place, or when they ask to "tell their story", "make a memorial" or "build a timeline" of a person.
---

# Tell a life story

You are helping a member keep the story of someone's life on Permanent.
Often that person has recently died. Go gently and at the member's pace.
This is not a single event. It spans decades and usually comes from many
places at once: albums, boxes of letters, phones, relatives.

## How to write

- Plain, warm and factual. Say what happened, in the member's words where
  you can.
- Never fill a gap with a guess. Don't invent dates, places, names,
  relationships or feelings. If something isn't known, leave it out or say
  it isn't known.
- Make no assumptions about faith, cause of death, or relationships.
  Mention them only in the words the member used.
- Don't comment on the person or judge their life ("a life well lived",
  "a true hero"). Let the facts and the family speak.

## Steps

1. **Listen first.** Ask who the person is and what the member hopes to
   keep. Ask about the broad shape of their life: where they grew up,
   their work, their family, later years. One question at a time. Don't
   press for details the member doesn't offer.
2. **Gather.** Ask where the material is. Call `scan_photos` on each place.
   For letters and papers, follow the transcribe-documents skill for those
   items. If material came from relatives, ask whether they're happy for it
   to be in the archive. Leave out anything they haven't agreed to.
3. **Propose chapters.** Suggest chapters by life stage, such as
   childhood, growing up, work, family, and later years. Fit them to this
   person's life, not to a template. Give each a title and one sentence on
   what it covers. Ask the member to confirm, rename, merge or split them.
4. **Choose and write.** Follow steps 3 to 6 of the curate-event-story
   skill for each chapter, with these differences:
   - The camera date of a scanned print is when it was scanned, not when
     it was taken. Date old photos from what the member tells you or what's
     written on them. When the member gives an approximate date, use
     EDTF uncertainty: `1962~` for "about 1962". Don't date a photo from
     how it looks. If there's nothing to go on, leave the date out.
     Permanent has no "unknown" date. An item without one shows the day it
     was uploaded, and the date order puts it last. Uncertain dates are stored
     as plain dates too: `1962~` shows as 1 January 1962. So before saving,
     tell the member which items have no date and let them choose: an
     approximate date they agree to (such as the start of its chapter, marked
     `~`), or no date, knowing it will show the upload date.
   - Each chapter's narrative tells that part of the life, from what the
     member has told you and what the material shows.
5. **Save the manifest.** Call `save_story_manifest`. The life is the
   event: title it with the person's name, and date it with the span of
   their life when known (`1934-05-02/2021-11-18`). Each chapter is a
   story. Show the member the chapters, the narratives and how many items
   are in each. Wait for their yes.
6. **Put it on Permanent.** Follow the put-story-on-permanent skill. A
   memorial often has its own archive, so ask whether this should go in an
   existing archive or a new one. The member creates a new archive in
   Permanent's web app.
7. **Write the profile.** Call `get_archive_profile` to see what's there.
   If `publicFields` lists anything, those parts are already public, so
   changing them changes what everyone sees. Tell the member which ones
   before drafting. Draft:
   - a **blurb**: one line, up to 200 characters, saying who they were.
   - an **about** text: a few short paragraphs about their life.
   - **milestones**: the key moments (birth, moves, marriage, work,
     children, death), each with a title of up to 140 characters, a full
     date (YYYY-MM-DD) only when the day is known, and an optional
     description of up to 200 characters. A milestone with only a year
     known goes in without a date, with the year in its title ("Moved to
     Chicago, 1958").

   Show the member the exact text and wait for their yes, then call
   `set_archive_profile`. It needs the owner or manager role. It never
   removes anything. A milestone with the same title as an existing one
   is updated, so keep titles the same when revising.

8. **Say what's private.** The chapters are private, and so is any
   profile text that wasn't already public. Tell the member that the
   profile can be made public from Permanent's web app, and that sharing
   a chapter works as in put-story-on-permanent. Don't publish anything
   unless they ask.
9. **Leave room to come back.** Tell the member they can add more at any
   time: new photos, another relative's letters, a chapter that's missing.
   Add to the same manifest and apply it again.
