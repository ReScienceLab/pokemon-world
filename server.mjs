/**
 * Pokemon Battle Demo — Two AI agents battle with visible thinking
 * For investor demos: shows agents reasoning about type matchups,
 * HP management, and strategic decisions in real-time.
 *
 * Run: PEER_PORT=9099 DATA_DIR=/tmp/demo node demo.mjs
 * Open: http://localhost:9099/
 */
import Fastify from "fastify";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Dex, BattleStreams, Teams } = require("@pkmn/sim");
const { TeamGenerators } = require("@pkmn/randoms");
Teams.setGeneratorFactory(TeamGenerators);

const PORT = parseInt(process.env.PEER_PORT ?? "9099");
const DATA_DIR = process.env.DATA_DIR ?? "/tmp/pokemon-demo";
const TEAM_SIZE = parseInt(process.env.TEAM_SIZE ?? "3");
const GEN = parseInt(process.env.GEN ?? "5");
const FORMAT = `gen${GEN}randombattle`;
const TURN_DELAY = parseInt(process.env.TURN_DELAY ?? "3000");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Type effectiveness chart (Gen 1)
const TYPE_CHART = {
  Normal:{Rock:0.5,Ghost:0},Fire:{Fire:0.5,Water:0.5,Grass:2,Ice:2,Bug:2,Rock:0.5,Dragon:0.5},
  Water:{Fire:2,Water:0.5,Grass:0.5,Ground:2,Rock:2,Dragon:0.5},
  Grass:{Fire:0.5,Water:2,Grass:0.5,Poison:0.5,Ground:2,Flying:0.5,Bug:0.5,Rock:2,Dragon:0.5},
  Electric:{Water:2,Grass:0.5,Electric:0.5,Ground:0,Flying:2,Dragon:0.5},
  Ice:{Fire:0.5,Water:0.5,Grass:2,Ice:0.5,Ground:2,Flying:2,Dragon:2},
  Fighting:{Normal:2,Ice:2,Poison:0.5,Flying:0.5,Psychic:0.5,Bug:0.5,Rock:2,Ghost:0},
  Poison:{Grass:2,Poison:0.5,Ground:0.5,Bug:2,Rock:0.5,Ghost:0.5},
  Ground:{Fire:2,Electric:2,Grass:0.5,Poison:2,Flying:0,Bug:0.5,Rock:2},
  Flying:{Grass:2,Electric:0.5,Fighting:2,Bug:2,Rock:0.5},
  Psychic:{Fighting:2,Poison:2,Psychic:0.5},
  Bug:{Fire:0.5,Grass:2,Fighting:0.5,Poison:2,Flying:0.5,Psychic:2,Ghost:0.5},
  Rock:{Fire:2,Ice:2,Fighting:0.5,Ground:0.5,Flying:2,Bug:2},
  Ghost:{Normal:0,Ghost:2,Psychic:0},Dragon:{Dragon:2},
  Dark:{Fighting:0.5,Psychic:2,Ghost:2,Dark:0.5},Steel:{},Fairy:{}
};

function getEffectiveness(moveType, defTypes) {
  let mult = 1;
  for (const dt of defTypes) { mult *= (TYPE_CHART[moveType]?.[dt] ?? 1); }
  return mult;
}

// ---------------------------------------------------------------------------
// DemoBattle — two AI agents with thinking
// ---------------------------------------------------------------------------
class DemoBattle {
  constructor() {
    this.battleId = crypto.randomUUID();
    this.battleOver = false;
    this.winner = null;
    this.turn = 0;
    this.log = [];
    this.protocolLog = [];
    this.thinking = { p1: [], p2: [] };
    this.lastChoice = { p1: null, p2: null };
    this.p1 = { name: "Agent Alpha", alias: "Alpha", team: null, request: null, active: null };
    this.p2 = { name: "Agent Beta", alias: "Beta", team: null, request: null, active: null };
    this.startedAt = Date.now();
    this.autoRunning = false;
    this._initBattle();
  }

