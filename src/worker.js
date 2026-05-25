const ADMIN_PASS = "as123";
const CATBOX_ENDPOINT = "https://apis.davidcyril.name.ng/uploader/catbox";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(renderApp(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return proxyUpload(request);
    }

    if (url.pathname === "/api/feed" && request.method === "GET") {
      return json(await listApprovedPosts(env));
    }

    if (url.pathname === "/api/comments" && request.method === "POST") {
      return addComment(request, env);
    }

    if (url.pathname === "/api/public/post" && request.method === "POST") {
      return createPublicPost(request, env);
    }

    if (url.pathname === "/api/admin/post" && request.method === "POST") {
      return createAdminPost(request, env);
    }

    if (url.pathname === "/api/admin/pending" && request.method === "GET") {
      return adminPending(request, env);
    }

    if (url.pathname === "/api/admin/approve" && request.method === "POST") {
      return adminApprove(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function proxyUpload(request) {
  const form = await request.formData();
  const outgoing = new FormData();

  const file = form.get("file");
  const directUrl = form.get("url");

  if (file) outgoing.append("file", file);
  if (typeof directUrl === "string" && directUrl.trim()) outgoing.append("url", directUrl.trim());

  if (!file && !directUrl) {
    return json({ error: "Provide file or url" }, 400);
  }

  const res = await fetch(CATBOX_ENDPOINT, { method: "POST", body: outgoing });
  const text = (await res.text()).trim();

  if (!res.ok) return json({ error: "Upload failed", details: text }, 502);

  return json({ mediaUrl: text });
}


async function createPublicPost(request, env) {
  const body = await request.json();
  if (!body.mediaUrl && !body.text) return json({ error: "text or mediaUrl required" }, 400);

  const post = {
    id: crypto.randomUUID(),
    profileName: body.profileName || "Guest",
    verified: false,
    approved: false,
    createdAt: new Date().toISOString(),
    text: body.text || "",
    mediaUrl: body.mediaUrl || "",
    mediaType: detectMedia(body.mediaUrl || ""),
    comments: [],
    isAdminPost: false,
  };

  await savePost(env, post);
  return json({ ok: true, post });
}

async function createAdminPost(request, env) {
  const body = await request.json();
  if (body.adminPass !== ADMIN_PASS) return json({ error: "Unauthorized" }, 401);
  if (!body.mediaUrl && !body.text) return json({ error: "text or mediaUrl required" }, 400);

  const post = {
    id: crypto.randomUUID(),
    profileName: "AS",
    verified: true,
    approved: true,
    createdAt: new Date().toISOString(),
    text: body.text || "",
    mediaUrl: body.mediaUrl || "",
    mediaType: detectMedia(body.mediaUrl || ""),
    comments: [],
    isAdminPost: true,
  };

  await savePost(env, post);
  return json({ ok: true, post });
}

async function adminPending(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get("pass") !== ADMIN_PASS) return json({ error: "Unauthorized" }, 401);

  const posts = await allPosts(env);
  return json(posts.filter((p) => !p.approved));
}

async function adminApprove(request, env) {
  const body = await request.json();
  if (body.adminPass !== ADMIN_PASS) return json({ error: "Unauthorized" }, 401);
  if (!body.postId) return json({ error: "postId required" }, 400);

  const post = await env.SOCIAL_KV.get(`post:${body.postId}`, "json");
  if (!post) return json({ error: "Post not found" }, 404);

  post.approved = true;
  await savePost(env, post);
  return json({ ok: true, post });
}

async function addComment(request, env) {
  const body = await request.json();
  if (!body.postId || !body.text) return json({ error: "postId and text required" }, 400);

  const post = await env.SOCIAL_KV.get(`post:${body.postId}`, "json");
  if (!post) return json({ error: "Post not found" }, 404);

  const comment = {
    id: crypto.randomUUID(),
    text: body.text,
    profileName: body.adminPass === ADMIN_PASS ? "AS" : body.profileName || "Guest",
    verified: body.adminPass === ADMIN_PASS,
    createdAt: new Date().toISOString(),
  };

  post.comments = post.comments || [];
  post.comments.push(comment);

  await savePost(env, post);
  return json({ ok: true, comment });
}

async function listApprovedPosts(env) {
  const posts = await allPosts(env);
  return posts
    .filter((p) => p.approved)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function allPosts(env) {
  const listing = await env.SOCIAL_KV.list({ prefix: "post:" });
  const posts = await Promise.all(listing.keys.map((k) => env.SOCIAL_KV.get(k.name, "json")));
  return posts.filter(Boolean);
}

async function savePost(env, post) {
  await env.SOCIAL_KV.put(`post:${post.id}`, JSON.stringify(post));
}

function detectMedia(mediaUrl) {
  const lower = mediaUrl.toLowerCase();
  if ([".mp4", ".webm", ".mov", ".mkv"].some((e) => lower.includes(e))) return "video";
  return "image";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function renderApp() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AS Social Feed</title>
  <style>
    body { font-family: Inter,system-ui,sans-serif; max-width: 900px; margin: 20px auto; padding: 0 16px; background: #0d1117; color: #e6edf3; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
    input, textarea, button { width: 100%; margin: 6px 0; padding: 10px; border-radius: 8px; border: 1px solid #30363d; background: #0d1117; color: #e6edf3; }
    button { cursor:pointer; background:#238636; border:none; font-weight:600; }
    .name { font-weight: 700; }
    .tick { color: #1f9cf0; font-size: 0.85em; margin-left: 6px; }
    img,video { max-width: 100%; border-radius: 10px; margin-top: 8px; }
    .meta { opacity: .8; font-size: 12px; }
  </style>
</head>
<body>
  <h1>AS Social Feed</h1>
  <div class="card">
    <h3>Upload Media (goes directly to catbox endpoint)</h3>
    <input id="mediaUrl" placeholder="Or paste media URL" />
    <input id="file" type="file" accept="image/*,video/*" />
    <textarea id="caption" placeholder="Caption"></textarea>
    <button onclick="submitPost()">Submit for approval</button>
    <small>Note: only admin-approved posts appear in feed.</small>
  </div>

  <div class="card">
    <h3>Admin</h3>
    <input id="adminPass" placeholder="Admin pass" type="password" />
    <button onclick="loadPending()">Load Pending</button>
    <textarea id="adminText" placeholder="Admin post text"></textarea>
    <input id="adminMedia" placeholder="Admin media URL (optional)" />
    <button onclick="adminPost()">Post as AS ✅</button>
    <div id="pending"></div>
  </div>

  <div id="feed"></div>

<script>
async function uploadMedia(file, url){
  const fd = new FormData();
  if(file) fd.append('file', file);
  if(url) fd.append('url', url);
  const r = await fetch('/api/upload', {method:'POST', body:fd});
  return r.json();
}

async function submitPost(){
  const file = document.getElementById('file').files[0];
  const mediaUrlInput = document.getElementById('mediaUrl').value.trim();
  const caption = document.getElementById('caption').value.trim();

  let mediaUrl = mediaUrlInput;
  if(file || mediaUrlInput){
    const out = await uploadMedia(file, mediaUrlInput);
    if(out.error) return alert(out.error);
    mediaUrl = out.mediaUrl;
  }

  await fetch('/api/public/post', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({text:caption, mediaUrl})});
  alert('Submitted for approval');
}

async function loadFeed(){
  const feed = await (await fetch('/api/feed')).json();
  const box = document.getElementById('feed');
  box.innerHTML = feed.map((p) => {
    const media = p.mediaUrl
      ? (p.mediaType === 'video'
          ? "<video src='" + p.mediaUrl + "' controls></video>"
          : "<img src='" + p.mediaUrl + "'/>")
      : '';
    const comments = (p.comments || [])
      .map((c) => "<p><b>" + c.profileName + (c.verified ? ' ✔' : '') + "</b>: " + c.text + "</p>")
      .join('');
    return "<div class='card'>"
      + "<div class='name'>" + p.profileName + (p.verified ? "<span class='tick'>✔ verified</span>" : '') + "</div>"
      + "<div>" + (p.text || '') + "</div>"
      + media
      + "<div class='meta'>" + new Date(p.createdAt).toLocaleString() + "</div>"
      + "<textarea id='c-" + p.id + "' placeholder='comment'></textarea>"
      + "<button onclick=\"comment('" + p.id + "')\">Comment</button>"
      + "<div>" + comments + "</div>"
      + "</div>";
  }).join('');
}

async function comment(postId){
  const text = document.getElementById('c-'+postId).value;
  const adminPass = document.getElementById('adminPass').value;
  await fetch('/api/comments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postId,text,adminPass})});
  loadFeed();
}

async function loadPending(){
  const pass = document.getElementById('adminPass').value;
  const pending = await (await fetch('/api/admin/pending?pass='+encodeURIComponent(pass))).json();
  const box = document.getElementById('pending');
  if(pending.error){ box.innerHTML = pending.error; return; }
  box.innerHTML = pending.map(p=>`<div><b>${p.text||'No text'}</b> <button onclick="approve('${p.id}')">Approve</button></div>`).join('');
}

async function approve(postId){
  const adminPass = document.getElementById('adminPass').value;
  await fetch('/api/admin/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adminPass,postId})});
  loadPending(); loadFeed();
}

async function adminPost(){
  const adminPass = document.getElementById('adminPass').value;
  const text = document.getElementById('adminText').value;
  const mediaUrl = document.getElementById('adminMedia').value;
  await fetch('/api/admin/post',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adminPass,text,mediaUrl})});
  loadFeed();
}

loadFeed();
</script>
</body>
</html>`;
}
