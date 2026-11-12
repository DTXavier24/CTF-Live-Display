# Deploying IBOH Live Display

One Docker container on the Hetzner VPS serves both `/display` (the hall screen) and `/admin`.
The display laptop just opens `/display` full screen in Chrome.

## 1. VPS (Hetzner, Ubuntu)

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# The app
git clone https://github.com/DTXavier24/CTF-Live-Display.git iboh && cd iboh
cp .env.example .env && nano .env      # see the checklist below
docker compose up -d --build           # builds the image and starts it, restarts by itself
docker compose logs -f                 # watch it log in to GZCTF and connect the hub
```

Open port 80 (and 22 for SSH) in the Hetzner Cloud Firewall, or with `ufw allow 80 && ufw allow 22`.
Then browse to `http://<vps-ip>/admin`.

### `.env` checklist

| Variable | Value |
|---|---|
| `GZCTF_BASE_URL` | The event's GZCTF URL, **reachable from the internet** (the VPS is not on the venue LAN) |
| `GZCTF_GAME_ID` | The event game's ID (shown in the GZCTF admin URL) |
| `GZCTF_USERNAME` / `GZCTF_PASSWORD` | A GZCTF **admin** account (needed for the live monitor hub and unfrozen data) |
| `GZCTF_INSECURE_TLS` | `0` (only `1` for a self-signed test server) |
| `ADMIN_PASSWORD` | A long random password for `/admin`, e.g. `openssl rand -base64 24` |
| `MOCK_GZCTF` | `0` |

GZCTF division names must contain "Local" and "International". Teams in other divisions are hidden
(the admin Health panel logs a warning).

### Update, back up, roll back

```bash
git pull && docker compose up -d --build   # open displays reload themselves onto the new build
tar czf iboh-data-$(date +%F).tgz data     # queue, settings, announced bloods, uploaded media
```

Everything that must survive a restart lives in `./data` (SQLite + `media/`). The image itself holds no state.

### No HTTPS: what that means

Without HTTPS, the admin password and the admin session cookie cross the internet unencrypted. Anyone
on the path (venue Wi-Fi included) could capture them and take over `/admin`. Before the event, either:

- put Caddy in front with a free hostname such as `<ip-with-dashes>.sslip.io` for automatic HTTPS, or
- only open `/admin` from a trusted connection, and change `ADMIN_PASSWORD` after the event.

`/display` exposes nothing sensitive.

## 2. Display laptop (HDMI to the hall screen)

1. **Screen:** in Windows display settings, set the HDMI screen to **1920×1080**. Use *Second screen
   only* (simplest), or *Extend* and note where the hall screen sits.
2. **Never sleep** (run once in an admin PowerShell):

   ```powershell
   powercfg /change standby-timeout-ac 0; powercfg /change monitor-timeout-ac 0; powercfg /change hibernate-timeout-ac 0
   ```

   Keep the laptop on mains power and turn off the screensaver and Windows Update restarts for the day.
3. **Launch the display** (a separate Chrome profile, so pop-ups and sign-ins never appear on screen):

   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://<vps-ip>/display" `
     --user-data-dir="$env:LOCALAPPDATA\IBOH-Kiosk" --autoplay-policy=no-user-gesture-required `
     --noerrdialogs --disable-session-crashed-bubble --disable-features=Translate --no-first-run
   ```

   In *Extend* mode, add `--window-position=1920,0` (or wherever the hall screen is) so the window
   opens on that screen. Exit kiosk mode with `Alt+F4`.

The display needs no interaction: it reconnects by itself after Wi-Fi drops or a server restart, shows
"Data delayed" while GZCTF is unreachable, and reloads itself when you deploy a new version.

## 3. Rehearse before the day

From the repo on any PC (PowerShell):

```powershell
$env:MOCK_START_OFFSET_MIN = -2; $env:MOCK_DURATION_MIN = 6; npm run dev:mock
```

That's a full show in ~8 minutes: pre-CTF countdown, the 10-second countdown and "Let the battle begin" opening, live loop, then (after setting
*Final stretch → Auto starts before the end* to 1 min in `/admin`) the final hour, the 10-second
countdown and the ended page. The *Rehearsal* buttons in `/admin` trigger every auto-event on demand,
and *Extend end +5 min* rehearses a cancelled countdown.

## Event-day checklist

- [ ] `/admin` → Health: hub **Connected**, scoreboard poll a few seconds ago, 1 display visible
- [ ] Phase shows **Auto**; venue set; sponsor logos uploaded and previewed
- [ ] Default loop and auto-event settings reviewed; Final stretch on Auto (60 min) with the opening and final countdowns on
- [ ] Laptop: on mains power, sleep disabled, Chrome in kiosk on the hall screen