  _initBattle() {
    const stream = new BattleStreams.BattleStream();
    this.allStreams = BattleStreams.getPlayerStreams(stream);
    this._listenOmniscient(this.allStreams.omniscient);
    const t1 = Teams.generate(FORMAT).slice(0, TEAM_SIZE);
    const t2 = Teams.generate(FORMAT).slice(0, TEAM_SIZE);
    this.p1.team = t1;
    this.p2.team = t2;
    this._listenStream("p1", this.allStreams.p1);
    this._listenStream("p2", this.allStreams.p2);
    this.allStreams.omniscient.write(
      `>start ${JSON.stringify({ formatid: FORMAT })}\n` +
      `>player p1 ${JSON.stringify({ name: this.p1.name, team: Teams.pack(t1) })}\n` +
      `>player p2 ${JSON.stringify({ name: this.p2.name, team: Teams.pack(t2) })}`
    );
  }

  async _listenOmniscient(stream) {
    try {
      for await (const chunk of stream) {
        for (const line of chunk.split("\n")) {
          if (line.startsWith("|request|") || line.startsWith(">")) continue;
          this.protocolLog.push(line);
        }
      }
    } catch {}
  }

  async _listenStream(side, stream) {
    const player = this[side];
    try {
      for await (const chunk of stream) {
        for (const line of chunk.split("\n")) {
          if (line.startsWith("|request|")) {
            player.request = JSON.parse(line.slice(9));
          } else if (line.startsWith("|win|")) {
            this.winner = line.slice(5);
            this.battleOver = true;
            this.log.push({ turn: this.turn, text: `Battle over! Winner: ${this.winner}`, type: "win" });
          } else if (line === "|tie" || line.startsWith("|tie|")) {
            this.winner = "tie";
            this.battleOver = true;
            this.log.push({ turn: this.turn, text: "Battle ended in a tie!", type: "win" });
          } else if (line.startsWith("|turn|")) {
            this.turn = parseInt(line.split("|")[2]);
            this.log.push({ turn: this.turn, text: `--- Turn ${this.turn} ---`, type: "turn" });
          } else {
            const fmt = this._formatLine(line);
            if (fmt) this.log.push({ turn: this.turn, text: fmt.text, type: fmt.type });
          }
        }
      }
    } catch {}
  }

  _formatLine(line) {
    const p = line.split("|").filter(Boolean);
    const t = p[0];
    const sn = (id) => id?.includes(":") ? id.split(": ")[1] : id;
    switch (t) {
      case "move": return { text: `${sn(p[1])} used ${p[2]}!`, type: "move" };
      case "-damage": return { text: `${sn(p[1])} → ${p[2]}`, type: "damage" };
      case "-supereffective": return { text: "It's super effective!", type: "super" };
      case "-resisted": return { text: "It's not very effective...", type: "resist" };
      case "switch": return { text: `${sn(p[1])} sent out ${p[2]?.split(",")[0]}!`, type: "switch" };
      case "faint": return { text: `${sn(p[1])} fainted!`, type: "faint" };
      case "-crit": return { text: "A critical hit!", type: "crit" };
      case "-miss": return { text: `${sn(p[1])} missed!`, type: "miss" };
      case "-status": return { text: `${sn(p[1])} is ${p[2]}!`, type: "status" };
      case "-heal": return { text: `${sn(p[1])} healed → ${p[2]}`, type: "heal" };
      case "-boost": return { text: `${sn(p[1])}'s ${p[2]} rose!`, type: "boost" };
      case "-unboost": return { text: `${sn(p[1])}'s ${p[2]} fell!`, type: "boost" };
      default: return null;
    }
  }

  _parseState(side) {
    const player = this[side];
    const req = player.request;
    if (!req) return { active: null, team: [], moves: [], mustSwitch: false };
    const team = (req.side?.pokemon || []).map((p, i) => {
      const [hp, maxHp] = (p.condition || "0 fnt").split("/").map(s => parseInt(s));
      return {
        slot: i + 1, name: p.details.split(",")[0],
        hp: isNaN(hp) ? 0 : hp, maxHp: isNaN(maxHp) ? 0 : maxHp,
        active: !!p.active, fainted: p.condition.includes("fnt"),
        types: (Dex.species.get(p.details.split(",")[0])?.types) || ["Normal"],
      };
    });
    const activePoke = team.find(p => p.active);
    const moves = (req.active?.[0]?.moves || []).map((m, i) => {
      const moveData = Dex.moves.get(m.move);
      return {
        slot: i + 1, name: m.move, type: moveData?.type || "Normal",
        basePower: moveData?.basePower || 0, pp: m.pp, maxPp: m.maxpp,
        disabled: m.disabled || false, category: moveData?.category || "Physical",
      };
    });
    return {
      active: activePoke, team, moves,
      mustSwitch: !!req.forceSwitch, canMove: !!req.active && !req.forceSwitch,
    };
  }

