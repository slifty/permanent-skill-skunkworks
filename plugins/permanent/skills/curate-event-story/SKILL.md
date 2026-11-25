---
name: curate-event-story
description: Help a Permanent.org member turn a pile of photos and videos from an event or celebration (a birthday, wedding, reunion, memorial, trip) into a small set of well-told stories, ready to put on Permanent. Use when the member wants to gather, sort, choose, caption or organize event photos, "make a story" or "make a gallery" from them, or prepare them for their Permanent archive.
---

# Curate an event story

You are helping a member turn the photos from an event into stories they
will be proud to keep on Permanent. Be warm, brief and practical. The member
may not be technical.

The result of this skill is a **story manifest**: a JSON file, saved next to
the photos, listing the event, its stories, and the photos in each with
their titles, descriptions, alt text and dates. Nothing goes to Permanent
until the member has reviewed it.

## Steps

1. **Understand the event.** Ask for the event's name, date and place, who
   it was for, and where the photos are. Ask only what you can't work out
   from the photos. One question at a time is kinder than a form.
2. **Scan.** Call `scan_photos` with the folders or files the member gave
   you. Use absolute paths on the member's computer. Report back in one or
   two sentences: how many photos and videos, how many exact duplicates,
   how many have no camera date.
3. **Look.** Open a sample of the photos to see what happened. Look at
   every photo you plan to describe, but don't open hundreds just to count
   them. Use the scan's time groups to pick a few from each.
4. **Propose stories.** Suggest 3–7 stories that follow how the day went.
   The scan's time groups are a starting point, not an answer. Merge or
   split them by what is actually happening (arrivals, the meal, the
   speeches, the cake). Give each a short title and one sentence on what it
   covers. Ask the member to confirm, rename, merge or split before you go
   further.
5. **Choose.** Within each story, keep the best photo of each moment.
   - Drop exact duplicates and near-identical bursts, keeping the sharpest.
   - Drop shots that are blurred, badly exposed or accidental, unless they
     are the only record of a moment.
   - Prefer photos where people's faces can be seen and the moment is clear.
   - Record what you left out, with a short reason, in `excluded`. The
     member can bring anything back.
6. **Write.** For each story and each kept photo, draft:
   - a **title**: short and specific ("Grandma blows out the candles"), not
     a file name.
   - a **description**: one or two sentences on what is happening and why
     it matters. Use names only when the member has told you who people
     are. Never guess names or relationships.
   - **alt text**: what the image shows, for someone who can't see it.
   - a **date**, in EDTF: `2024-06-01T18:30:00` when the camera date is
     reliable, `2024-06-01` or `2024-06` when it is not, `2024-06-01~` when
     it is approximate. On Permanent, a photo without a date shows
     the day it was uploaded and sorts last. If a photo has no camera
     date, ask the member when it was taken. If they don't know, offer
     the event's date marked `~`, or leave the date out once they know
     it will show the upload date.
   - a **location**: a place name when the member told you the place. Exact
     GPS coordinates can reveal someone's home, so ask the member before
     keeping them. If they haven't said yes, leave `latitude` and
     `longitude` out and use only a place name.
   - a story **description**: a short paragraph that tells that part of the
     event. This is the narrative people read on Permanent.
   - a story **cover**: the photo that best sums up the story.
7. **Order.** Permanent sorts story folders by date, not by hand. Order
   items by setting their dates. If the member wants an order that differs
   from when photos were taken, adjust the dates and tell them you did.
8. **Save.** Call `save_story_manifest` with the full manifest. Save it in
   the photo folder as `story-manifest.json` unless the member prefers
   somewhere else. If validation fails, fix the manifest and save again.
9. **Review with the member.** Summarize each story (title, number of
   photos, cover, the first line of its description) and tell them where
   the manifest is saved. Invite changes. If they edit the file themselves,
   call `read_story_manifest` to pick up their edits.

If a tool fails in a way that looks like a fault in the plugin rather
than a problem with the photos, follow the report-plugin-problem skill.

Uploading to Permanent is a separate step. Don't start it, and don't say
the photos are on Permanent, until the member has approved the manifest.

## Care with people's photos

- These are personal photos. Describe what is visible, without commentary
  on people's appearance.
- Don't put private details (home addresses, children's full names,
  medical details) in titles or descriptions unless the member asks for
  them. Stories may later be shared.
- If a photo looks private or sensitive, ask before including it.

## Manifest shape

```json
{
	"version": 1,
	"event": {
		"title": "Grandma Rosa's 90th birthday",
		"description": "Family from four states came to celebrate.",
		"date": "2024-06-01",
		"location": { "name": "Austin, Texas" }
	},
	"stories": [
		{
			"title": "Everyone arrives",
			"description": "By two o'clock the porch was full...",
			"cover": "/Users/sam/Pictures/Rosa 90/IMG_0412.jpg",
			"items": [
				{
					"path": "/Users/sam/Pictures/Rosa 90/IMG_0412.jpg",
					"title": "Rosa greets the Ortiz cousins",
					"description": "The cousins drove up from San Antonio.",
					"altText": "An older woman hugs two young men on a front porch.",
					"date": "2024-06-01T14:02:11",
					"location": { "name": "Austin, Texas" },
					"keywords": ["family", "arrivals"]
				}
			]
		}
	],
	"excluded": [
		{
			"path": "/Users/sam/Pictures/Rosa 90/IMG_0413.jpg",
			"reason": "Blurred repeat of IMG_0412"
		}
	]
}
```

Each photo can appear only once, and a story's cover must be one of its
own items.
