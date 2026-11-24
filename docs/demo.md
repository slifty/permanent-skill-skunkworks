# Demo: from a folder of party photos to a story on Permanent

A script for a staff member sitting with a member at their laptop. It
takes about 15 minutes for a few dozen photos.

## Before you sit down

1. **Install Node.js 22 or later** on the member's laptop. The plugin's
   server runs with it. (Rehearsing on your own machine, below, needs
   22.6 or later.)
2. **Install the plugin** (see the [README](../README.md#install)). In
   Claude Code, choose the environment when asked: `production` for the
   member's real archive, `dev` or `staging` for a test account. Cowork
   always uses `production`.
3. **Put the photos in one folder** (sub-folders are fine), for example
   `~/Pictures/Rosa 90`. Photos straight from a phone keep their dates and
   places; screenshots and messaging-app copies often don't.
4. **Check the member can sign in to Permanent** in a browser, and has
   their verification code handy if their account uses one.
5. **Rehearse first** with the fake Permanent below, so you know what each
   step looks like.

## The conversation

What to say is in quotes. The plugin's skills handle the rest; expect
Claude to check in at each point marked **Confirm**.

1. **Start.** "We had a party for my grandma's 90th. The photos are in
   Pictures/Rosa 90. Can you help me turn them into stories for my
   Permanent archive?"
   - Claude scans the folder and reports how many photos there are, how
     many are duplicates, and how many have no date.
2. **Stories.** Claude proposes 3–7 stories that follow the day.
   **Confirm:** rename, merge or split them, and tell Claude who's who if
   names should appear.
3. **Choosing and captioning.** Claude picks the best shots and writes
   titles, descriptions and alt text. It asks before keeping exact GPS
   locations.
4. **Review.** Claude saves `story-manifest.json` next to the photos and
   summarizes each story. **Confirm:** ask for changes in plain words
   ("make the cake story warmer", "leave out the blurry one of Uncle
   Joe").
5. **Sign in.** "Great, put it on Permanent." A Permanent sign-in page
   opens in the browser. The member types their password there, not in
   the chat.
6. **Where it goes.** Claude lists the member's archives and asks which
   one, then explains that the event will go in My Files, private.
   **Confirm.**
7. **Upload.** Claude uploads in chunks and reports progress, then waits
   for Permanent to finish processing.
8. **Share.** "Can I send this to the family?" Claude asks who should be
   able to open it, then makes a share link. Open it together in the
   browser to see the story on Permanent.
9. **Optional: publish.** Only if the member wants the story on their
   public archive page. Claude explains what public means and waits for
   an explicit yes. Publishing needs the owner or manager role.

## Rehearse without Permanent

A fake Permanent runs on your own computer and keeps everything in
memory, so nothing touches a real archive. Rehearsing needs a clone of
this repository and Node.js 22.6 or later.

```
npm ci
npm run demo:sample-photos -- ~/Desktop/rosa90
npm run demo:fake-permanent
```

In another terminal, start Claude Code with the plugin pointed at the
fake:

```
export PERMANENT_API_URL=http://127.0.0.1:8787/api
export PERMANENT_WEB_URL=http://127.0.0.1:8787
claude --plugin-dir ./plugins/permanent
```

Sign in as `demo@permanent.test` with the password `rehearsal`. The share
links it gives you point at the fake, so they won't open a real page.
When you stop the fake with Ctrl-C, it prints the folders and files it
received.

The sample photos are simple drawings of a party (arriving at a house,
dinner, a cake with nine candles, dancing) with real camera dates and a
location. They include one exact copy and one near-duplicate, so you can
see Claude leave those out.

## Known rough edges

- **Not yet run against a real Permanent environment.** Everything is
  tested against a fake that follows the API code. Do a dev or staging run
  before the first real demo.
- **Signing in again.** The interim sign-in has no refresh token, so a
  long session may need a second sign-in. Claude asks for it and then
  carries on where it stopped.
- **Cowork.** Not yet tested in Cowork. Unknowns: whether Cowork needs
  Node installed separately, and whether the folder paths Claude sees
  match the paths the plugin's server sees.
- **Order and covers.** Permanent orders a story by date, not by hand, so
  Claude orders photos by adjusting their dates. Timeline view is only
  offered for folders in Public, so a private story shows as a grid.
- **Edits after publishing.** The public copy is separate; edit the
  private story and publish again to update it.
