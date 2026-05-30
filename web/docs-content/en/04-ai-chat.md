# AI Chat

The AI chat in the sidebar is an **agent** — not just a chatbot. It
reads your project, writes files, edits code, runs commands in the
embedded terminal and generates 3D models via Blender. Always within
the active project sandbox, and (in default mode) asking approval
per tool before each action.

## How login works

<div class="callout callout-warn">

**The IDE has no account system of its own.** It uses your
**Claude Code** subscription — Anthropic's official CLI. You log in
once via the CLI, and the IDE detects the credentials automatically.

</div>

Why this way? Three reasons:

1. **You use your own plan.** Billing goes to your Claude Code
   subscription (Pro/Max), not through the IDE.
2. **No exposed API key.** You don't have to paste an Anthropic key
   anywhere — the OAuth token lives in `~/.claude/`.
3. **Same session across tools.** If you already use Claude Code in
   the terminal, the IDE continues the conversation from the same
   backend.

## Step by step

### 1. Install Claude Code

The official CLI is distributed by Anthropic. Official page:
[claude.com/product/claude-code](https://claude.com/product/claude-code).

Typical install (check the official page for the current command):

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Log in to your Claude account

In the terminal:

```bash
claude
```

The first run opens the browser for OAuth login. Sign in to the
account that has a **Claude Pro** or **Claude Max** subscription —
both work. Credentials are stored in `~/.claude/`.

To confirm:

```bash
claude --version
```

### 3. Open the IDE

The IDE detects the credentials automatically — there's no login
button, no API key field. Just open the chat in the sidebar and
send your first message.

<div class="callout callout-info">

**No active subscription?** The chat returns an authentication
error on the first turn. The IDE has no free fallback — Claude
Pro/Max is the required path.

</div>

## Operation modes

The chat has two modes, toggleable at the top of the sidebar:

- **Ask** (default) — for each destructive tool (`Write`, `Edit`,
  `Bash`), a card appears asking approval. Read tools (`Read`,
  `Glob`, `Grep`) run directly.
- **Auto** — everything is approved automatically. Tool cards still
  appear as history, without blocking. Useful when you trust the
  request and want to see the result end-to-end.

## Sandbox

The agent can only touch files inside the **active project** (what's
open in the file tree). Write/Edit attempts outside the project
fail. Read can access pasted images (`Ctrl+V` in the conversation)
that live in a directory managed by the IDE — that's a case allowed
by design.

## History

Conversation history is saved per project. When you reopen the same
project, the IDE restores the backend session — you can continue
the discussion across IDE runs.

## Known limitations

- No programmatic login in the IDE itself — depends on the CLI.
- No "manual" API key support as fallback (conscious decision:
  simplifies the auth model).
- The agent follows the rules documented in the project's ADRs,
  but can still make mistakes — always review diffs before
  accepting.
