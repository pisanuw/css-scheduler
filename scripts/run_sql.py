#!/usr/bin/env python3
"""Run a .sql file against the hosted Supabase project via the Management API.

Reads the Supabase CLI's access token from the macOS keychain, so no secret is
ever written to disk or passed on the command line.

    python3 scripts/run_sql.py supabase/tests/rls_test.sql [project_ref]
"""
import json, subprocess, sys, urllib.request, urllib.error

DEFAULT_REF = "abvnaelzfriusckqqrfc"

def token() -> str:
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-w"], text=True).strip()

def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__); return 2
    path = sys.argv[1]
    ref = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_REF
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": open(path).read()}).encode(),
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            rows = json.loads(r.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:2000]}"); return 1

    if not rows:
        print("ok (no rows returned)"); return 0

    failed = 0
    for row in rows:
        if "verdict" in row:
            mark = "PASS" if row["verdict"] == "PASS" else "FAIL"
            if mark == "FAIL": failed += 1
            print(f"  [{mark}] {row['check_name']:<48} got={row['result']!r} want={row['expected']!r}")
        else:
            print(" ", row)
    if failed:
        print(f"\n{failed} check(s) FAILED"); return 1
    print(f"\nall {len(rows)} checks passed")
    return 0

if __name__ == "__main__":
    sys.exit(main())
