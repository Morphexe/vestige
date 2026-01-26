# Vestige

**Memory that fades like yours does.**

The only MCP memory server built on cognitive science. FSRS-6 spaced repetition, spreading activation, synaptic tagging—all running 100% local.

[![GitHub stars](https://img.shields.io/github/stars/samvallad33/vestige?style=social)](https://github.com/samvallad33/vestige)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-blue)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-green)](https://modelcontextprotocol.io)

---

## Why Vestige?

| Problem | How Vestige Solves It |
|---------|----------------------|
| AI forgets everything between sessions | Persistent memory with intelligent retrieval |
| RAG dumps irrelevant context | **Prediction Error Gating** auto-decides CREATE/UPDATE/SUPERSEDE |
| Memory bloat eats your token budget | **FSRS-6 decay** naturally fades unused memories |
| No idea what AI "knows" | `recall`, `semantic_search`, `hybrid_search` let you query |
| Context pollution confuses the model | **29 atomic tools** > 1 overloaded tool with 15 parameters |

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/samvallad33/vestige
cd vestige
cargo build --release
```

Add to your PATH:
```bash
# macOS/Linux
sudo cp target/release/vestige-mcp /usr/local/bin/

# Or add to ~/.bashrc / ~/.zshrc
export PATH="$PATH:/path/to/vestige/target/release"
```

### 2. Configure Claude

**Option A: One-liner (Recommended)**
```bash
claude mcp add vestige vestige-mcp
```

**Option B: Manual Config**

<details>
<summary>Claude Code (~/.claude/settings.json)</summary>

```json
{
  "mcpServers": {
    "vestige": {
      "command": "vestige-mcp"
    }
  }
}
```
</details>

<details>
<summary>Claude Desktop (macOS)</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "vestige": {
      "command": "vestige-mcp"
    }
  }
}
```
</details>

<details>
<summary>Claude Desktop (Windows)</summary>

Add to `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "vestige": {
      "command": "vestige-mcp"
    }
  }
}
```
</details>

### 3. Restart Claude

Restart Claude Code or Desktop. You should see **29 Vestige tools** available.

### 4. Test It

Ask Claude:
> "Remember that I prefer TypeScript over JavaScript"

Then in a new session:
> "What are my coding preferences?"

It remembers.

---

## Important Notes

### First-Run Network Requirement

Vestige downloads the **Nomic Embed Text v1.5** model (~130MB) from Hugging Face on first use for semantic search.

**All subsequent runs are fully offline.**

Model cache location:
- macOS/Linux: `~/.cache/huggingface/`
- Windows: `%USERPROFILE%\.cache\huggingface\`

### Data Storage & Backup

All memories are stored in a **single local SQLite file**:

| Platform | Database Location |
|----------|------------------|
| macOS | `~/Library/Application Support/com.vestige.core/vestige.db` |
| Linux | `~/.local/share/vestige/core/vestige.db` |
| Windows | `%APPDATA%\vestige\core\vestige.db` |

**⚠️ There is no cloud sync, no redundancy, and no automatic backup.**

If that file gets:
- Accidentally deleted
- Corrupted (disk failure, power loss mid-write)
- Lost (laptop stolen, hard drive dies)

...the memories are **gone**.

---

**For AI memory = Totally Fine**

If you lose your Claude memories, you just start over. Annoying but not catastrophic.

**For critical data = Not Fine**

Don't store medical records, financial transactions, or legal documents in Vestige.

---

**Backup Options:**

*Manual (one-time):*
```bash
# macOS
cp ~/Library/Application\ Support/com.vestige.core/vestige.db ~/vestige-backup.db

# Linux
cp ~/.local/share/vestige/core/vestige.db ~/vestige-backup.db
```

*Automated (cron job):*
```bash
# Add to crontab - backs up every hour
0 * * * * cp ~/Library/Application\ Support/com.vestige.core/vestige.db ~/.vestige-backups/vestige-$(date +\%Y\%m\%d-\%H\%M).db
```

*Or just use **Time Machine** (macOS) / **Windows Backup** / **rsync** — they'll catch the file automatically.*

> For personal use with Claude? Don't overthink it. The memories aren't that precious.

---

## All 29 Tools

### Core Memory
| Tool | Description |
|------|-------------|
| `ingest` | Add new knowledge to memory |
| `smart_ingest` | **Intelligent ingestion** with Prediction Error Gating—auto-decides CREATE/UPDATE/SUPERSEDE |
| `recall` | Search by keywords, ranked by retention strength |
| `semantic_search` | Find conceptually related content via embeddings |
| `hybrid_search` | Combined keyword + semantic with RRF fusion |
| `get_knowledge` | Retrieve specific memory by ID |
| `delete_knowledge` | Remove a memory |
| `mark_reviewed` | FSRS review with rating (1=Again, 2=Hard, 3=Good, 4=Easy) |

### Feedback System
| Tool | Description |
|------|-------------|
| `promote_memory` | Thumbs up—memory led to good outcome |
| `demote_memory` | Thumbs down—memory was wrong or unhelpful |
| `request_feedback` | Ask user if a memory was helpful |

### Stats & Maintenance
| Tool | Description |
|------|-------------|
| `get_stats` | Memory system statistics |
| `health_check` | System health status |
| `run_consolidation` | Trigger decay cycle, generate embeddings |

### Codebase Memory
| Tool | Description |
|------|-------------|
| `remember_pattern` | Save code patterns/conventions |
| `remember_decision` | Save architectural decisions with rationale |
| `get_codebase_context` | Retrieve patterns/decisions for current project |

### Prospective Memory (Intentions)
| Tool | Description |
|------|-------------|
| `set_intention` | "Remind me to X when Y" |
| `check_intentions` | Check triggered intentions for current context |
| `complete_intention` | Mark intention as fulfilled |
| `snooze_intention` | Delay an intention |
| `list_intentions` | View all intentions |

### Neuroscience Layer
| Tool | Description |
|------|-------------|
| `get_memory_state` | Check if memory is Active/Dormant/Silent/Unavailable |
| `list_by_state` | List memories grouped by cognitive state |
| `state_stats` | Distribution of memory states |
| `trigger_importance` | Retroactively strengthen recent memories (Synaptic Tagging) |
| `find_tagged` | Find high-retention memories |
| `tagging_stats` | Synaptic tagging statistics |
| `match_context` | Context-dependent retrieval (Encoding Specificity) |

---

## How It Works

### Prediction Error Gating

When you call `smart_ingest`, Vestige compares new content against existing memories:

| Similarity | Action | Why |
|------------|--------|-----|
| > 0.92 | **REINFORCE** existing | Almost identical—just strengthen |
| > 0.75 | **UPDATE** existing | Related—merge the information |
| < 0.75 | **CREATE** new | Novel—add as new memory |

This prevents duplicate memories and keeps your knowledge base clean.

### FSRS-6 Spaced Repetition

Memories decay over time following the **Ebbinghaus forgetting curve**:

```
Retention = e^(-time/stability)
```

- Memories you access stay strong
- Memories you ignore fade naturally
- No manual cleanup required

FSRS-6 uses 21 parameters optimized on millions of Anki reviews—30% more efficient than SM-2.

### Memory States

Based on accessibility, memories exist in four states:

| State | Description |
|-------|-------------|
| **Active** | High retention, immediately retrievable |
| **Dormant** | Medium retention, retrievable with effort |
| **Silent** | Low retention, rarely surfaces |
| **Unavailable** | Below threshold, effectively forgotten |

---

## The Science

Vestige implements concepts from memory research:

| Feature | Inspired By | Reference |
|---------|-------------|-----------|
| Spaced repetition | FSRS-6 algorithm | [Piotr Wozniak, 2022](https://github.com/open-spaced-repetition/fsrs4anki) |
| Storage vs Retrieval strength | Bjork's New Theory of Disuse | [Bjork & Bjork, 1992](https://psycnet.apa.org/record/1992-97586-004) |
| Retroactive importance | Synaptic Tagging & Capture | [Frey & Morris, 1997](https://www.nature.com/articles/385533a0) |
| Context-dependent retrieval | Encoding Specificity Principle | [Tulving & Thomson, 1973](https://psycnet.apa.org/record/1973-31800-001) |
| Forgetting curve | Ebbinghaus decay function | [Ebbinghaus, 1885](https://en.wikipedia.org/wiki/Forgetting_curve) |

> **Note**: These are *simplified models inspired by* cognitive science research, designed to be practical for AI memory management. They are not literal implementations of neural biochemistry.

---

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VESTIGE_DATA_DIR` | Platform default | Custom database location |
| `VESTIGE_LOG_LEVEL` | `info` | Logging verbosity |
| `RUST_LOG` | - | Detailed tracing output |

Command-line options:
```bash
vestige-mcp --data-dir /custom/path
vestige-mcp --help
```

---

## Troubleshooting

### "Command not found" after installation

Make sure `vestige-mcp` is in your PATH:
```bash
which vestige-mcp
# Should output: /usr/local/bin/vestige-mcp
```

If not found:
```bash
# Use full path in Claude config
claude mcp add vestige /full/path/to/vestige-mcp
```

### Model download fails

First run requires internet to download the embedding model. If behind a proxy:
```bash
export HTTPS_PROXY=your-proxy:port
```

### "Tools not showing" in Claude

1. Check config file syntax (valid JSON)
2. Restart Claude completely (not just reload)
3. Check logs: `tail -f ~/.claude/logs/mcp.log`

### Database locked errors

Vestige uses SQLite with WAL mode. If you see lock errors:
```bash
# Only one instance should run at a time
pkill vestige-mcp
```

---

## Development

```bash
# Run tests
cargo test --all-features

# Run with logging
RUST_LOG=debug cargo run --release

# Build optimized binary
cargo build --release --all-features
```

---

## Updating

```bash
cd vestige
git pull
cargo build --release
sudo cp target/release/vestige-mcp /usr/local/bin/
```

Then restart Claude.

---

## License

MIT OR Apache-2.0 (dual-licensed)

---

## Contributing

Issues and PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

<p align="center">
  <i>Built by <a href="https://github.com/samvallad33">@samvallad33</a></i>
</p>
