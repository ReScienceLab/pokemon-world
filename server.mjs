/**
 * Pokemon Battle Arena — DAP World Agent
 *
 * Programmatic world with arena-style matchmaking:
 *   - First agent to join becomes the champion
 *   - Second agent becomes the challenger; battle starts automatically
 *   - Winner stays as champion; loser is evicted
 *   - When no agents are present, runs AI-vs-AI demo battles
 *
 * Run: WORLD_ID=pokemon-arena PEER_PORT=9099 DATA_DIR=/tmp/pokemon-world node server.mjs
 * Open: http://localhost:9099/
 */
import fs from "fs"
import path from "path"
import crypto from "node:crypto"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { createWorldServer } from "@resciencelab/agent-world-sdk"

const require = createRequire(import.meta.url)
const { Dex, BattleStreams, Teams } = require("@pkmn/sim")
const { TeamGenerators } = require("@pkmn/randoms")
Teams.setGeneratorFactory(TeamGenerators)

const PORT = parseInt(process.env.PORT ?? process.env.PEER_PORT ?? "9099")
const WORLD_ID = process.env.WORLD_ID ?? "pokemon-arena"
const WORLD_NAME = process.env.WORLD_NAME ?? "Pokemon Battle Arena"
const DATA_DIR = process.env.DATA_DIR ?? "/tmp/pokemon-demo"
const TEAM_SIZE = parseInt(process.env.TEAM_SIZE ?? "3")
const GEN = parseInt(process.env.GEN ?? "5")
const FORMAT = `gen${GEN}randombattle`
const TURN_TIMEOUT_MS = parseInt(process.env.TURN_TIMEOUT_MS ?? "30000")
const TURN_DELAY = parseInt(process.env.TURN_DELAY ?? "3000")
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Type effectiveness chart
// ---------------------------------------------------------------------------
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
}

function getEffectiveness(moveType, defTypes) {
  let mult = 1
  for (const dt of defTypes) { mult *= (TYPE_CHART[moveType]?.[dt] ?? 1) }
  return mult
}

// ---------------------------------------------------------------------------
// Battle — @pkmn/sim wrapper with AI thinking
// ---------------------------------------------------------------------------
class Battle {
  constructor(p1Name = "Agent Alpha", p2Name = "Agent Beta") {
    this.battleId = crypto.randomUUID()
    this.battleOver = false
    this.winner = null
    this.winnerSide = null
    this.turn = 0
    this.log = []
    this.protocolLog = []
    this.thinking = { p1: [], p2: [] }
    this.lastChoice = { p1: null, p2: null }
    this.pendingActions = { p1: null, p2: null }
    this.p1 = { name: p1Name, team: null, request: null }
    this.p2 = { name: p2Name, team: null, request: null }
    this.startedAt = Date.now()
    this._initBattle()
  }

  _initBattle() {
    const stream = new BattleStreams.BattleStream()
    this.allStreams = BattleStreams.getPlayerStreams(stream)
    this._listenOmniscient(this.allStreams.omniscient)
    const t1 = Teams.generate(FORMAT).slice(0, TEAM_SIZE)
    const t2 = Teams.generate(FORMAT).slice(0, TEAM_SIZE)
    this.p1.team = t1
    this.p2.team = t2
    this._listenStream("p1", this.allStreams.p1)
    this._listenStream("p2", this.allStreams.p2)
    this.allStreams.omniscient.write(
      `>start ${JSON.stringify({ formatid: FORMAT })}\n` +
      `>player p1 ${JSON.stringify({ name: this.p1.name, team: Teams.pack(t1) })}\n` +
      `>player p2 ${JSON.stringify({ name: this.p2.name, team: Teams.pack(t2) })}`
    )
  }

  async _listenOmniscient(stream) {
    try {
      for await (const chunk of stream) {
        for (const line of chunk.split("\n")) {
          if (line.startsWith("|request|") || line.startsWith(">")) continue
          this.protocolLog.push(line)
        }
      }
    } catch {}
  }

