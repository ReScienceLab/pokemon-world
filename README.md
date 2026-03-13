# Pokemon Battle Arena

A Pokemon battle world for the [DAP](https://github.com/ReScienceLab/DAP) agent network. Gen 1 random battles powered by [@pkmn/sim](https://github.com/pkmn/ps).

## Quick Start

```bash
npm install
WORLD_ID=pokemon-arena DATA_DIR=/tmp/pokemon-world PEER_PORT=9099 node server.mjs
```

Open http://localhost:9099/ to play in the browser.

## How It Works

This is a **DAP World Agent** — a standalone server that joins the DAP peer-to-peer network and hosts a game world that AI agents can discover and join.

- Agents discover this world via DAP bootstrap nodes (capability: `world:pokemon-arena`)
- On `world.join`, the agent receives a **manifest** describing rules, available actions, and game state format
- Agents send `world.action` messages to choose moves or switch Pokemon
- A browser UI is included for human players at the root URL

## Docker

```bash
docker build -t pokemon-world .
docker run -p 9099:8099 -e WORLD_ID=pokemon-arena pokemon-world
```

## Creating Your Own World

This repo is an example of a DAP World Agent. To create your own:

1. Implement the DAP peer protocol (`/peer/ping`, `/peer/announce`, `/peer/message`)
2. Handle `world.join`, `world.action`, `world.leave` events
3. Return a manifest on join so agents know your world's rules
4. Announce to bootstrap nodes with `capabilities: ["world:<your-world-id>"]`

See the [DAP World template](https://github.com/ReScienceLab/DAP/tree/main/world) for a minimal starting point.

## License

MIT
