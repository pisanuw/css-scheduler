# Session log — 25 September 2026

A verbatim record of the prompts that drove this project's first session,
together with every question asked back and the answer given. Kept so the
reasoning behind the schema and the architecture is recoverable later, when
"why is the baseline 8?" is no longer obvious.

Prompts are reproduced as written. Options that were offered but not chosen are
listed too — what was rejected is often the more useful half of a decision
record.

---

## Decisions at a glance

| Decision | Chosen | Alternatives declined |
| --- | --- | --- |
| Preference collection | Instructors self-serve | Coordinator enters everything; import now, self-serve later |
| Assignment method | Manual board + conflict detection | Automated solver only; solver-assisted |
| Stack | React SPA on Netlify + Supabase | Next.js; separate API on Render |
| Course scope | Undergraduate only | All CSS incl. graduate; only courses actually offered |
| Meeting times | Standard grid + custom override | Free-form days/times; fixed grid only |
| Preference fields | All four groups | — (multi-select, all chosen) |
| Load counting | Course count per instructor | Credit-based; both with course count primary |
| Draft handling | Named draft scenarios | Single schedule with history; single + snapshots |
| Database | Hosted Supabase project | Local only; keep building offline |
| Build order | Preference collection first | Assignment board; time-schedule import |
| Deployment | Deploy to Netlify immediately | Connect GitHub for auto-deploy; wait for OAuth |
| Google credentials | Put in `.env`, agent configures | Paste into Supabase dashboard; paste in chat |
| Chair access | Full coordinator | Read-only across everything; coordinator then tighten |
| Maintainer access | Keep as coordinator | Step down after handover; step down now |

---

## 1. Opening brief

**Yusuf Pisan types:**

> I want to create a web app that can be used to assign instructors to courses. Scheduling is a difficult problem. All instructors have their own preferences in terms of classes they would like to teach, what quarter they would like to teach, what time slot or day they would like to teach.
>
> The program will be used primarily for UWB CSS . The list of courses are at https://www.washington.edu/students/crscatb/css.html
>
> The list of CSS instructors are at https://www.uwb.edu/stem/faculty/css-faculty
>
> The web app will use Google OAuth, probably netlify or render for the web server and supabase for the backend
>
> The coordinator will need to enter the list of courses that are getting taught each quarter Autumn, Winter, Spring. The courses may also come with specific timeslots as well
>
> This is a big project, multiple iterations will be required, ask me questions as you need them

### Questions asked — round 1

**Who enters instructor preferences into the system?**
- ✅ **Instructors self-serve** — each signs in with their UW Google account and fills in their own; coordinator opens and closes a window
- Coordinator enters everything
- Both — import now, self-serve later

**How should assignments actually get made?**
- ✅ **Manual board + conflict detection** — drag instructors onto sections, with violations flagged continuously
- Automated solver only
- Solver-assisted (manual + suggest)

**Which stack shape do you want?**
- ✅ **React SPA on Netlify + Supabase** — no backend server to write or maintain
- Next.js on Netlify + Supabase
- React frontend + separate API on Render

**What scope of courses and instructors should v1 cover?**
- Everything CSS teaches
- ✅ **Undergraduate only** — CSS 100–499
- Only courses actually offered

### Questions asked — round 2

**How should meeting times be modeled?**
- ✅ **Standard grid + custom override** — a configurable table of named slots, plus an escape hatch
- Free-form days + start/end time
- Fixed grid only

**What should instructors be able to express in their preference submission?** *(multi-select)*
- ✅ Course preferences
- ✅ Quarter & load
- ✅ Days, times & modality
- ✅ Soft extras

**How should teaching load be counted and enforced?**
- ✅ **Course count per instructor** — annual target plus a per-quarter maximum
- Credit-based totals
- Both, course count primary

**Does the coordinator need to try out competing versions of a schedule?**
- ✅ **Named draft scenarios** — develop several in parallel, mark one official
- Single schedule with history
- Single schedule + snapshots

### Questions asked — round 3

**How do you want the database set up?**
- ✅ **Create a hosted Supabase project** — agent creates it, applies migrations and seed
- Local only for now (Docker)
- Neither yet — keep building offline

