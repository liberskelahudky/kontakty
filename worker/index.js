/**
 * LL Kontakty — Cloudflare Worker (ukládání bez tokenu)
 * ----------------------------------------------------
 * Stránka pošle PIN + změněné soubory, Worker ověří PIN proti data.json
 * v repozitáři a uloží soubory na GitHub. GitHub token zná jen Worker.
 *
 * NASTAVENÍ VE WORKERU (Settings → Variables and Secrets):
 *   GH_TOKEN  (Secret)  = fine-grained token: liberskelahudky/kontakty, Contents: Read and write
 *
 * API:  POST /  {pin:"1234", files:[{path:"data.json"|"fotky/x.jpg", content:"<base64>", message:"..."}]}
 *       POST /  {pin:"1234", check:true}   → jen ověří PIN
 *       GET  /                              → aktuální data.json
 */
const OWNER = "liberskelahudky", REPO = "kontakty", BRANCH = "main";
const ALLOWED_ORIGINS = ["https://liberskelahudky.github.io"];
const SALT = "LL-kontakty:";

function cyrb(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const pinHash = p => cyrb(SALT + p, 7) + cyrb(SALT + p, 131);

// jednoduchá brzda proti hádání PINu (v paměti instance)
const fails = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!env.GH_TOKEN) return json({ ok: false, error: "no_token" }, 500);
    const ghRaw = path => fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
      headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github.raw+json", "User-Agent": "ll-kontakty-worker" },
    });
    // GET → aktuální data.json (bez čekání na GitHub Pages), používá se při úpravách
    if (request.method === "GET") {
      const r = await ghRaw("data.json");
      if (!r.ok) return json({ ok: false, error: "github_" + r.status }, 502);
      return new Response(await r.text(), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    }
    if (request.method !== "POST") return json({ ok: false }, 405);

    const ip = request.headers.get("CF-Connecting-IP") || "x";
    const f = fails.get(ip);
    if (f && f.n >= 8 && Date.now() - f.t < 10 * 60 * 1000) return json({ ok: false, error: "too_many" }, 429);

    let body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400); }
    const pin = String(body.pin || "");

    const gh = (path, init = {}) => fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
      ...init,
      headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "ll-kontakty-worker", ...(init.headers || {}) },
    });

    // ověření PINu proti aktuálnímu data.json v repozitáři
    const cur = await gh(`data.json?ref=${BRANCH}`, { headers: { Accept: "application/vnd.github.raw+json" } });
    if (!cur.ok) return json({ ok: false, error: "github_" + cur.status }, 502);
    const curData = await cur.json();
    if (!pin || pinHash(pin) !== curData.pinHash) {
      const g = fails.get(ip) || { n: 0, t: Date.now() }; g.n++; g.t = Date.now(); fails.set(ip, g);
      return json({ ok: false, error: "bad_pin" }, 403);
    }
    fails.delete(ip);
    if (body.check) return json({ ok: true });

    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length || files.length > 20) return json({ ok: false, error: "bad_files" }, 400);
    for (const fl of files) {
      if (!(fl.path === "data.json" || /^fotky\/[A-Za-z0-9_-]+\.jpg$/.test(fl.path))) return json({ ok: false, error: "bad_path" }, 400);
      if (typeof fl.content !== "string" || fl.content.length > 3_000_000) return json({ ok: false, error: "too_big" }, 400);
    }
    // fotky nejdřív, data.json nakonec
    files.sort((a, b) => (a.path === "data.json") - (b.path === "data.json"));
    for (const fl of files) {
      let sha;
      const g = await gh(`${fl.path}?ref=${BRANCH}`);
      if (g.status === 200) sha = (await g.json()).sha;
      const r = await gh(fl.path, { method: "PUT", body: JSON.stringify({ message: String(fl.message || "Úprava kontaktů").slice(0, 200), content: fl.content, branch: BRANCH, sha }) });
      if (!r.ok) return json({ ok: false, error: "github_" + r.status, path: fl.path }, 502);
    }
    return json({ ok: true });
  },
};
