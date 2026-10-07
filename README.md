# Apply Assistant

Fills out internship applications on company career sites (Greenhouse, Lever, Ashby, Workday, and others) from your info and the answers you've saved. **You check every page and click Submit yourself.**

- **No AI, no accounts, no cost.** Everything runs on your computer.
- **Safe for your LinkedIn and Handshake accounts:** the tool never reads or touches those sites. Its Chrome extension is switched off on them entirely, so there's nothing for them to detect. The **LinkedIn ↗** and **Handshake ↗** buttons next to Find just open a search there in your Chrome, filled in with your job types, for you to browse yourself.
- **Works in your own Chrome:** jobs open as new tabs in the Chrome you're already logged in to.
- **Learns as you go:** anything it can't fill is outlined in orange. Whatever you type there is remembered and filled in automatically next time.

## The app

Double-click **Apply Assistant** on your Desktop (or `Apply Assistant.exe` in this folder). It has three tabs:

- **Apply:** your job list. Paste links, or tick some **Job types** and click **Find new internships**. The **Internships ⇄** button next to Job types switches to **Full-time** entry-level jobs and back (full-time skips senior, lead, and similar titles). **Compatibility**, next to Job types, sets the minimum match. Find reads each job's description, scores it against your resume and portfolio website, and only adds jobs that score at least that well.

Your website isn't built into the app: it's your Portfolio link in My info → About you → Links (the same link applications get). It's the first item under **My info → Resumes & work → Add other work**. Every page of it is read when the app starts (and again every two weeks); click **Read again** after you update your site. You can add more there: documents (PDF, Word, PowerPoint, text), links to a page or a shared Google Doc, or another whole website (just its address, like `myothersite.com`, and every page gets scanned).

**Your list follows your settings.** Click **⟳** (next to Find) to check every job in your list again without searching; Find, saving My info, and changing Compatibility or the job kind do it too. Jobs that don't fit are set aside:
- too far from your search cities (it reads addresses, "Country, City" and "State City" formats, and every country name; jobs listed only by country or state are estimated from its big cities)
- remote when you're not open to remote work
- below your Compatibility
- not one of the job types you ticked
- the other kind of job (internship or full-time), or senior or manager level when you're looking for full-time entry-level jobs

Jobs whose list entry doesn't say where they are get their location (and title) from their posting, read in the background. Set-aside jobs are listed under the job list with the reason. They come back by themselves when they fit again, or use **Bring back**. The job you're applying to is never set aside.

The **Fit** column shows each job's score:
- Jobs are scored in the background.
- "–" means not scored yet, or the job page couldn't be read.
- Jobs below your Compatibility are grayed out.