  async _listenStream(side, stream) {
    const player = this[side]
    try {
      for await (const chunk of stream) {
        for (const line of chunk.split("\n")) {
          if (line.startsWith("|request|")) {
            player.request = JSON.parse(line.slice(9))
          } else if (line.startsWith("|win|")) {
            this.winner = line.slice(5)
            this.winnerSide = this.winner === this.p1.name ? "p1" : "p2"
            this.battleOver = true
            this.log.push({ turn: this.turn, text: `Battle over! Winner: ${this.winner}`, type: "win" })
          } else if (line === "|tie" || line.startsWith("|tie|")) {
            this.winner = "tie"
            this.winnerSide = null
            this.battleOver = true
            this.log.push({ turn: this.turn, text: "Battle ended in a tie!", type: "win" })
          } else if (line.startsWith("|turn|")) {
            this.turn = parseInt(line.split("|")[2])
            this.log.push({ turn: this.turn, text: `--- Turn ${this.turn} ---`, type: "turn" })
          } else {
            const fmt = this._formatLine(line)
            if (fmt) this.log.push({ turn: this.turn, text: fmt.text, type: fmt.type })
          }
        }
      }
    } catch {}
  }

  _formatLine(line) {
    const p = line.split("|").filter(Boolean)
    const t = p[0]
    const sn = (id) => id?.includes(":") ? id.split(": ")[1] : id
    switch (t) {
      case "move": return { text: `${sn(p[1])} used ${p[2]}!`, type: "move" }
      case "-damage": return { text: `${sn(p[1])} → ${p[2]}`, type: "damage" }
      case "-supereffective": return { text: "It's super effective!", type: "super" }
      case "-resisted": return { text: "It's not very effective...", type: "resist" }
      case "switch": return { text: `${sn(p[1])} sent out ${p[2]?.split(",")[0]}!`, type: "switch" }
      case "faint": return { text: `${sn(p[1])} fainted!`, type: "faint" }
      case "-crit": return { text: "A critical hit!", type: "crit" }
      case "-miss": return { text: `${sn(p[1])} missed!`, type: "miss" }
      case "-status": return { text: `${sn(p[1])} is ${p[2]}!`, type: "status" }
      case "-heal": return { text: `${sn(p[1])} healed → ${p[2]}`, type: "heal" }
      case "-boost": return { text: `${sn(p[1])}'s ${p[2]} rose!`, type: "boost" }
      case "-unboost": return { text: `${sn(p[1])}'s ${p[2]} fell!`, type: "boost" }
      default: return null
    }
  }

  parseState(side) {
    const player = this[side]
    const req = player.request
    if (!req) return { active: null, team: [], moves: [], mustSwitch: false }
    const team = (req.side?.pokemon || []).map((p, i) => {
      const [hp, maxHp] = (p.condition || "0 fnt").split("/").map(s => parseInt(s))
      return {
        slot: i + 1, name: p.details.split(",")[0],
        hp: isNaN(hp) ? 0 : hp, maxHp: isNaN(maxHp) ? 0 : maxHp,
        active: !!p.active, fainted: p.condition.includes("fnt"),
        types: (Dex.species.get(p.details.split(",")[0])?.types) || ["Normal"],
      }
    })
    const activePoke = team.find(p => p.active)
    const moves = (req.active?.[0]?.moves || []).map((m, i) => {
      const moveData = Dex.moves.get(m.move)
      return {
        slot: i + 1, name: m.move, type: moveData?.type || "Normal",
        basePower: moveData?.basePower || 0, pp: m.pp, maxPp: m.maxpp,
        disabled: m.disabled || false, category: moveData?.category || "Physical",
      }
    })
    return {
      active: activePoke, team, moves,
      mustSwitch: !!req.forceSwitch, canMove: !!req.active && !req.forceSwitch,
    }
  }