**Which part should I build next?**
- ✅ **Preference collection** — the instructor form, cycles, response dashboard
- The assignment board
- Import a quarter from the time schedule

---

## 2. Commit and push

**Yusuf Pisan types:**

> commit and push

---

## 3. Where is it deployed

**Yusuf Pisan types:**

> Where is the live app on the web?

Sent mid-turn. The answer at the time: the Supabase backend was live, the
frontend had only ever run on `localhost:5173`.

### Question asked

**Want me to deploy the frontend now?**
- ✅ **Deploy to Netlify now** — plus add the new domain to Supabase's redirect allow-list
- Connect the GitHub repo to Netlify instead (auto-deploy on push)
- Hold off until Google OAuth is set up

---

## 4. Sign-in failing

**Yusuf Pisan types:**

> https://abvnaelzfriusckqqrfc.supabase.co/auth/v1/callback is authorized in google but I get {"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}

Diagnosis: the error came from Supabase, not Google. The Google provider was
still disabled there with no client ID or secret. The Google-side work had been
done correctly but could not take effect on its own.

### Question asked

**How should the Google client ID and secret get into Supabase?**
- ✅ **Put them in `.env`, agent configures it** — secret stays on the machine, never enters the transcript
- Paste them into the Supabase dashboard
- Paste them in chat

---

## 5. Clarifying the Supabase field

**Yusuf Pisan types:**

> What is the "Client IDs" for supabase when enabling Google provider

Answered from the Supabase docs: the field is plural because it accepts a
comma-separated list, one client per platform (Web, iOS, Android, Chrome
Extension). For a web-only app it is a single Web-application client ID, with
the web client's secret in the separate **Client Secret** field. If mobile
clients are added later, the web client ID must come first in the list.

---

## 6. Credentials supplied

**Yusuf Pisan types:**

> added them

An earlier probe had reported `redirect_uri_mismatch` on that client. That was
a false alarm: Google takes minutes to hours to propagate redirect-URI changes,
and the probe ran inside that window. By the time the provider was enabled the
URI was accepted and sign-in worked.

---

## 7. Access roles

**Yusuf Pisan types:**

> Min Chen <minchen2@uw.edu> is the coordinator
> Geetha Thamilarasu <geetha@uw.edu> is the dpeartment chair should have access to all
>
> Update this information

### Questions asked

**What should "access to all" mean for Geetha as department chair?**
- See everything, change nothing (a read-only role, needing a small migration)
- ✅ **Full coordinator, same as Min Chen**
- Full coordinator for now, tighten later

**What happens to your own access, now that Min Chen is coordinator?**
- ✅ **Keep me as coordinator too** — the only account in existence at the time
- Step me down once Min Chen has signed in
- Step me down to instructor now

---

## 8. Teaching load

**Yusuf Pisan types:**

> Teaching track professors teach 8 courses, tenure track teach 5 courses, but individual load can vary due to teaching releases that course coordinator adds

Corrected the seeded baselines, which had been guesses of 6 and 4. Releases
were modelled as rows the coordinator adds rather than an edit to a single
number, so the reason survives and a release granted for one year does not
carry into the next.

---

## 9. Access log

**Yusuf Pisan types:**

> Add a log so as admin I can see who has logged in to the system

Supabase's own `auth.audit_log_entries` was empty, so no sign-in history
existed to read. A trigger on `auth.users` now records it.

---

## 10. This document

**Yusuf Pisan types:**

> Create an md file of all my prompts to you in this session including the questions you asked me and the answers. Commit the file to the repo.

---

## 11. Attribution in the log

**Yusuf Pisan types:**

> For each section, such as before "I want to create a web app..." include in bold
> Yusuf Pisan types:

---

## Notes

- 11 prompts, 14 questions across 6 rounds of clarification.
- One assistant turn was interrupted mid-stream by the harness and resumed; no
  prompt was involved, so it is not listed above.
- Corrections made during the session, recorded because they changed the work:
  the teaching-load baselines were wrong until prompt 8; an RLS hardening step
  looked correct but broke every policy and was caught by a test; the first
  Netlify deploy failed silently with an expired token and was caught by
  comparing the served asset hash against the local build.
