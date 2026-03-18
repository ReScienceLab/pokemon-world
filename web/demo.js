var API = location.origin;
var SPRITE = "https://play.pokemonshowdown.com/sprites";
var ICON_SHEET = SPRITE + "/pokemonicons-sheet.png";
var POLL_MS = 1500;
var pollTimer = null;
var lastTurn = -1;
var lastLogLen = 0;
var lastProtoLen = 0;
var battle = null;
var battleReady = false;

var STRINGS = {
  "battle.fainted": "FNT",
  "battle.empty": "—",
  "battle.bp": " BP",
  "battle.pp": " PP",
  "battle.tie": "It's a tie!",
  "battle.winner": "{name} wins!",
  "header.phase_demo": "DEMO",
  "header.phase_waiting": "WAITING",
  "header.phase_battle": "BATTLE",
  "header.phase_battleOver": "BATTLE OVER",
  "waiting.champion": "CHAMPION",
  "waiting.challenger": "CHALLENGER",
  "waiting.p1": "PLAYER 1",
  "waiting.status_starting": "Match starting...",
  "waiting.status_waiting": "Waiting for challenger...",
  "agent.name_alpha": "AGENT ALPHA",
  "agent.name_beta": "AGENT BETA",
  "agent.badge_ai": "AI",
  "agent.badge_champion": "CHAMPION",
  "agent.badge_p1": "P1",
  "agent.badge_p2": "P2",
  "agent.name_empty": "Empty Slot",
  "agent.name_waiting": "Waiting...",
  "agent.badge_waiting": "..."
};

function t(key, params) {
  var s = STRINGS[key] || key;
  if (params) {
    Object.keys(params).forEach(function(k) {
      s = s.replace("{" + k + "}", params[k]);
    });
  }
  return s;
}

