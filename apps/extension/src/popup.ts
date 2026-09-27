import { APP_URL } from "./shared";
import type { Status } from "./shared";

const statusEl = document.getElementById("status")!;
const actions = document.getElementById("actions")!;

chrome.runtime.sendMessage({ type: "status" }, (s: Status) => {
  if (!s || !s.connected) {
    statusEl.innerHTML = `<span class="bad">Not connected.</span><div class="muted">Open the host panel and click “Connect extension”.</div>`;
    actions.innerHTML = `<a class="btn" href="${APP_URL}/host" target="_blank">Open host panel</a>`;
    return;
  }
  const who = s.user?.name ?? s.user?.email ?? "host";
  const live = s.session ? `Room ${s.session.room} · <span class="ok">Live</span>` : `<span class="muted">No live session</span>`;
  statusEl.innerHTML = `<span class="ok">Connected as ${who}</span><br/>${live}${s.lastSlide ? `<div class="muted">Last slide: ${s.lastSlide}</div>` : ""}`;
  actions.innerHTML = `<button id="out">Disconnect</button>`;
  document.getElementById("out")!.addEventListener("click", () => chrome.runtime.sendMessage({ type: "signout" }, () => window.close()));
});
