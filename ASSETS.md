# Replacing assets

There are two kinds of assets:

- **Brand files** (logo, mascot) are part of the app. You replace them in the repo and redeploy.
- **Sponsor logos and the venue name** are content. You change them in `/admin`,
  live, with no redeploy.

## Brand files (repo + redeploy)

They live in `web/public/brand/`. **Overwrite a file with a new one of the same name**, and every
screen that uses it picks it up.

| File | Where it shows | What works best |
|---|---|---|
| `logo.png` | Top bar of the live screen, admin header, browser tab icon | Square icon mark, transparent PNG, at least 256×256 |
| `logo_with_text.png` | Pre-CTF page, Idle loop item, ended page, empty center panel, admin login | Wide logo with the wordmark, transparent PNG, about 1200 px wide |
| `mascot/idle.svg` | Pre-CTF page, left of the countdown (animated, on spinning HUD rings) | Animated SVG, square |
| `mascot/flag.png` | Opening sequence, plants the flag as the game starts | Transparent PNG, about 1000 px tall |
| `mascot/hooded.png` | *The wall falls* card, revealed as the wall breaks | Transparent PNG |
| `mascot/hacking.png` | *On fire* card | Transparent PNG |
| `mascot/peek.png` | *Spotlight* card, peeks in from the right | Transparent PNG, mascot against its right edge |
| `mascot/tired.png` | *Final hour* intro ("I'm fine") | Transparent PNG |
| `mascot/wave.png` | Ended page, bottom right | Transparent PNG |

`fsec-ss.png`, `iboh-2026.webp` and `mascot-peek.webp` are not used by the app. Delete them or keep them for later.

To use a different file name (for example a `.webp`), update the path where it's referenced: search
the code for `/brand/` and you'll find every use (`web/src/display/Display.tsx`, `web/src/admin/Admin.tsx`,
`web/src/templates/index.tsx`, `web/index.html`).

Then preview and deploy:

```powershell
npm run dev:mock                     # check http://localhost:5173/display locally
git add web/public/brand; git commit -m "New brand assets"; git push
```

```bash
# on the VPS
git pull && docker compose up -d --build
```

Displays that are already open reload themselves onto the new build within a few seconds. Nobody
needs to touch the kiosk laptop.

### Event text in the code

The event date on the pre-CTF page (`14 November 2026 · GMT+8`) is a line in
`web/src/display/Display.tsx` (search for `November`). Change it there and redeploy, as above.

## Sponsor logos (in `/admin`, live)

Open `/admin` → **Media**:

- **Sponsor logos (ticker):** PNG, JPG, WebP or GIF, up to 5 MB each. Transparent PNGs look best on
  the dark ticker. Aim for about 400×160. They're shown 56 px tall, so wide logos read best.
  They appear in the bottom ticker as soon as they're uploaded. Until there is at least one,
  the ticker shows "International Battle of Hackers 2026".

Use plain file names (letters, numbers, spaces, `-`, `_`, `.`). Uploading a file with an existing
name replaces it.

Uploads are stored on the VPS in `./data/media/`. They survive restarts and redeploys, and they're
included in the `data` backup (see `DEPLOY.md`).

## Venue name (in `/admin`, live)

`/admin` → **Closing statement** → *Venue*. It fills in "IBOH 2026 has officially ended. Please
proceed to {venue}." on the ended page, and the change is live immediately.