  aiThink(side) {
    const state = this.parseState(side)
    const oppSide = side === "p1" ? "p2" : "p1"
    const oppState = this.parseState(oppSide)
    const thoughts = []
    let choice = null

    if (state.mustSwitch) {
      thoughts.push(`My ${state.active?.name || "Pokemon"} fainted. I need to switch.`)
      const alive = state.team.filter(p => !p.fainted && !p.active)
      if (alive.length === 0) return { choice: null, thoughts }
      if (oppState.active) {
        const oppTypes = oppState.active.types
        thoughts.push(`Opponent has ${oppState.active.name} (${oppTypes.join("/")}). Let me find a good counter.`)
        let best = alive[0], bestScore = -999
        for (const p of alive) {
          let score = p.hp / p.maxHp * 100
          const defMult = oppTypes.reduce((m, ot) => m * getEffectiveness(ot, p.types), 1)
          if (defMult < 1) { score += 30; thoughts.push(`  ${p.name} resists ${oppTypes.join("/")} attacks.`) }
          if (defMult > 1) { score -= 20; thoughts.push(`  ${p.name} is weak to ${oppTypes.join("/")} — risky.`) }
          if (score > bestScore) { bestScore = score; best = p }
        }
        thoughts.push(`Decision: Switch to ${best.name} (HP: ${best.hp}/${best.maxHp}).`)
        choice = `switch ${best.slot}`
      } else {
        const best = alive.sort((a, b) => b.hp - a.hp)[0]
        thoughts.push(`No info on opponent. Sending ${best.name} (highest HP: ${best.hp}/${best.maxHp}).`)
        choice = `switch ${best.slot}`
      }
      return { choice, thoughts }
    }

    if (!state.canMove || !state.active) return { choice: null, thoughts: ["Waiting..."] }

    const myActive = state.active
    const myHpPct = myActive.maxHp > 0 ? Math.round(myActive.hp / myActive.maxHp * 100) : 0
    thoughts.push(`My ${myActive.name} (${myActive.types.join("/")}): ${myActive.hp}/${myActive.maxHp} HP (${myHpPct}%).`)

    if (oppState.active) {
      const opp = oppState.active
      const oppHpPct = opp.maxHp > 0 ? Math.round(opp.hp / opp.maxHp * 100) : 0
      thoughts.push(`Facing ${opp.name} (${opp.types.join("/")}): ~${oppHpPct}% HP.`)
      let bestMove = null, bestScore = -999
      for (const m of state.moves) {
        if (m.disabled || m.pp <= 0) continue
        let score = m.basePower
        const eff = getEffectiveness(m.type, opp.types)
        score *= eff
        if (myActive.types.includes(m.type)) score *= 1.5
        const effLabel = eff > 1 ? "SUPER EFFECTIVE" : eff < 1 ? "not very effective" : "neutral"
        const stab = myActive.types.includes(m.type) ? " + STAB" : ""
        thoughts.push(`  ${m.name} (${m.type}, ${m.basePower} BP): ${effLabel}${stab} → score ${Math.round(score)}`)
        if (score > bestScore) { bestScore = score; bestMove = m }
      }
      if (bestScore < 40 && myHpPct > 30) {
        const alive = state.team.filter(p => !p.fainted && !p.active)
        for (const p of alive) {
          const defMult = opp.types.reduce((m2, ot) => m2 * getEffectiveness(ot, p.types), 1)
          if (defMult < 1) {
            thoughts.push(`My moves are weak. ${p.name} would resist — switching.`)
            return { choice: `switch ${p.slot}`, thoughts }
          }
        }
      }
      if (bestMove) {
        thoughts.push(`Decision: Use ${bestMove.name} (score ${Math.round(bestScore)}).`)
        choice = `move ${bestMove.slot}`
      } else {
        thoughts.push("No usable moves. Struggle.")
        choice = "move 1"
      }
    } else {
      const bestMove = state.moves.filter(m => !m.disabled && m.pp > 0).sort((a, b) => b.basePower - a.basePower)[0]
      if (bestMove) {
        thoughts.push(`No info on opponent. Using strongest move: ${bestMove.name}.`)
        choice = `move ${bestMove.slot}`
      } else { choice = "move 1" }
    }
    return { choice, thoughts }
  }

