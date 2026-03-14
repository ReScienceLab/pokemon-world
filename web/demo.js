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

function el(id) { return document.getElementById(id); }
function toId(n) { return (n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function iconStyle(name) {
  if (typeof Dex !== "undefined" && Dex.getPokemonIcon) {
    return Dex.getPokemonIcon(name);
  }
  return "background:url(" + ICON_SHEET + ") no-repeat 0px 0px";
}

function initShowdownBattle(initialLog) {
  if (typeof Battle === "undefined") {
    setTimeout(function() { initShowdownBattle(initialLog); }, 200);
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
    autoresize: true
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
    div.style.animationDelay = (i * 80) + "ms";
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function renderTeam(containerId, team) {
  var container = el(containerId);
  container.innerHTML = "";
  (team || []).forEach(function (p) {
    var div = document.createElement("div");
    div.className = "team-mon" + (p.active ? " active" : "") + (p.fainted ? " fainted" : "");
    var hpPct = p.maxHp > 0 ? (p.hp / p.maxHp * 100) : 0;
    var hpColor = hpPct < 25 ? "var(--hp-red)" : hpPct < 50 ? "var(--hp-yellow)" : "var(--hp-green)";
    div.innerHTML =
      '<span class="team-icon" style="' + iconStyle(p.name) + '"></span>' +
      '<span class="mon-name">' + p.name + '</span>' +
      '<span class="mon-hp">' + (p.fainted ? "FNT" : p.hp + "/" + p.maxHp) + '</span>' +
      '<div class="mon-hp-bar"><div class="mon-hp-fill" style="width:' + hpPct + '%;background:' + hpColor + '"></div></div>';
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
    nameEl.textContent = "---";
    typesEl.textContent = "";
  }
  var chosenSlot = -1;
  if (choice && choice.startsWith("move ")) chosenSlot = parseInt(choice.split(" ")[1]);
  grid.innerHTML = "";
  (moves || []).forEach(function (m) {
    var div = document.createElement("div");
    var typeCls = "type-" + (m.type || "normal").toLowerCase();
    var chosen = (m.slot === chosenSlot) ? " chosen" : "";
    div.className = "move-btn " + typeCls + chosen + (m.disabled ? " disabled" : "");
    div.innerHTML =
      '<span class="move-name">' + m.name + '</span>' +
      '<span class="move-meta">' + m.type + " " + (m.basePower || "—") + "BP " + m.pp + "/" + m.maxPp + "PP</span>";
    grid.appendChild(div);
  });
  if (!moves || moves.length === 0) {
    grid.innerHTML = '<div class="move-btn disabled"><span class="move-name">---</span></div>';
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

async function poll() {
  try {
    var resp = await fetch(API + "/demo/state");
    var data = await resp.json();
    if (!data.ok) return;

    el("turn-num").textContent = data.turn;

    // Feed raw protocol to Showdown Battle renderer
    if (data.protocolLog) {
      feedProtocol(data.protocolLog);
    }

    renderThoughts("p1-thoughts", data.p1.thinking);
    renderThoughts("p2-thoughts", data.p2.thinking);
    renderTeam("p1-team", data.p1.team);
    renderTeam("p2-team", data.p2.team);
    renderMoves("p1-moves", "p1-active-name", "p1-active-types", data.p1.moves, data.p1.active, data.p1.choice);
    renderMoves("p2-moves", "p2-active-name", "p2-active-types", data.p2.moves, data.p2.active, data.p2.choice);
    renderLog(data.log || []);

    if (data.battleOver) {
      el("result-overlay").classList.remove("hidden");
      el("result-text").textContent = data.winner === "tie" ? "TIE!" : data.winner + " WINS!";
    } else {
      el("result-overlay").classList.add("hidden");
    }
  } catch (e) {
    console.warn("Poll error:", e);
  }
}

async function restart() {
  lastLogLen = 0;
  lastTurn = -1;
  lastProtoLen = 0;
  el("status-log").innerHTML = "";
  el("result-overlay").classList.add("hidden");
  el("p1-thoughts").innerHTML = '<div class="thought">Starting new battle...</div>';
  el("p2-thoughts").innerHTML = '<div class="thought">Starting new battle...</div>';
  await fetch(API + "/demo/restart", { method: "POST" });
  if (battle) {
    battle.destroy();
    battle = null;
    battleReady = false;
    jQuery("#showdown-battle-wrapper .battle").empty();
    initShowdownBattle();
  }
}

// Start — first fetch initial state, then init Showdown with the log
(async function() {
  try {
    var resp = await fetch(API + "/demo/state");
    var data = await resp.json();
    if (data.ok && data.protocolLog) {
      initShowdownBattle(data.protocolLog);
    } else {
      initShowdownBattle([]);
    }
  } catch(e) {
    initShowdownBattle([]);
  }
  poll();
  pollTimer = setInterval(poll, POLL_MS);
})();
