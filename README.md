# Wow vs. Crisis: live panel scoreboard

Live audience voting for the university panel on AI-native 6G research at the
Brooklyn 6G Summit 2026.

Each panelist tells their AI "Hall of Fame" moment from the past year and gives
two scores from 1 to 10:

- **Wow:** how much AI has amazed them.
- **Crisis:** how much it has made them wonder what's left for faculty and students.

The audience votes the same two scores on their phones, and an **AI Bot**
column asks Claude live for its own scores and a one-line explanation.
Everything is shown on the screen behind the panel.

## Running locally

You need [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
node server.js
```

Don't run `npm install` in a Google Drive (or Dropbox/OneDrive) folder: the
sync client can corrupt `node_modules`, which shows up as
`ERR_INVALID_PACKAGE_CONFIG`. Clone the repo to a local folder such as
`C:\code\b6gs_aipanel` instead.

Then open:

| Page                        | URL                                       |
| --------------------------- | ----------------------------------------- |
| Screen, with admin controls | http://localhost:3000/screen?key=changeme |
| Voting page                 | http://localhost:3000/                    |

To use a different port or admin key, set them as environment variables:

```bash
# macOS / Linux / Git Bash
PORT=8000 ADMIN_KEY=mysecret node server.js
```

```powershell
# Windows PowerShell
$env:PORT=8000; $env:ADMIN_KEY="mysecret"; node server.js
```

The AI Bot needs a Claude API key from [platform.claude.com](https://platform.claude.com),
set the same way as `ANTHROPIC_API_KEY`. Without one, everything else works, and
you can type the AI's scores and quote in by hand.

Note that a phone can't reach `localhost`, so the QR code only works once the
app is deployed (see below).

### "Port 3000 is already in use"

This means another server is still running on that port, often an earlier copy
of this one. If it's running in a terminal you can see, press **Ctrl+C** there.
Otherwise, stop whatever is listening on the port:

```powershell
# Windows PowerShell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
```

```bat
:: Windows Command Prompt: find the PID in the last column, then kill it
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

```bash
# macOS / Linux
lsof -ti :3000 | xargs kill
```

Or leave it running and start this one on another port, e.g. `PORT=8000 node server.js`.

## Deploying on Render

1. Create a new **Web Service** on [render.com](https://render.com) and connect
   it to this repo.
2. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
3. Under **Environment**, add:
   - `ADMIN_KEY` with a secret value. Without it, the key is `changeme`, which
     anyone reading this repo knows.
   - `ANTHROPIC_API_KEY` with your Claude API key, for the AI Bot.

Once it's live:

- Open `https://<your-app>.onrender.com/screen?key=<ADMIN_KEY>` on the laptop
  connected to the screen.
- The audience scans the QR code on the screen, which goes to
  `https://<your-app>.onrender.com/`.

## Running the panel

On the screen page (with `?key=...`):

- **Panelist scores:** click a panelist's cell, type a number from 1 to 10 and
  press Enter. Press Enter on an empty box to clear a score, or Escape to cancel.
- **Ask the AI:** sends Claude the panelists' and audience's scores so far, plus
  an optional note from you (e.g. something a panelist just said). It takes a
  few seconds; the screen shows "Thinking..." and then the AI's scores and quote.
  You can ask again to get a new answer, click its scores to override them, or
  click its quote to edit it.
- **Open voting / Close voting:** controls whether the audience can vote. Voters
  can change their vote until voting closes.
- **Round 1 / Round 2:** use round 2 at the end of the panel to ask "has your
  score changed?" Each cell then shows the round-1 score above the new one.
- **Reset all:** erases all scores and votes.
- Press **H** to hide or show the controls.

Suggested flow:

1. Put the screen page up before the panel starts so the QR code is visible.
2. Open voting while the panelists tell their stories, and enter each panelist's
   scores as they give them.
3. Ask the AI for its scores, and read its quote out loud.
4. Close voting, and use the gaps between the panel's, the AI's and the
   audience's scores to lead into the discussion.
5. At the end, switch to round 2, open voting again, update the panelists'
   scores and ask the AI again. In round 2 it is told its round-1 answer.

## Things to know

- **Votes are kept only in memory.** Restarting or redeploying the server erases
  them, so don't redeploy during the session, and take a screenshot after each
  round.
- **Render's free tier sleeps after about 15 idle minutes**, and the first
  request after that can take about a minute. Open the screen page shortly
  before the panel; it refreshes every 1.5 seconds, which keeps the app awake.
- **Test the deployed app from a phone on cellular** before the event, not just
  on Wi-Fi.
- **The AI Bot uses Claude Opus 5.5** at low effort to keep it quick on stage,
  with automatic fallback to another model if a request is declined. Each
  question costs a fraction of a cent. The model and its instructions are near
  the top of the AI Bot section in `server.js`.
- To change the panelist names, edit `PANELISTS` near the top of `server.js`.

## Photos

Put each panelist's photo in `public/photos/`, named after their first name in
lowercase: `sundeep.jpg`, `kaushik.jpg`, `gerhard.jpg`, `tommaso.jpg`,
`danijela.jpg`. JPEG, PNG and WebP all work. Square photos look best, since
they are cropped to a circle.

An optional `ai.png` (or `.jpg`) replaces the robot icon on the AI Bot column.
A missing photo shows the person's initial instead.

## Files

| File                   | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `server.js`          | Web server, voting API and AI Bot, with state kept in memory |
| `public/photos/`     | Panelist photos                                            |
| `public/vote.html`   | Voting page for audience phones                            |
| `public/screen.html` | Scoreboard for the screen, with QR code and admin controls |
