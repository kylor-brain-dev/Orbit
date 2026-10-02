const tabsElement = document.getElementById("tabs");
const address = document.getElementById("address");
const addressForm = document.getElementById("addressForm");

const back = document.getElementById("back");
const forward = document.getElementById("forward");
const reload = document.getElementById("reload");
const home = document.getElementById("home");
const newTab = document.getElementById("newTab");
const menu = document.getElementById("menu");

const status = document.getElementById("status");
const security = document.getElementById("security");

let tabs = [];
let activeTab = null;

function renderTabs() {
  tabsElement.innerHTML = "";

  for (const tab of tabs) {
    const element = document.createElement("div");

    element.className =
      "tab" + (tab.active ? " active" : "");

    element.dataset.id = tab.id;

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";

    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";

    close.addEventListener("click", event => {
      event.stopPropagation();
      window.orbit.closeTab(tab.id);
    });

    element.appendChild(title);
    element.appendChild(close);

    element.addEventListener("click", () => {
      window.orbit.activateTab(tab.id);
    });

    tabsElement.appendChild(element);
  }
}

function setAddress(url) {
  if (!url) return;

  address.value = url;

  try {
    const parsed = new URL(url);

    if (parsed.protocol === "https:") {
      security.textContent = "🔒";
    } else if (parsed.protocol === "http:") {
      security.textContent = "⚠";
    } else {
      security.textContent = "●";
    }
  } catch {
    security.textContent = "●";
  }
}

function submitAddress() {
  if (!activeTab) return;

  const value = address.value.trim();

  if (!value) return;

  window.orbit.navigate(activeTab, value);
}

addressForm.addEventListener("submit", event => {
  event.preventDefault();
  submitAddress();
});

back.addEventListener("click", () => {
  window.orbit.back();
});

forward.addEventListener("click", () => {
  window.orbit.forward();
});

reload.addEventListener("click", () => {
  window.orbit.reload();
});

home.addEventListener("click", () => {
  window.orbit.home();
});

newTab.addEventListener("click", () => {
  window.orbit.newTab();
});

menu.addEventListener("click", () => {
  status.textContent =
    "Orbit Browser • Real Chromium • " +
    tabs.length +
    " tab" +
    (tabs.length === 1 ? "" : "s");
});

address.addEventListener("focus", () => {
  address.select();
});

window.orbit.onTabs(nextTabs => {
  tabs = nextTabs;

  const active = tabs.find(tab => tab.active);

  if (active) {
    activeTab = active.id;

    if (document.activeElement !== address) {
      setAddress(active.url);
    }
  }

  renderTabs();
});

window.orbit.onNavigation(data => {
  if (data.id !== activeTab) return;

  setAddress(data.url);

  back.disabled = !data.canGoBack;
  forward.disabled = !data.canGoForward;

  reload.textContent = data.loading ? "×" : "↻";
});

window.orbit.onDownload(data => {
  status.textContent =
    `Download: ${data.filename} — ${data.state}`;
});

window.orbit.onError(data => {
  status.textContent = data.message || "Page failed to load.";
});

document.addEventListener("keydown", event => {
  if (!event.ctrlKey) return;

  if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    address.focus();
    address.select();
  }

  if (event.key.toLowerCase() === "t") {
    event.preventDefault();
    window.orbit.newTab();
  }

  if (event.key.toLowerCase() === "w") {
    event.preventDefault();

    if (activeTab) {
      window.orbit.closeTab(activeTab);
    }
  }

  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    window.orbit.reload();
  }

  if (event.key === "Tab") {
    event.preventDefault();

    if (tabs.length < 2) return;

    const index = tabs.findIndex(
      tab => tab.id === activeTab
    );

    const next = tabs[(index + 1) % tabs.length];

    window.orbit.activateTab(next.id);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  address.focus();
});
