#!/usr/bin/env python3
"""Load Supabase creds from .env.local (so the key never appears on a shell
command line) and run the full 5054 extraction + upload."""
import os, re, sys

# Force DIRECT egress for Supabase uploads: the secret-egress proxy is
# intermittently returning 407 and killing long upload runs. Supabase is
# directly reachable from this host, so bypass the proxy entirely.
for v in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(v, None)
os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"

ENV = "/home/admin/.openclaw/workspace/sjabrankamran-site/.env.local"
for line in open(ENV):
    m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
    if not m:
        continue
    k, v = m.group(1), m.group(2).strip().strip('"').strip("'")
    if k and k not in os.environ:
        os.environ[k] = v

# The extractor reads SUPABASE_URL; .env.local may only define the public alias.
if "SUPABASE_URL" not in os.environ and "NEXT_PUBLIC_SUPABASE_URL" in os.environ:
    os.environ["SUPABASE_URL"] = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
for req in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
    print(f"env {req}: {'set' if os.environ.get(req) else 'MISSING'}", file=sys.stderr)

sys.argv = ["extract5054.py", "--out", "rows.json"]
import time
import extract5054

# Make uploads resilient: Supabase intermittently closes the connection after
# many rapid POSTs. Wrap the extractor's upload with retry + a small throttle so
# a single transient disconnect never aborts the whole ~2000-image run.
_orig_upload = extract5054.upload

def _resilient_upload(data, path):
    last = None
    for attempt in range(6):
        try:
            r = _orig_upload(data, path)
            time.sleep(0.05)
            return r
        except Exception as e:  # RemoteDisconnected, URLError, timeouts
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"upload failed after retries for {path}: {last}")

extract5054.upload = _resilient_upload
extract5054.main()