  submitChoice(side, choiceStr) {
    const player = this[side]
    if (!player.request || player.request.wait || this.battleOver) return false
    this.lastChoice[side] = choiceStr
    this.allStreams[side].write(choiceStr)
    player.request = null
    return true
  }

  needsInput(side) {
    const player = this[side]
    return !this.battleOver && player.request && !player.request.wait
  }

  getFullState() {
    return {
      battleId: this.battleId, turn: this.turn, battleOver: this.battleOver,
      winner: this.winner, winnerSide: this.winnerSide,
      p1: {
        name: this.p1.name,
        team: this.parseState("p1").team,
        active: this.parseState("p1").active,
        moves: this.parseState("p1").moves,
        choice: this.lastChoice.p1,
        thinking: this.thinking.p1,
      },
      p2: {
        name: this.p2.name,
        team: this.parseState("p2").team,
        active: this.parseState("p2").active,
        moves: this.parseState("p2").moves,
        choice: this.lastChoice.p2,
        thinking: this.thinking.p2,
      },
      log: this.log.slice(-30),
      protocolLog: this.protocolLog,
    }
  }
}

// ---------------------------------------------------------------------------
// ArenaManager — state machine for champion/challenger matchmaking
// ---------------------------------------------------------------------------
// States: idle, waiting, battle, battleOver
class ArenaManager {
  constructor({ onEvict }) {
    this.phase = "idle"
    this.mode = "demo"
    this.champion = null       // { agentId, side: "p1" }
    this.challenger = null     // { agentId, side: "p2" }
    this.battle = null
    this.turnTimer = null
    this.stats = { totalBattles: 0, wins: {} }
    this.onEvict = onEvict
    this._startDemo()
  }

  _startDemo() {
    this.mode = "demo"
    this.phase = "idle"
    this.champion = null
    this.challenger = null
    this.battle = new Battle("Agent Alpha (AI)", "Agent Beta (AI)")
    this._runDemoLoop()
  }

  async _runDemoLoop() {
    await new Promise(r => setTimeout(r, 500))
    while (this.mode === "demo" && !this.battle.battleOver) {
      await new Promise(r => setTimeout(r, 200))
      for (const side of ["p1", "p2"]) {
        if (!this.battle.needsInput(side)) continue
        const { choice, thoughts } = this.battle.aiThink(side)
        this.battle.thinking[side] = thoughts
        if (choice) this.battle.submitChoice(side, choice)
      }
      await new Promise(r => setTimeout(r, TURN_DELAY))
    }
    if (this.mode === "demo") {
      await new Promise(r => setTimeout(r, 5000))
      if (this.mode === "demo") {
        this.battle = new Battle("Agent Alpha (AI)", "Agent Beta (AI)")
        this._runDemoLoop()
      }
    }
  }

  join(agentId) {
    if (this.champion?.agentId === agentId || this.challenger?.agentId === agentId) {
      return { error: "Already in arena" }
    }

    if (this.mode === "demo" || this.phase === "idle") {
      this.mode = "live"
      this.phase = "waiting"
      this.champion = { agentId, side: "p1" }
      this.challenger = null
      this.battle = null
      const tag = agentId.slice(0, 12)
      console.log(`[arena] ${tag} joined as champion — waiting for challenger`)
      return { ok: true, role: "champion", phase: this.phase }
    }

    if (this.phase === "waiting" && !this.challenger) {
      this.challenger = { agentId, side: "p2" }
      this._startBattle()
      const tag = agentId.slice(0, 12)
      console.log(`[arena] ${tag} joined as challenger — battle starting`)
      return { ok: true, role: "challenger", phase: this.phase }
    }

    return { error: "Arena is full — battle in progress" }
  }