To sort the list, click a column heading (click again to flip):
- **Company / place:** distance from your closest search city. Each job shows its closest city first, like "New York City, NY +1 more".
- **Fit:** match score. **Start applying** then goes in that order. Click **Start applying**, and each job's match score, warnings, and **Fill this page** / **Done** / **Skip** buttons appear here. The **Cover letter maker** is here too (see below).
- **My info:** your profile, resumes, saved answers, and settings. Click **Save** when you're done. **Saved answers** folds up; click its [+] to see them. Saved answers are filled in for you, but outlined orange so you check them. Click the square next to one to greenlight it (green = filled in without a flag). New or changed answers start orange.
  - **City search:** the cities you want to work in. Start typing and pick the city from the dropdown, so the right one is used (Portland, OR, not Portland, ME). Add as many as you like with **Add a city**. Each job is measured from the closest one, and Find only keeps jobs within your radius of any of them (plus remote jobs if you're open to remote). Leave it blank to use your address city. Your job list updates as soon as you save.
  - **Job radius:** 0–100 miles in steps of 10, then 150, 200, 250, and 300+ (anywhere).
  - **Open to remote work**, which is also your answer when an application asks. Your answer to "Are you willing to relocate?" is in My info → About you → Availability.
- **History:** every job you submitted or skipped.

The window is drawn entirely in Windows 98 style using WebView2, which is built into Windows 11. Drag it by the title bar, double-click the title bar to maximize, and resize it from the edges. Closing the window quits everything. If something goes wrong, details are in `data/app.log`. After changing the launcher code, rebuild the .exe with `npm run build-exe`.

## One-time setup: the Chrome extension

The app opens jobs in your normal Chrome. A small extension in this folder (`extension/`) lets it fill forms there. To set it up, choose **File → Set up Chrome extension…** in the app, which walks you through it:

1. Open `chrome://extensions` (the dialog has a button for this).
2. Turn on **Developer mode** (top-right corner of that page).
3. Click **Load unpacked** and choose the `extension` folder in this folder.

That's it. When the app is updated, the extension updates itself the next time you click Start applying.

**The toolbar button.** Pin the extension (Chrome's puzzle-piece menu → the pin next to Apply Assistant). Clicking it gives you:
- **Open in a tab:** the whole app in a Chrome tab.
- **Open beside the page:** the app in Chrome's side panel, next to whatever you're browsing, including LinkedIn. It stays open as you switch tabs; close it with its ✕. Nothing is added to the page itself, so sites can't see it.
- **Add this page to my job list:** the job page you're on.

**Import from tab** (next to Add in the app) does the same from inside the app, when it's open from the extension. Beside the page, it adds the page next to it. In its own tab, it adds the page you were on before switching to the app. The job is named from the page's title ("Fashion Nova | Graphic Designer, Sports"). In the desktop window it can't see your Chrome tabs, so paste the link there.

**LinkedIn and Handshake job links** can go in your job list when jobs open in your own Chrome: paste one (or use "Add this page"). The app never loads or reads LinkedIn or Handshake. When you get to that job, your Chrome opens the posting, you click its Apply button, and the company's application page gets the Fill panel. Jobs that use LinkedIn's own Easy Apply can't be filled, since the extension never runs on LinkedIn. In the separate-window mode these links are skipped, because that window is automated.

What the extension can and can't do:

- It only acts on job tabs the app opened, plus tabs those pages open themselves (like an "Apply" button that opens a new tab). Every other tab is ignored.
- It never runs on LinkedIn or Handshake.
- It only talks to the app on your own computer.

If you'd rather not use the extension, choose **My info → Settings → "A separate Chrome window"**. Jobs then open in the tool's own Chrome window (not logged in to anything) like before.

## How each job works

1. The job opens in a new tab in your Chrome, with a small **Apply Assistant** panel in the corner. The app shows a **match score**: which skills from the job description are on your resume and which aren't. It also shows warnings, such as more years of experience than you have (set yours in My info → Experience), a graduation date that doesn't fit, an unpaid role, or one meant for grad students. Asking for 3+ more years than you have also lowers the match. The description comes from the job board's own listing when possible (Greenhouse, Lever, Ashby), so it's complete even on company sites that load slowly.
   The panel's **Where** box shows where the job is and how far it is from your closest search city. It also shows whether the job is remote, hybrid, or on-site, whether they help with relocation, and how all that fits your settings (for example "⚠ Outside your 50 mi radius, and you're not open to relocating"). Hover over a dotted value to see the sentence in the job description it came from.
2. Click the site's **Apply** button, then **Fill this page** (on the panel in the page, or in the app).
   - **Green:** filled from My info or your saved answers. This covers contact info, school, location, work authorization, sponsorship, graduation date, EEO questions, your resume upload, and more.
   - **Orange:** needs you. Answers are saved as you type (except long essay-style answers, which are written for one company) and filled in automatically next time.
3. Click the site's Next button, then **Fill this page** again on each step.
4. **Submit the application yourself**, then click **Done, I submitted**. The next job opens, unless you untick **Open the next job automatically** (next to Skip job). Then Done or Skip leaves the app open with no job until you click **Start applying** or ▶ on a job.

## Cover letter maker

1. **One time:** get a free Gemini API key (My info → Settings → **Get a free key**), paste it in, and click Save.
2. Under the Job list, choose the job (or **Other job** to paste a description), a **Tone** (humanistic, professional, enthusiastic, concise, creative, storytelling, confident, or describe your own), and optionally something to mention.
3. Click **Write cover letter**. The letter opens in an editor laid out like a standard letter: your name and contact details, the date, the company, then the letter. Click anywhere on it to edit.
4. Click **Export to Desktop** to save the PDF straight to your Desktop, or **Export to…** to choose where it goes. Then drag it into the application's cover letter upload.

**Answer an application question** (under the Write cover letter button) writes answers the same way:
1. Paste a question from an application, like "Why do you want to work here?" or "Tell us about a project you're proud of".
2. Optionally pick a length limit.
3. Click **Write answer**.

It uses the job, Tone, and Mention you chose above, and answers in your voice from the job description and your resume, website, and other work. The answer box is editable and shows a word and character count, which turns red if you're over the limit. Below it, it shows what each part of the answer is based on. Anything the app can't know from your materials (a personal reason, say) comes out as a [bracketed note] for you to fill in. Click **Copy** to paste it into the application.

Gemini writes only from your resume, website, other work you added, and the job description. Your address, phone, and email are added on your computer and never sent. On the free tier, Google may use what's sent to improve its products, and there are daily limits.

## Tips

- **Workday:** create an account for each company yourself (Chrome can save the password as usual). Choose "Autofill with Resume", then use **Fill this page** on each step.
- **CAPTCHAs:** solve them yourself, then keep going.
- **Fields that appear later** (like "If yes, explain"): click **Fill this page** again. It only fills empty fields.
- **No match score?** That page didn't show enough of the job description. Click **Fill this page** once the description is on screen and it tries again.
- **Job types:** about 150 kinds of jobs in 25 categories (Design, Healthcare, Education, Engineering, Accounting & finance, Skilled trades, and more). Click a category to open it, tick its box to tick everything in it, or type in the filter box at the top ("nurse", "teacher"). Tick as many as you like; a job is added if it fits any of them. From the terminal, use `npm run find -- --type design,uxresearch`. The words each type looks for are in `src/jobTypes.js`; add your own types under `finder.presets` in `config.json`. Most of the job sources are company job boards and tech internship lists, so fields like nursing, teaching, and the trades turn up few jobs; use the LinkedIn and Handshake buttons for those.
- **Other finder settings** live under `finder` in `config.json`:
  - `locations`: an extra filter by place name, for example `["CA", "Los Angeles", "Remote"]`. Usually you'd use City search and Job radius in My info → Settings instead.
  - `maxAgeDays`: how recent a posting has to be
  - Where it searches (all free and public; never LinkedIn or Handshake):
    - the SimplifyJobs internship list (`simplify`) and other lists in the same format (`lists`; `"kind": "fulltime"` marks new-grad lists like SimplifyJobs New Grad)
    - The Muse (`muse`)
    - company job boards (`boards`)
  - `boards`: add a company if its career links look like `boards.greenhouse.io/<name>`, `jobs.lever.co/<name>`, `jobs.ashbyhq.com/<name>`, or `jobs.smartrecruiters.com/<name>`. For Workday, add `<company>/<wdN>/<site>` from a link like `<company>.<wdN>.myworkdayjobs.com/<site>/...`.

## Terminal version

```
npm start         # like the app, in a terminal, using a separate Chrome window (commands: f fill, d done, s skip, q quit; paste a link to queue it)
npm run find      # add new internships for your ticked job types to data/queue.txt
npm run resume    # read the text out of resume PDFs (for the match score); add -- --force to redo
npm run check     # check that everything is set up
```

## Files

| File | What it is |
| --- | --- |
| `me/profile.json` | Facts about you (contact info, school, work authorization, EEO preferences) |
| `me/learned.json` | Answers you typed into orange fields, reused automatically |
| `me/secrets.json` | Your Gemini API key (keep it private) |
| `data/cover-letters/` | Exported cover letter PDFs |
| `me/resumes/*.md` | Text read from your resume PDFs, used for the match score |
| `me/portfolio.md` | Text read from your portfolio website, also used for the match score |
| `work/`, `me/work/`, `me/work.json` | Your "other work" documents, the text scanned from them and from your work links, and the list of them |
| `data/hidden.txt` | Jobs Find set aside because they don't fit your settings right now |
| `data/queue.txt` | Job links waiting to be applied to |
| `data/applications.csv` | Log of every job you submitted or skipped |
| `config.json` | Job-finder settings, plus your search cities and job radius (`jobPrefs`) |
| `data/scores.json` | Match scores for the jobs in your list (the Fit column). They're redone when your resume changes |
| `extension/` | The Chrome extension. Some of its files are rewritten by the app on start, so don't edit them by hand |

## Troubleshooting

- **"The Apply Assistant extension isn't set up in this Chrome yet":** do the one-time setup above. Until then, **Open the job anyway** opens it without the panel.
- **The job opened in the wrong Chrome profile:** jobs open in whichever Chrome profile you used last. Click into your logged-in Chrome window once, then click Start applying. The extension also has to be loaded in that profile.
- **"The Apply Assistant browser is already open":** (separate-window mode) close the other tool window or terminal first.
- **"No form fields on this page":** you're on the job description or a sign-in page. Click the site's Apply button, or sign in or create an account (Workday needs one per company), then click **Fill this page** on the form itself.
- **"Couldn't read this page":** reload the page (F5) and click **Fill this page** again.
- **A field didn't fill:** it's outlined in orange, and if the tool knew the answer, its tooltip shows it so you can enter it yourself.