  // Strategic AI with visible thinking
  _think(side) {
    const state = this._parseState(side);
    const player = this[side];
    const oppSide = side === "p1" ? "p2" : "p1";
    const oppState = this._parseState(oppSide);
    const thoughts = [];
    let choice = null;

    if (state.mustSwitch) {
      thoughts.push(`My ${state.active?.name || "Pokemon"} fainted. I need to switch.`);
      const alive = state.team.filter(p => !p.fainted && !p.active);
      if (alive.length === 0) return { choice: null, thoughts };

      if (oppState.active) {
        const oppTypes = oppState.active.types;
        thoughts.push(`Opponent has ${oppState.active.name} (${oppTypes.join("/")}). Let me find a good counter.`);
        let best = alive[0], bestScore = -999;
        for (const p of alive) {
          let score = p.hp / p.maxHp * 100;
          const defMult = oppTypes.reduce((m, ot) => m * getEffectiveness(ot, p.types), 1);
          if (defMult < 1) { score += 30; thoughts.push(`  ${p.name} resists ${oppTypes.join("/")} attacks — good defensive matchup.`); }
          if (defMult > 1) { score -= 20; thoughts.push(`  ${p.name} is weak to ${oppTypes.join("/")} — risky.`); }
          if (score > bestScore) { bestScore = score; best = p; }
        }
        thoughts.push(`Decision: Switch to ${best.name} (HP: ${best.hp}/${best.maxHp}).`);
        choice = `switch ${best.slot}`;
      } else {
        const best = alive.sort((a, b) => b.hp - a.hp)[0];
        thoughts.push(`No info on opponent. Sending ${best.name} (highest HP: ${best.hp}/${best.maxHp}).`);
        choice = `switch ${best.slot}`;
      }
      return { choice, thoughts };
    }

    if (!state.canMove || !state.active) return { choice: null, thoughts: ["Waiting..."] };

    const myActive = state.active;
    const myHpPct = myActive.maxHp > 0 ? Math.round(myActive.hp / myActive.maxHp * 100) : 0;
    thoughts.push(`My ${myActive.name} (${myActive.types.join("/")}): ${myActive.hp}/${myActive.maxHp} HP (${myHpPct}%).`);

    if (oppState.active) {
      const opp = oppState.active;
      const oppHpPct = opp.maxHp > 0 ? Math.round(opp.hp / opp.maxHp * 100) : 0;
      thoughts.push(`Facing ${opp.name} (${opp.types.join("/")}): ~${oppHpPct}% HP.`);

      // Evaluate moves
      let bestMove = null, bestScore = -999;
      for (const m of state.moves) {
        if (m.disabled || m.pp <= 0) continue;
        let score = m.basePower;
        const eff = getEffectiveness(m.type, opp.types);
        score *= eff;
        if (myActive.types.includes(m.type)) score *= 1.5; // STAB
        const effLabel = eff > 1 ? "SUPER EFFECTIVE" : eff < 1 ? "not very effective" : "neutral";
        const stab = myActive.types.includes(m.type) ? " + STAB" : "";
        thoughts.push(`  ${m.name} (${m.type}, ${m.basePower} BP): ${effLabel}${stab} → score ${Math.round(score)}`);
        if (score > bestScore) { bestScore = score; bestMove = m; }
      }

      // Consider switching if bad matchup and low-power moves
      if (bestScore < 40 && myHpPct > 30) {
        const alive = state.team.filter(p => !p.fainted && !p.active);
        for (const p of alive) {
          const pTypes = p.types;
          const defMult = opp.types.reduce((m2, ot) => m2 * getEffectiveness(ot, pTypes), 1);
          if (defMult < 1) {
            thoughts.push(`My moves are weak. ${p.name} would resist their attacks — considering switch.`);
            thoughts.push(`Decision: Switch to ${p.name} for better matchup.`);
            return { choice: `switch ${p.slot}`, thoughts };
          }
        }
      }

      if (bestMove) {
        thoughts.push(`Decision: Use ${bestMove.name} (score ${Math.round(bestScore)}).`);
        choice = `move ${bestMove.slot}`;
      } else {
        thoughts.push("No usable moves. Struggle.");
        choice = "move 1";
      }
    } else {
      const bestMove = state.moves.filter(m => !m.disabled && m.pp > 0).sort((a, b) => b.basePower - a.basePower)[0];
      if (bestMove) {
        thoughts.push(`No info on opponent. Using strongest move: ${bestMove.name}.`);
        choice = `move ${bestMove.slot}`;
      } else { choice = "move 1"; }
    }

    return { choice, thoughts };
  }