function el(id) {
  return document.getElementById(id);
}
function toId(n) {
  return (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function iconStyle(name) {
  if (typeof Dex !== "undefined" && Dex.getPokemonIcon) {
    return Dex.getPokemonIcon(name);
  }
  return "background:url(" + ICON_SHEET + ") no-repeat 0px 0px";
}

function getHPClass(hpPercent) {
  if (hpPercent < 20) return "hp-red";
  if (hpPercent < 50) return "hp-yellow";
  return "hp-green";
}

function initShowdownBattle(initialLog) {
  if (typeof Battle === "undefined") {
    setTimeout(function () {
      initShowdownBattle(initialLog);
    }, 200);
    return;
  }
  var logLines = initialLog || [];
  battle = new Battle({
    $frame: jQuery("#showdown-battle-wrapper .battle"),
    $logFrame: jQuery("#showdown-battle-wrapper .battle-log"),
    id: "",
    log: logLines,
    isReplay: true,
    paused: true,
    autoresize: true,
  });
  battle.setMute(true);
  battle.messageFadeTime = 300;
  battle.messageShownTime = 1;
  lastProtoLen = logLines.length;
  battleReady = true;
  battle.play();
}

function feedProtocol(lines) {
  if (!battleReady || !battle) return;
  var newLines = lines.slice(lastProtoLen);
  if (newLines.length === 0) return;
  lastProtoLen = lines.length;
  for (var i = 0; i < newLines.length; i++) {
    battle.add(newLines[i]);
  }
  if (battle.paused) {
    battle.play();
  }
}

function renderThoughts(containerId, thoughts) {
  var container = el(containerId);
  container.innerHTML = "";
  (thoughts || []).forEach(function (t, i) {
    var div = document.createElement("div");
    var cls = "thought thought-new";
    if (t.startsWith("Decision:")) cls += " decision";
    else if (t.startsWith("  ")) cls += " analysis";
    else if (t.includes("weak") || t.includes("risky")) cls += " warning";
    div.className = cls;
    div.textContent = t;
    div.style.animationDelay = i * 80 + "ms";
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function renderTeam(containerId, team) {
  var container = el(containerId);
  container.innerHTML = "";
  (team || []).forEach(function (p) {
    var div = document.createElement("div");
    div.className =
      "team-mon" + (p.active ? " active" : "") + (p.fainted ? " fainted" : "");
    var hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) * 100 : 0;
    var hpClass = getHPClass(hpPct);
    div.innerHTML =
      '<span class="team-icon" style="' +
      iconStyle(p.name) +
      '"></span>' +
      '<span class="mon-name">' +
      p.name +
      "</span>" +
      '<span class="mon-hp">' +
      (p.fainted ? t("battle.fainted") : p.hp + "/" + p.maxHp) +
      "</span>" +
      '<div class="mon-hp-bar"><div class="mon-hp-fill ' +
      hpClass +
      '" style="width:' +
      hpPct +
      '%"></div></div>';
    container.appendChild(div);
  });
}

function renderMoves(panelId, nameId, typesId, moves, active, choice) {
  var grid = el(panelId);
  var nameEl = el(nameId);
  var typesEl = el(typesId);
  if (active) {
    nameEl.textContent = active.name;
    typesEl.textContent = (active.types || []).join("/");
  } else {
    nameEl.textContent = t("battle.empty");
    typesEl.textContent = "";
  }
  var chosenSlot = -1;
  if (choice && choice.startsWith("move "))
    chosenSlot = parseInt(choice.split(" ")[1]);
  grid.innerHTML = "";
  (moves || []).forEach(function (m) {
    var div = document.createElement("div");
    var typeCls = "type-" + (m.type || "normal").toLowerCase();
    var chosen = m.slot === chosenSlot ? " chosen" : "";
    div.className =
      "move-btn " + typeCls + chosen + (m.disabled ? " disabled" : "");
    div.innerHTML =
      '<span class="move-name">' +
      m.name +
      "</span>" +
      '<span class="move-meta">' +
      m.type +
      " " +
      (m.basePower || "—") +
      t("battle.bp") +
      " " +
      m.pp +
      "/" +
      m.maxPp +
      t("battle.pp") +
      "</span>";
    grid.appendChild(div);
  });
  if (!moves || moves.length === 0) {
    grid.innerHTML =
      '<div class="move-btn disabled"><span class="move-name">' +
      t("battle.empty") +
      "</span></div>";
  }
}

function renderLog(log) {
  var logEl = el("status-log");
  if (!logEl) return;
  if (log.length === lastLogLen) return;
  var newEntries = log.slice(lastLogLen);
  newEntries.forEach(function (entry) {
    var div = document.createElement("div");
    div.className = "status-line " + (entry.type || "info");
    div.textContent = entry.text;
    logEl.appendChild(div);
  });
  lastLogLen = log.length;
  var parent = logEl.parentElement;
  if (parent) parent.scrollTop = parent.scrollHeight;
}

function renderArenaStatus(data) {
  var statusEl = el("arena-phase");
  if (!statusEl) return;
  var phase = data.phase || "idle";
  var mode = data.mode || "demo";
  var label = mode === "demo" ? t("header.phase_demo") : phase.toUpperCase();
  if (phase === "waiting") label = t("header.phase_waiting");
  else if (phase === "battle") label = t("header.phase_battle");
  else if (phase === "battleOver") label = t("header.phase_battleOver");
  statusEl.textContent = label;
  statusEl.className = "arena-phase phase-" + phase + " mode-" + mode;

  renderAgentSlots(data);
}

function shortId(agentId) {
  if (!agentId) return "???";
  var parts = agentId.split(":");
  var hex = parts[parts.length - 1] || agentId;
  return hex.slice(0, 8) + "..." + hex.slice(-4);
}

var TRAINER_SPRITES = [
  "red",
  "blue",
  "cynthia",
  "steven",
  "lance",
  "leon",
  "hilbert",
  "hilda",
  "rosa",
  "nate",
  "brendan",
  "may",
  "dawn",
  "lucas",
  "ethan",
  "lyra",
  "leaf",
  "n",
  "iris",
  "alder",
  "diantha",
  "kukui",
  "gladion",
  "marnie",
];
var SPRITE_BASE = "https://play.pokemonshowdown.com/sprites/trainers/";

function trainerForAgent(agentId) {
  if (!agentId) return null;
  var hex = agentId.split(":").pop() || "";
  var hash = 0;
  for (var i = 0; i < hex.length; i++)
    hash = (hash * 31 + hex.charCodeAt(i)) & 0x7fffffff;
  return TRAINER_SPRITES[hash % TRAINER_SPRITES.length];
}

function renderWaitingOverlay(data) {
  var overlay = el("waiting-overlay");
  if (!overlay) return;

  var phase = data.phase || "idle";
  var mode = data.mode || "demo";

  if (mode !== "live" || phase === "battle" || data.battle) {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");

  var p1Trainer = el("p1-trainer");
  var p2Trainer = el("p2-trainer");
  var p1Label = el("p1-slot-label");
  var p2Label = el("p2-slot-label");
  var p1Id = el("p1-slot-id");
  var p2Id = el("p2-slot-id");
  var vsStatus = el("vs-status");

  if (data.champion) {
    var name1 = trainerForAgent(data.champion.agentId);
    p1Trainer.style.backgroundImage = "url(" + SPRITE_BASE + name1 + ".png)";
    p1Trainer.className = "trainer-sprite ready";
    p1Trainer.innerHTML = "";
    p1Label.textContent = t("waiting.champion");
    p1Id.textContent = data.champion.name || shortId(data.champion.agentId);
  } else {
    p1Trainer.style.backgroundImage = "";
    p1Trainer.className = "trainer-sprite empty";
    p1Trainer.innerHTML = '<div class="empty-silhouette">?</div>';
    p1Label.textContent = t("waiting.p1");
    p1Id.textContent = t("battle.empty");
  }

  if (data.challenger) {
    var name2 = trainerForAgent(data.challenger.agentId);
    p2Trainer.style.backgroundImage = "url(" + SPRITE_BASE + name2 + ".png)";
    p2Trainer.className = "trainer-sprite ready";
    p2Trainer.innerHTML = "";
    p2Label.textContent = t("waiting.challenger");
    p2Id.textContent = data.challenger.name || shortId(data.challenger.agentId);
    el("p2-trainer").parentElement.classList.add("filled");
    vsStatus.textContent = t("waiting.status_starting");
  } else {
    p2Trainer.style.backgroundImage = "";
    p2Trainer.className = "trainer-sprite empty";
    p2Trainer.innerHTML = '<div class="empty-silhouette">?</div>';
    p2Label.textContent = t("waiting.challenger");
    p2Id.textContent = t("battle.empty");
    el("p2-trainer").parentElement.classList.remove("filled");
    vsStatus.textContent = t("waiting.status_waiting");
  }
}

function renderAgentSlots(data) {
  var phase = data.phase || "idle";
  var mode = data.mode || "demo";
  var p1Name = el("p1-name");
  var p2Name = el("p2-name");
  var p1Badge = document.querySelector("#p1-col .agent-badge");
  var p2Badge = document.querySelector("#p2-col .agent-badge");
  var p1Col = el("p1-col");
  var p2Col = el("p2-col");

  if (mode === "demo") {
    p1Name.textContent = t("agent.name_alpha");
    p2Name.textContent = t("agent.name_beta");
    if (p1Badge) {
      p1Badge.textContent = t("agent.badge_ai");
      p1Badge.className = "agent-badge ai";
    }
    if (p2Badge) {
      p2Badge.textContent = t("agent.badge_ai");
      p2Badge.className = "agent-badge ai";
    }
    p1Col.classList.remove("waiting-slot", "ready-slot");
    p2Col.classList.remove("waiting-slot", "ready-slot");
    return;
  }

  if (data.champion) {
    p1Name.textContent = data.champion.name || shortId(data.champion.agentId);
    if (p1Badge) {
      p1Badge.textContent = t("agent.badge_champion");
      p1Badge.className = "agent-badge online";
    }
    p1Col.classList.add("ready-slot");
    p1Col.classList.remove("waiting-slot");
  } else {
    p1Name.textContent = t("agent.name_empty");
    if (p1Badge) {
      p1Badge.textContent = t("agent.badge_p1");
      p1Badge.className = "agent-badge offline";
    }
    p1Col.classList.add("waiting-slot");
    p1Col.classList.remove("ready-slot");
  }

  if (data.challenger) {
    p2Name.textContent =
      data.challenger.name || shortId(data.challenger.agentId);
    if (p2Badge) {
      p2Badge.textContent = t("agent.badge_p2");
      p2Badge.className = "agent-badge online";
    }
    p2Col.classList.add("ready-slot");
    p2Col.classList.remove("waiting-slot");
  } else if (phase === "waiting") {
    p2Name.textContent = t("agent.name_waiting");
    if (p2Badge) {
      p2Badge.textContent = t("agent.badge_waiting");
      p2Badge.className = "agent-badge pulse";
    }
    p2Col.classList.add("waiting-slot");
    p2Col.classList.remove("ready-slot");
  } else {
    p2Name.textContent = t("agent.name_empty");
    if (p2Badge) {
      p2Badge.textContent = t("agent.badge_p2");
      p2Badge.className = "agent-badge offline";
    }
    p2Col.classList.add("waiting-slot");
    p2Col.classList.remove("ready-slot");
  }
}

async function poll() {
  try {
    var resp = await fetch(API + "/arena/state");
    var data = await resp.json();
    if (!data.ok) return;

    renderArenaStatus(data);
    updateJoinPanel(data);

    renderWaitingOverlay(data);

    var b = data.battle;
    if (!b) return;

    if (b.battleId !== lastBattleId) {
      lastBattleId = b.battleId;
      resetBattleView(b.protocolLog);
      return;
    }

    el("turn-num").textContent = b.turn;

    if (b.protocolLog) {
      feedProtocol(b.protocolLog);
    }

    if (data.mode !== "demo") {
      // Agent names handled by renderAgentSlots for live mode
    } else {
      el("p1-name").textContent = b.p1.name;
      el("p2-name").textContent = b.p2.name;
    }
    renderThoughts("p1-thoughts", b.p1.thinking);
    renderThoughts("p2-thoughts", b.p2.thinking);
    renderTeam("p1-team", b.p1.team);
    renderTeam("p2-team", b.p2.team);
    renderMoves(
      "p1-moves",
      "p1-active-name",
      "p1-active-types",
      b.p1.moves,
      b.p1.active,
      b.p1.choice,
    );
    renderMoves(
      "p2-moves",
      "p2-active-name",
      "p2-active-types",
      b.p2.moves,
      b.p2.active,
      b.p2.choice,
    );
    renderLog(b.log || []);

    if (b.battleOver) {
      el("result-overlay").classList.remove("hidden");
      el("result-text").textContent =
        b.winner === "tie"
          ? t("battle.tie")
          : t("battle.winner", { name: b.winner });
    } else {
      el("result-overlay").classList.add("hidden");
    }
  } catch (e) {
    console.warn("Poll error:", e);
  }
}

function resetBattleView(protocolLog) {
  lastLogLen = 0;
  lastTurn = -1;
  lastProtoLen = 0;
  el("status-log").innerHTML = "";
  el("result-overlay").classList.add("hidden");
  el("p1-thoughts").innerHTML = "";
  el("p2-thoughts").innerHTML = "";
  if (battle) {
    battle.destroy();
    battle = null;
    battleReady = false;
    jQuery("#showdown-battle-wrapper .battle").empty();
  }
  initShowdownBattle(protocolLog || []);
}

var lastBattleId = null;

// Join panel — show/hide based on arena state
var joinInfoLoaded = false;

async function loadJoinInfo() {
  if (joinInfoLoaded) return;
  try {
    var resp = await fetch(API + "/arena/info");
    var info = await resp.json();
    if (!info.ok) return;
    joinInfoLoaded = true;
    el("join-agent-id").textContent = info.agentId;
    el("join-world-id").textContent = info.worldId;
    el("join-aid-cmd").textContent = info.agentId;
    el("join-port-cmd").textContent = info.port;
    el("join-format").textContent = info.format;
    el("join-team-size").textContent = info.teamSize;
  } catch (e) {}
}

function updateJoinPanel(data) {
  var panel = el("join-panel");
  var arena = document.querySelector(".arena");
  if (!panel || !arena) return;
  var hasRealAgents = data.mode === "live";
  if (hasRealAgents && data.phase === "battle") {
    panel.classList.add("hidden");
    arena.classList.add("no-join-panel");
  } else {
    panel.classList.remove("hidden");
    arena.classList.remove("no-join-panel");
    loadJoinInfo();
  }
}

// Start — fetch initial state, init Showdown, begin polling
(async function () {
  try {
    var resp = await fetch(API + "/arena/state");
    var data = await resp.json();
    if (data.ok && data.battle && data.battle.protocolLog) {
      lastBattleId = data.battle.battleId;
      initShowdownBattle(data.battle.protocolLog);
    } else {
      initShowdownBattle([]);
    }
    if (data.ok) updateJoinPanel(data);
  } catch (e) {
    initShowdownBattle([]);
  }
  loadJoinInfo();
  poll();
  pollTimer = setInterval(poll, POLL_MS);
})();