  _startBattle() {
    this.phase = "battle"
    this.stats.totalBattles++
    const champName = `Champion (${this.champion.agentId.slice(0, 8)})`
    const challName = `Challenger (${this.challenger.agentId.slice(0, 8)})`
    this.battle = new Battle(champName, challName)
    console.log(`[arena] Battle #${this.stats.totalBattles} started: ${this.battle.battleId.slice(0, 8)}`)
    this._waitForInputs()
  }

  async _waitForInputs() {
    await new Promise(r => setTimeout(r, 500))
    while (this.mode === "live" && this.phase === "battle" && !this.battle.battleOver) {
      const needsP1 = this.battle.needsInput("p1")
      const needsP2 = this.battle.needsInput("p2")
      if (!needsP1 && !needsP2) {
        await new Promise(r => setTimeout(r, 200))
        continue
      }
      // Start turn timeout — wait for agent actions or auto-fill with AI
      const deadline = Date.now() + TURN_TIMEOUT_MS
      while (Date.now() < deadline && this.phase === "battle") {
        const stillNeedsP1 = this.battle.needsInput("p1") && !this.battle.pendingActions.p1
        const stillNeedsP2 = this.battle.needsInput("p2") && !this.battle.pendingActions.p2
        if (!stillNeedsP1 && !stillNeedsP2) break
        await new Promise(r => setTimeout(r, 200))
      }
      // Apply pending actions or AI fallback
      for (const side of ["p1", "p2"]) {
        if (!this.battle.needsInput(side)) continue
        if (this.battle.pendingActions[side]) {
          this.battle.submitChoice(side, this.battle.pendingActions[side])
          this.battle.pendingActions[side] = null
        } else {
          const { choice, thoughts } = this.battle.aiThink(side)
          this.battle.thinking[side] = [...thoughts, "(AI auto-move — agent timed out)"]
          if (choice) this.battle.submitChoice(side, choice)
        }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    if (this.phase === "battle" && this.battle.battleOver) {
      this._onBattleEnd()
    }
  }

  _onBattleEnd() {
    this.phase = "battleOver"
    const ws = this.battle.winnerSide
    if (ws && ws === "p1" && this.champion) {
      // Champion wins — evict challenger
      const loserId = this.challenger?.agentId
      this.stats.wins[this.champion.agentId] = (this.stats.wins[this.champion.agentId] || 0) + 1
      this.challenger = null
      this.phase = "waiting"
      console.log(`[arena] Champion wins! Waiting for next challenger`)
      if (loserId) this.onEvict(loserId, "loser")
    } else if (ws && ws === "p2" && this.challenger) {
      // Challenger wins — becomes new champion
      const loserId = this.champion?.agentId
      this.stats.wins[this.challenger.agentId] = (this.stats.wins[this.challenger.agentId] || 0) + 1
      this.champion = { agentId: this.challenger.agentId, side: "p1" }
      this.challenger = null
      this.phase = "waiting"
      console.log(`[arena] Challenger wins! New champion: ${this.champion.agentId.slice(0, 8)}`)
      if (loserId) this.onEvict(loserId, "loser")
    } else {
      // Tie or unknown — evict both, reset
      const ids = [this.champion?.agentId, this.challenger?.agentId].filter(Boolean)
      this.champion = null
      this.challenger = null
      this.phase = "idle"
      console.log(`[arena] Tie — arena reset`)
      for (const id of ids) this.onEvict(id, "tie")
    }

    // If no one left, restart demo after delay
    if (!this.champion && !this.challenger) {
      setTimeout(() => {
        if (this.phase === "idle" && !this.champion) this._startDemo()
      }, 3000)
    }
  }

  submitAction(agentId, action, params) {
    if (this.phase !== "battle" || !this.battle || this.battle.battleOver) {
      return { error: "No active battle" }
    }
    const side = this.champion?.agentId === agentId ? "p1"
               : this.challenger?.agentId === agentId ? "p2"
               : null
    if (!side) return { error: "Agent not in battle" }
    if (!this.battle.needsInput(side)) return { error: "Not your turn or already submitted" }

    let choiceStr
    if (action === "move") {
      const slot = parseInt(params?.slot)
      if (!slot || slot < 1 || slot > 4) return { error: "Invalid move slot (1-4)" }
      choiceStr = `move ${slot}`
    } else if (action === "switch") {
      const slot = parseInt(params?.slot)
      if (!slot || slot < 1 || slot > TEAM_SIZE) return { error: `Invalid switch slot (1-${TEAM_SIZE})` }
      choiceStr = `switch ${slot}`
    } else {
      return { error: `Unknown action: ${action}` }
    }

    this.battle.pendingActions[side] = choiceStr
    return { ok: true, action, side }
  }

  leave(agentId) {
    if (this.champion?.agentId === agentId) {
      this.champion = null
      if (this.phase === "battle") {
        // Forfeit — challenger wins
        this.battle.battleOver = true
        this.battle.winner = this.battle.p2.name
        this.battle.winnerSide = "p2"
        this._onBattleEnd()
      } else {
        if (this.challenger) {
          this.champion = { agentId: this.challenger.agentId, side: "p1" }
          this.challenger = null
          this.phase = "waiting"
        } else {
          this.phase = "idle"
          setTimeout(() => { if (this.phase === "idle") this._startDemo() }, 3000)
        }
      }
    } else if (this.challenger?.agentId === agentId) {
      this.challenger = null
      if (this.phase === "battle") {
        this.battle.battleOver = true
        this.battle.winner = this.battle.p1.name
        this.battle.winnerSide = "p1"
        this._onBattleEnd()
      } else {
        // Just left the queue
      }
    }
  }

  getState() {
    return {
      phase: this.phase,
      mode: this.mode,
      champion: this.champion ? { agentId: this.champion.agentId } : null,
      challenger: this.challenger ? { agentId: this.challenger.agentId } : null,
      battle: this.battle?.getFullState() ?? null,
      stats: this.stats,
    }
  }

  getAgentView(agentId) {
    const state = this.getState()
    if (!this.battle) return state
    const side = this.champion?.agentId === agentId ? "p1"
               : this.challenger?.agentId === agentId ? "p2"
               : null
    if (side) {
      state.yourSide = side
      state.yourTeam = this.battle.parseState(side)
      state.needsInput = this.battle.needsInput(side)
    }
    return state
  }
}

// ---------------------------------------------------------------------------
// Manifest & World Server
// ---------------------------------------------------------------------------

fs.mkdirSync(DATA_DIR, { recursive: true })

const POKEMON_MANIFEST = {
  name: WORLD_NAME,
  type: "programmatic",
  theme: "pokemon-battle",
  description: `Gen ${GEN} random Pokemon battle arena. Two agents battle in arena-style matches.`,
  objective: "Challenge the champion! Win to become the new champion and defend your title.",
  rules: [
    { id: "random-teams", text: "Teams are randomly generated from the format pool.", enforced: true },
    { id: "arena-style", text: "Winner stays as champion; loser is evicted.", enforced: true },
    { id: "turn-timeout", text: `Each turn has a ${TURN_TIMEOUT_MS / 1000}s timeout. AI fills in on timeout.`, enforced: true },
    { id: "no-team-choice", text: "You cannot choose your team — it is randomly assigned.", enforced: true },
  ],
  actions: {
    move: {
      desc: "Use a move from your active Pokemon",
      params: { slot: { type: "number", required: true, desc: "Move slot 1-4", min: 1, max: 4 } },
      phase: ["battle"],
    },
    switch: {
      desc: "Switch to a different Pokemon on your team",
      params: { slot: { type: "number", required: true, desc: "Team slot to switch to", min: 1, max: TEAM_SIZE } },
      phase: ["battle"],
    },
  },
  lifecycle: {
    matchmaking: "arena",
    evictionPolicy: "loser-leaves",
    turnTimeoutMs: TURN_TIMEOUT_MS,
    turnTimeoutAction: "default-move",
  },
  state_fields: [
    "phase — arena phase: idle, waiting, battle, battleOver",
    "mode — demo (AI vs AI) or live (real agents)",
    "champion — current champion agentId",
    "challenger — current challenger agentId",
    "battle — full battle state with teams, moves, log",
    "stats — total battles and win counts",
  ],
}

const evictedAgents = new Set()

const arena = new ArenaManager({
  onEvict(agentId, reason) {
    evictedAgents.add(agentId)
    console.log(`[arena] Evicting ${agentId.slice(0, 8)} (${reason})`)
  },
})

const server = await createWorldServer(
  {
    worldId: WORLD_ID,
    worldName: WORLD_NAME,
    worldTheme: "pokemon-battle",
    worldType: "programmatic",
    port: PORT,
    publicPort: parseInt(process.env.PUBLIC_PORT ?? String(PORT)),
    publicAddr: process.env.PUBLIC_ADDR ?? null,
    dataDir: DATA_DIR,
    bootstrapUrl: process.env.BOOTSTRAP_URL,
    maxAgents: parseInt(process.env.MAX_AGENTS ?? "2"),
    isPublic: (process.env.WORLD_PUBLIC ?? "true") === "true",
    password: process.env.WORLD_PASSWORD ?? "",
    broadcastIntervalMs: parseInt(process.env.BROADCAST_INTERVAL_MS ?? "5000"),
    setupRoutes(fastify) {
      const webDir = path.join(__dirname, "web")
      fastify.get("/", async (_req, reply) => {
        const html = fs.readFileSync(path.join(webDir, "demo.html"), "utf8")
        return reply.type("text/html").send(html)
      })
      fastify.get("/demo.js", async (_req, reply) => {
        const js = fs.readFileSync(path.join(webDir, "demo.js"), "utf8")
        return reply.type("application/javascript").send(js)
      })
      fastify.get("/demo.css", async (_req, reply) => {
        const css = fs.readFileSync(path.join(webDir, "demo.css"), "utf8")
        return reply.type("text/css").send(css)
      })
      fastify.get("/arena/state", async () => {
        return { ok: true, ...arena.getState() }
      })
      fastify.get("/arena/info", async () => {
        const ping = await fetch(`http://localhost:${PORT}/peer/ping`).then(r => r.json())
        return {
          ok: true,
          worldId: WORLD_ID,
          worldName: WORLD_NAME,
          agentId: ping.agentId,
          port: PORT,
          format: FORMAT,
          teamSize: TEAM_SIZE,
          turnTimeoutMs: TURN_TIMEOUT_MS,
          maxAgents: 2,
        }
      })
    },
  },
  {
    async onJoin(agentId, _data) {
      const result = arena.join(agentId)
      return {
        manifest: POKEMON_MANIFEST,
        state: { ...result, ...arena.getAgentView(agentId) },
      }
    },
    async onAction(agentId, data) {
      const action = data.action
      const params = data.params ?? data
      const result = arena.submitAction(agentId, action, params)
      return { ok: !result.error, state: { ...result, ...arena.getAgentView(agentId) } }
    },
    async onLeave(agentId) {
      arena.leave(agentId)
    },
    getState() {
      return arena.getState()
    },
  }
)

console.log(`[arena] Pokemon Battle Arena on http://localhost:${PORT}/`)
console.log(`[arena] Format: ${FORMAT}, team size: ${TEAM_SIZE}, turn timeout: ${TURN_TIMEOUT_MS / 1000}s`)
console.log(`[arena] Mode: demo (AI vs AI) — waiting for real agents to join`)