  async playTurn() {
    if (this.battleOver) return false;
    await new Promise(r => setTimeout(r, 200));
    const sides = ["p1", "p2"];
    for (const side of sides) {
      const player = this[side];
      if (!player.request) continue;
      if (player.request.wait) continue;
      const { choice, thoughts } = this._think(side);
      this.thinking[side] = thoughts;
      this.lastChoice[side] = choice;
      if (choice) {
        this.allStreams[side].write(choice);
        player.request = null;
      }
    }
    await new Promise(r => setTimeout(r, 300));
    return !this.battleOver;
  }

  async autoPlay() {
    if (this.autoRunning) return;
    this.autoRunning = true;
    await new Promise(r => setTimeout(r, 500));
    while (!this.battleOver) {
      await this.playTurn();
      await new Promise(r => setTimeout(r, TURN_DELAY));
    }
    this.autoRunning = false;
  }

  getFullState() {
    return {
      battleId: this.battleId, turn: this.turn, battleOver: this.battleOver, winner: this.winner,
      p1: {
        name: this.p1.name,
        team: this._parseState("p1").team,
        active: this._parseState("p1").active,
        moves: this._parseState("p1").moves,
        choice: this.lastChoice.p1,
        thinking: this.thinking.p1,
      },
      p2: {
        name: this.p2.name,
        team: this._parseState("p2").team,
        active: this._parseState("p2").active,
        moves: this._parseState("p2").moves,
        choice: this.lastChoice.p2,
        thinking: this.thinking.p2,
      },
      log: this.log.slice(-30),
      protocolLog: this.protocolLog,
    };
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
fs.mkdirSync(DATA_DIR, { recursive: true });
const fastify = Fastify({ logger: false });
let currentDemo = null;

// Serve static files
const webDir = path.join(__dirname, "web");
fastify.get("/", async (req, reply) => {
  const html = fs.readFileSync(path.join(webDir, "demo.html"), "utf8");
  return reply.type("text/html").send(html);
});
fastify.get("/demo.js", async (req, reply) => {
  const js = fs.readFileSync(path.join(webDir, "demo.js"), "utf8");
  return reply.type("application/javascript").send(js);
});
fastify.get("/demo.css", async (req, reply) => {
  const css = fs.readFileSync(path.join(webDir, "demo.css"), "utf8");
  return reply.type("text/css").send(css);
});

fastify.post("/demo/start", async () => {
  currentDemo = new DemoBattle();
  await new Promise(r => setTimeout(r, 500));
  currentDemo.autoPlay();
  return { ok: true, battleId: currentDemo.battleId };
});

fastify.get("/demo/state", async () => {
  if (!currentDemo) return { ok: false, error: "No demo running. POST /demo/start first." };
  return { ok: true, ...currentDemo.getFullState() };
});

fastify.post("/demo/restart", async () => {
  currentDemo = new DemoBattle();
  await new Promise(r => setTimeout(r, 500));
  currentDemo.autoPlay();
  return { ok: true, battleId: currentDemo.battleId };
});

await fastify.listen({ port: PORT, host: "::" });
console.log(`[demo] Pokemon Battle Demo on http://localhost:${PORT}/`);
console.log(`[demo] Turn delay: ${TURN_DELAY}ms, team size: ${TEAM_SIZE}`);

currentDemo = new DemoBattle();
await new Promise(r => setTimeout(r, 500));
currentDemo.autoPlay();
console.log(`[demo] Auto-battle started: ${currentDemo.battleId.slice(0, 8)}`);
