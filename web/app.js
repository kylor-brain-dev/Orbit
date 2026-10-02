const state = {
  tabs: [
    {
      id: crypto.randomUUID(),
      title: "New Tab",
      url: "",
      history: [],
      historyIndex: -1
    }
  ],
  activeTabId: null,
  externalUrl: ""
};

state.activeTabId = state.tabs[0].id;

const modal = document.getElementById("modal");
const browser = document.querySelector(".browser");
const tabsElement = document.getElementById("tabs");
const address = document.getElementById("address");
const addressForm = document.getElementById("addressForm");
const search = document.getElementById("search");
const searchForm = document.getElementById("searchForm");
const newTabPage = document.getElementById("newTabPage");
const pageFrame = document.getElementById("pageFrame");
const blockedPage = document.getElementById("blockedPage");
const status = document.getElementById("status");

function activeTab() {
  return state.tabs.find(tab => tab.id === state.activeTabId);
}

function normalizeInput(value) {
  const input = value.trim();

  if (!input) {
    return "";
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)) {
    return `https://${input}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

function renderTabs() {
  tabsElement.innerHTML = "";

  for (const tab of state.tabs) {
    const element = document.createElement("div");
    element.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";

    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Close tab";

    close.addEventListener("click", event => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    element.append(title, close);

    element.addEventListener("click", () => {
      activateTab(tab.id);
    });

    tabsElement.appendChild(element);
  }
}

function activateTab(id) {
  const tab = state.tabs.find(item => item.id === id);

  if (!tab) {
    return;
  }

  state.activeTabId = id;
  renderTabs();
  renderActiveTab();
}

function createTab(url = "") {
  const tab = {
    id: crypto.randomUUID(),
    title: "New Tab",
    url: "",
    history: [],
    historyIndex: -1
  };

  state.tabs.push(tab);
  state.activeTabId = tab.id;

  renderTabs();
  renderActiveTab();

  if (url) {
    navigate(url);
  }
}

function closeTab(id) {
  const index = state.tabs.findIndex(tab => tab.id === id);

  if (index === -1) {
    return;
  }

  state.tabs.splice(index, 1);

  if (state.tabs.length === 0) {
    createTab();
    return;
  }

  if (state.activeTabId === id) {
    const replacement = state.tabs[Math.max(0, index - 1)];
    state.activeTabId = replacement.id;
  }

  renderTabs();
  renderActiveTab();
}

function showNewTab() {
  newTabPage.classList.remove("hidden");
  pageFrame.classList.add("hidden");
  blockedPage.classList.add("hidden");

  address.value = "";

  status.textContent = "Ready";
}

function showFrame(url) {
  newTabPage.classList.add("hidden");
  blockedPage.classList.add("hidden");
  pageFrame.classList.remove("hidden");

  pageFrame.src = url;

  status.textContent = `Loading ${url}`;
}

function showBlocked(url) {
  newTabPage.classList.add("hidden");
  pageFrame.classList.add("hidden");
  blockedPage.classList.remove("hidden");

  state.externalUrl = url;
  status.textContent = "Embedded viewing unavailable";
}

function renderActiveTab() {
  const tab = activeTab();

  if (!tab) {
    return;
  }

  address.value = tab.url || "";

  if (!tab.url) {
    showNewTab();
    return;
  }

  showFrame(tab.url);
}

function navigate(rawUrl, addHistory = true) {
  const url = normalizeInput(rawUrl);

  if (!url) {
    return;
  }

  const tab = activeTab();

  if (!tab) {
    return;
  }

  tab.url = url;
  tab.title = getTitle(url);

  if (addHistory) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex++;
  }

  address.value = url;

  renderTabs();
  showFrame(url);
}

function getTitle(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "www.google.com") {
      return "Google";
    }

    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Orbit";
  }
}

function goBack() {
  const tab = activeTab();

  if (!tab || tab.historyIndex <= 0) {
    status.textContent = "No previous page";
    return;
  }

  tab.historyIndex--;
  tab.url = tab.history[tab.historyIndex];

  renderTabs();
  renderActiveTab();
}

function goForward() {
  const tab = activeTab();

  if (!tab || tab.historyIndex >= tab.history.length - 1) {
    status.textContent = "No next page";
    return;
  }

  tab.historyIndex++;
  tab.url = tab.history[tab.historyIndex];

  renderTabs();
  renderActiveTab();
}

function reload() {
  const tab = activeTab();

  if (!tab || !tab.url) {
    return;
  }

  pageFrame.src = tab.url;
  status.textContent = "Reloading";
}

function home() {
  const tab = activeTab();

  if (!tab) {
    return;
  }

  tab.url = "";
  tab.title = "New Tab";

  renderTabs();
  renderActiveTab();
}

function bookmarkCurrent() {
  const tab = activeTab();

  if (!tab || !tab.url) {
    status.textContent = "Nothing to bookmark";
    return;
  }

  const bookmarks = JSON.parse(localStorage.getItem("orbitBookmarks") || "[]");

  if (!bookmarks.some(item => item.url === tab.url)) {
    bookmarks.push({
      title: tab.title,
      url: tab.url
    });

    localStorage.setItem("orbitBookmarks", JSON.stringify(bookmarks));
    status.textContent = "Bookmark saved";
  } else {
    status.textContent = "Already bookmarked";
  }
}

document.getElementById("openOrbit").addEventListener("click", () => {
  modal.classList.remove("hidden");
  address.focus();
});

document.getElementById("closeOrbit").addEventListener("click", () => {
  modal.classList.add("hidden");
});

document.getElementById("minimize").addEventListener("click", () => {
  browser.style.display = "none";

  setTimeout(() => {
    browser.style.display = "";
  }, 350);
});

document.getElementById("maximize").addEventListener("click", () => {
  browser.classList.toggle("maximized");
});

document.getElementById("back").addEventListener("click", goBack);
document.getElementById("forward").addEventListener("click", goForward);
document.getElementById("reload").addEventListener("click", reload);
document.getElementById("home").addEventListener("click", home);
document.getElementById("newTab").addEventListener("click", () => createTab());
document.getElementById("bookmark").addEventListener("click", bookmarkCurrent);

addressForm.addEventListener("submit", event => {
  event.preventDefault();
  navigate(address.value);
});

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  navigate(search.value);
  search.value = "";
});

document.querySelectorAll(".quick-actions button").forEach(button => {
  button.addEventListener("click", () => {
    createTab(button.dataset.url);
  });
});

document.getElementById("openExternal").addEventListener("click", () => {
  if (state.externalUrl) {
    window.open(state.externalUrl, "_blank", "noopener,noreferrer");
  }
});

pageFrame.addEventListener("load", () => {
  status.textContent = "Page loaded";
});

pageFrame.addEventListener("error", () => {
  showBlocked(activeTab()?.url || "");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
  }

  if (!modal.classList.contains("hidden") && (event.ctrlKey || event.metaKey)) {
    if (event.key.toLowerCase() === "l") {
      event.preventDefault();
      address.focus();
      address.select();
    }

    if (event.key.toLowerCase() === "t") {
      event.preventDefault();
      createTab();
    }

    if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      closeTab(state.activeTabId);
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      reload();
    }
  }
});

renderTabs();
renderActiveTab();
