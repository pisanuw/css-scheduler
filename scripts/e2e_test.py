#!/usr/bin/env python3
"""End-to-end test against the hosted Supabase project.

Creates a throwaway uw.edu user through the real auth API, signs in, runs the
queries and writes the app actually makes, checks what an instructor may and
may not see, then deletes everything it created.

    npm run test:e2e
"""
import json, subprocess, sys, urllib.request, urllib.error

REF  = "abvnaelzfriusckqqrfc"
URL  = f"https://{REF}.supabase.co"
MGMT = "https://api.supabase.com"
PUB  = "sb_publishable_71_-uGHRKjaXisg8DLjmjw_dVMFbYsa"
EMAIL, PW = "e2e-test@uw.edu", "Test-passw0rd-e2e!"

results = []
def check(label, ok, detail=""):
    results.append((label, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {label:<52}{(' ' + detail) if detail else ''}")

def mgmt_token():
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"], text=True).strip()

def call(url, data=None, headers=None, method="GET"):
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data is not None else None,
        headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

def main() -> int:
    MH = {"Authorization": f"Bearer {mgmt_token()}", "Content-Type": "application/json"}
    st, keys = call(f"{MGMT}/v1/projects/{REF}/api-keys?reveal=true", headers=MH)
    if st != 200:
        print("could not read api keys:", st, keys); return 1
    svc = next((k["api_key"] for k in keys if k.get("name") == "service_role" or k.get("type") == "secret"), None)
    if not svc:
        print("no service_role key"); return 1
    SH = {"apikey": svc, "Authorization": f"Bearer {svc}", "Content-Type": "application/json"}

    def purge():
        st, users = call(f"{URL}/auth/v1/admin/users?per_page=200", headers=SH)
        for u in (users or {}).get("users", []):
            if u["email"] in (EMAIL, "outsider@gmail.com"):
                call(f"{URL}/auth/v1/admin/users/{u['id']}", headers=SH, method="DELETE")
        call(f"{URL}/rest/v1/preference_submissions?note_to_coordinator=eq.e2e%20test",
             headers=SH, method="DELETE")
        # The throwaway account also lands in access_log, and those rows
        # outlive the account by design. Purge them or the real log fills
        # with phantom sign-ins, one per run.
        call(f"{URL}/rest/v1/access_log?email=eq.{EMAIL}", headers=SH, method="DELETE")
    purge()

    print("\nauth")
    st, created = call(f"{URL}/auth/v1/admin/users",
                       {"email": EMAIL, "password": PW, "email_confirm": True}, SH, "POST")
    check("uw.edu signup accepted", st in (200, 201), f"http={st}")
    if st not in (200, 201):
        print(created); return 1
    uid = created["id"]

    st, prof = call(f"{URL}/rest/v1/profiles?select=id,role,instructor_id&id=eq.{uid}", headers=SH)
    check("signup trigger created a profile", st == 200 and len(prof) == 1)

    st, blocked = call(f"{URL}/auth/v1/admin/users",
                       {"email": "outsider@gmail.com", "password": PW, "email_confirm": True}, SH, "POST")
    check("non-uw.edu signup rejected", st not in (200, 201), f"http={st}")
    if st in (200, 201):
        call(f"{URL}/auth/v1/admin/users/{blocked['id']}", headers=SH, method="DELETE")

    # Link the throwaway account to an instructor so it can own a submission.
    st, inst = call(f"{URL}/rest/v1/instructors?select=id&full_name=eq.Clark%20Olson", headers=SH)
    instructor_id = inst[0]["id"]
    call(f"{URL}/rest/v1/profiles?id=eq.{uid}", {"instructor_id": instructor_id},
         {**SH, "Prefer": "return=minimal"}, "PATCH")

    st, tok = call(f"{URL}/auth/v1/token?grant_type=password", {"email": EMAIL, "password": PW},
                   {"apikey": PUB, "Content-Type": "application/json"}, "POST")
    check("password sign-in", st == 200, f"http={st}")
    if st != 200:
        print(tok); return 1
    AH = {"apikey": PUB, "Authorization": f"Bearer {tok['access_token']}", "Content-Type": "application/json"}

    print("\nreads an instructor should be able to do")
    for label, path, want in [
        ("course catalog",      "courses?select=*&level=eq.undergraduate", 80),
        ("instructor roster",   "instructors?select=*",                    76),
        ("time slot grid",      "time_slots?select=*",                     42),
        ("teaching history",    "teaching_history?select=id",             199),
        ("open preference cycle", "preference_cycles?select=*&status=eq.open", 1),
    ]:
        st, d = call(f"{URL}/rest/v1/{path}", headers=AH)
        check(label, st == 200 and len(d) == want, f"got {len(d) if st==200 else st}, want {want}")

    print("\nreads an instructor should NOT be able to do")
    for label, path in [("draft scenarios hidden", "scenarios?select=*"),
                        ("other people's submissions hidden", "preference_submissions?select=*"),
                        ("section_meetings view hidden", "section_meetings?select=*"),
                        ("access log hidden", "access_log?select=id"),
                        ("access summary hidden", "access_summary?select=email")]:
        st, d = call(f"{URL}/rest/v1/{path}", headers=AH)
        check(label, st == 200 and len(d) == 0, f"got {len(d) if st==200 else st} rows")

    print("\nsubmission round-trip (the write path the form uses)")
    st, cyc = call(f"{URL}/rest/v1/preference_cycles?select=id,academic_year_id&status=eq.open", headers=AH)
    cycle_id, ay = cyc[0]["id"], cyc[0]["academic_year_id"]
    st, terms = call(f"{URL}/rest/v1/terms?select=id,quarter&academic_year_id=eq.{ay}&order=sort_order", headers=AH)
    st, courses = call(f"{URL}/rest/v1/courses?select=id,code&number=in.(343,430,486)", headers=AH)

    st, sub = call(
        f"{URL}/rest/v1/preference_submissions?on_conflict=cycle_id,instructor_id&select=*",
        {"cycle_id": cycle_id, "instructor_id": instructor_id, "status": "draft",
         "blocked_days": [5], "preferred_times": ["midday"], "modality_prefs": ["in_person"],
         "max_new_preps": 1, "note_to_coordinator": "e2e test"},
        {**AH, "Prefer": "resolution=merge-duplicates,return=representation"}, "POST")
    check("upsert own submission", st in (200, 201), f"http={st}")
    if st not in (200, 201):
        print(sub); purge(); return 1
    sid = sub[0]["id"]

    st, _ = call(f"{URL}/rest/v1/preference_courses",
                 [{"submission_id": sid, "course_id": c["id"], "tier": t}
                  for c, t in zip(courses, ["eager", "willing", "reluctant"])],
                 {**AH, "Prefer": "return=minimal"}, "POST")
    check("insert course ratings", st in (200, 201), f"http={st}")

    st, _ = call(f"{URL}/rest/v1/preference_terms",
                 [{"submission_id": sid, "term_id": t["id"], "available": t["quarter"] != "winter",
                   "desired_course_count": 0 if t["quarter"] == "winter" else 2,
                   "leave_reason": "sabbatical" if t["quarter"] == "winter" else None}
                  for t in terms],
                 {**AH, "Prefer": "return=minimal"}, "POST")
    check("insert quarter availability", st in (200, 201), f"http={st}")

    st, back = call(f"{URL}/rest/v1/preference_submissions"
                    f"?select=*,preference_courses(course_id,tier),preference_terms(term_id,available,desired_course_count)"
                    f"&id=eq.{sid}", headers=AH)
    ok = (st == 200 and len(back) == 1
          and len(back[0]["preference_courses"]) == 3
          and len(back[0]["preference_terms"]) == 3
          and back[0]["blocked_days"] == [5]
          and back[0]["max_new_preps"] == 1)
    check("read back with children intact", ok)

    st, _ = call(f"{URL}/rest/v1/preference_submissions?id=eq.{sid}",
                 {"status": "submitted"}, {**AH, "Prefer": "return=minimal"}, "PATCH")
    check("mark submitted", st in (200, 204), f"http={st}")

    print("\nwrites an instructor should NOT be able to do")
    st, _ = call(f"{URL}/rest/v1/courses?number=eq.343", {"title": "tampered"},
                 {**AH, "Prefer": "return=representation"}, "PATCH")
    st2, after = call(f"{URL}/rest/v1/courses?select=title&number=eq.343", headers=SH)
    check("cannot edit the catalog", after[0]["title"] != "tampered")

    st, _ = call(f"{URL}/rest/v1/profiles?id=eq.{uid}", {"role": "coordinator"},
                 {**AH, "Prefer": "return=minimal"}, "PATCH")
    st2, who = call(f"{URL}/rest/v1/profiles?select=role&id=eq.{uid}", headers=SH)
    check("cannot promote self to coordinator", who[0]["role"] != "coordinator", f"role={who[0]['role']}")

    print("\ncleanup")
    call(f"{URL}/rest/v1/preference_submissions?id=eq.{sid}", headers=SH, method="DELETE")
    # Belt and braces: drop anything this suite tagged, in case an earlier run
    # died before reaching here.
    call(f"{URL}/rest/v1/preference_submissions?note_to_coordinator=eq.e2e%20test",
         headers=SH, method="DELETE")
    call(f"{URL}/auth/v1/admin/users/{uid}", headers=SH, method="DELETE")
    call(f"{URL}/rest/v1/access_log?email=eq.{EMAIL}", headers=SH, method="DELETE")

    # Scoped to rows THIS suite created. Asserting the tables are empty breaks
    # as soon as a real person signs in, which is exactly what happened once.
    st, left = call(f"{URL}/auth/v1/admin/users?per_page=200", headers=SH)
    stray_users = [u for u in (left or {}).get("users", []) if u["email"] == EMAIL]
    st2, subs = call(f"{URL}/rest/v1/preference_submissions?select=id&id=eq.{sid}", headers=SH)
    st3, profs = call(f"{URL}/rest/v1/profiles?select=id&id=eq.{uid}", headers=SH)
    st4, logs = call(f"{URL}/rest/v1/access_log?select=id&email=eq.{EMAIL}", headers=SH)
    check("no residue left behind",
          len(stray_users) == 0 and len(subs) == 0 and len(profs) == 0 and len(logs) == 0,
          f"{len(stray_users)} users, {len(subs)} submissions, {len(profs)} profiles, {len(logs)} log rows")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
