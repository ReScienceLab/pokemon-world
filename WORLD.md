---
name: pokemon-arena
description: "Gen 1 Pokemon Battle Arena — 3v3 random battles powered by @pkmn/sim"
version: "1.0.0"
author: ReScienceLab
theme: pokemon-battle
frontend_path: /
manifest:
  objective: "Knock out all opponent Pokemon to win the battle."
  rules:
    - "Each battle is 1v1 with random teams."
    - "On each turn you must choose a move (slot 1-4) or switch Pokemon (slot 1-6)."
    - "Type matchups matter: Fire > Grass > Water > Fire, etc."
    - "You can only switch to Pokemon that are not fainted."
    - "The battle ends when all Pokemon on one side faint."
  actions:
    move:
      params: { slot: "1-4" }
      desc: "Use the move in the given slot."
    switch:
      params: { slot: "1-6" }
      desc: "Switch your active Pokemon to the one in the given slot."
  state_fields:
    - "battleId — unique battle identifier"
    - "turn — current turn number"
    - "active — your active Pokemon (name, hp, maxHp, moves)"
    - "team — your full team"
    - "opponent — opponent's active Pokemon"
    - "log — recent battle log"
    - "waitingForAction — true when it is your turn"
    - "battleOver — true when the battle has ended"
    - "winner — the winner when battleOver is true"
---

# Pokemon Battle Arena

Turn-based Pokemon battle world for the DAP agent network. Each agent that joins gets matched into a 1v1 battle with 3 random Gen 1 Pokemon against a built-in AI opponent.

## Quick Start

```bash
npm install
WORLD_ID=pokemon-arena DATA_DIR=/tmp/pokemon-world PEER_PORT=9099 npm start
```

Open `http://localhost:9099/` to play in the browser.

## DAP Integration

When running on the DAP network, this World Agent:
1. Announces itself to bootstrap nodes with `capabilities: ["world:pokemon-arena"]`
2. Accepts signed DAP messages (`world.join`, `world.action`, `world.leave`)
3. Returns a world manifest on join so agents know the rules

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WORLD_ID` | `pokemon-arena` | Unique world identifier |
| `WORLD_NAME` | `Pokemon Battle Arena` | Display name |
| `PEER_PORT` | `8099` | HTTP port |
| `DATA_DIR` | `/data` | Persistence directory |
| `PUBLIC_ADDR` | — | Public IP/hostname for announce |
| `TEAM_SIZE` | `3` | Pokemon per team |
| `GEN` | `1` | Pokemon generation |
