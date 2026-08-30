#!/usr/bin/env node
/**
 * One-time helper to mint a Google refresh token for physics@sjabrankamran.com
 * so the portal can read Google Drive + Google Classroom.
 *
 * It runs a tiny local web server on http://localhost:53682 to catch the OAuth
 * redirect, so you must run it on a computer with a browser (your HP laptop is
 * ideal). Steps:
 *
 *   1) In Google Cloud Console → APIs & Services → Enabled APIs, enable:
 *        - Google Drive API
 *        - Google Classroom API
 *   2) OAuth consent screen → add your email as a Test user (or publish).
 *   3) Credentials → Create OAuth client ID → Application type: "Web application".
 *        Add Authorized redirect URI:  http://localhost:53682/oauth2callback
 *      Copy the Client ID and Client secret.
 *   4) Run:
 *        GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/google-connect.mjs
 *      A browser opens; sign in as physics@sjabrankamran.com and approve.
 *   5) Copy the printed GOOGLE_REFRESH_TOKEN into Vercel → Project → Settings →
 *      Environment Variables (with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
 *      then redeploy. Done — the "Import from Google" panel goes live.
 */
import http from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first. See the header of this file.");
  process.exit(1);
}

const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
}).toString();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== "/oauth2callback") { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get("code");
  if (!code) { res.writeHead(400); res.end("No code."); return; }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const j = await r.json();
    if (j.refresh_token) {
      console.log("\n================ SUCCESS ================");
      console.log("GOOGLE_REFRESH_TOKEN=" + j.refresh_token);
      console.log("========================================");
      console.log("Add this (plus GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) to Vercel env, then redeploy.\n");
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h2>Connected. You can close this tab and return to the terminal.</h2>");
    } else {
      console.error("No refresh_token returned:", j);
      res.writeHead(500); res.end("No refresh token. Re-run with prompt=consent (this script already sets it).");
    }
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end("Error: " + e.message);
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser (sign in as physics@sjabrankamran.com):\n");
  console.log(authUrl + "\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${authUrl}"`, () => {});
});
