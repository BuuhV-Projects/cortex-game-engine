# Blender (3D model generator)

The IDE can generate 3D models (`.glb`) from a **natural language
description** — you ask in the AI chat, Claude writes a Python script
for Blender, Blender runs headless and returns the asset ready to
drop into the scene.

<div class="callout callout-warn">

**Without Blender installed, this feature does not work.** The IDE
**does not bundle** Blender — it depends on the executable installed
on your machine. The other features (editor, preview, AI chat for
code, generating installers) work normally without it.

</div>

## Install Blender

| OS | How to install |
|---|---|
| **Windows** | Download at [blender.org/download](https://www.blender.org/download/) and run the installer. |
| **macOS** | `brew install --cask blender` or download the `.dmg` at [blender.org/download](https://www.blender.org/download/). |
| **Linux** | `sudo apt install blender` (Debian/Ubuntu) or via Flatpak / your distro's package. |

**Recommended version: Blender 4.x.** The generator's system prompt
assumes the modern API (Boolean modifiers with `EXACT`/`MANIFOLD`
solvers, current glTF exporter). Blender 3.x may work but is
unstable.

## Configure the executable path

The IDE looks for Blender in two places, in this order:

1. **Environment variable `BLENDER_PATH`** — absolute path to the
   executable. Takes priority.
2. **`blender` command in PATH** — used if the first option is not
   defined.

### Windows

The Blender installer **does not add `blender.exe` to PATH by
default**. You have two options:

#### Option A: define `BLENDER_PATH` (simpler)

1. Open **System Properties → Environment Variables**
   (or search for "environment variables" in the Start menu).
2. Under "User variables", click **New...**
3. Name: `BLENDER_PATH`
4. Value: full executable path, typically
   `C:\Program Files\Blender Foundation\Blender 4.2\blender.exe`
   (adjust the version number).
5. **Close and reopen the IDE** — running processes don't see
   environment changes made after they started.

#### Option B: add to PATH

1. Same "Environment Variables" screen.
2. Edit the user **Path** variable.
3. Add `C:\Program Files\Blender Foundation\Blender 4.2\`
   (the folder, without `blender.exe` at the end).
4. Reopen the IDE.

### macOS

`brew install --cask blender` already handles PATH — the `blender`
command becomes available in any terminal.

If you downloaded the `.app` manually, set `BLENDER_PATH` pointing
to the binary inside the bundle:

```bash
export BLENDER_PATH="/Applications/Blender.app/Contents/MacOS/Blender"
```

Add to `~/.zshrc` or `~/.bash_profile` to persist.

### Linux

`apt install blender` (or equivalent) registers `blender` in PATH —
nothing extra to do.

## Validate

In the embedded terminal of the IDE (or in any external terminal,
then restart the IDE):

```bash
blender --version
```

Should print something like `Blender 4.2.0`. If you see "command
not found" or similar, the PATH/`BLENDER_PATH` is not correct yet.

## How to use inside the IDE

In the sidebar AI chat, describe the asset naturally:

> "Create a medieval sword with polished metal blade and wooden
> handle. Save in `assets/sword.glb`."

> "Generate a cartoon-style car tire and save in
> `assets/wheel.glb`."

The agent decides when to call the `generate_blender_model` tool —
you don't need to mention Blender explicitly. Asset generation
tools ask for approval (`ask` mode) before running, so you see the
request in the card and approve.

The `.glb` lands at the path you asked (inside the project). Right
after you can ask the same AI chat to load the model into the scene
via `AssetLoader`.

<div class="callout callout-info">

**Debug script saved.** Along with the `.glb`, the generator saves
the Python script that produced the model in a temp file
(`%TEMP%\blender_gen_<timestamp>.py` on Windows). When some model
comes out weird or Blender crashes, that file lets you reproduce
and tweak by hand.

</div>

## Limitations

- **Time**: each generation takes ~10–30 seconds (Claude thinks the
  script + Blender runs headless). Not instant.
- **Complexity**: detailed models (rigged humanoid character,
  complex architecture) generally come out approximate. Works well
  for props, simple terrain, stylized shapes.
- **No external textures**: the generator uses Principled BSDF with
  solid colors and PBR parameters (Metallic/Roughness). Bitmap
  textures are not in this version.
- **Determinism**: the same prompt does **not** generate the same
  model twice — Claude rewrites the script every call. If you liked
  a result, keep the `.glb` and the Python script saved in `%TEMP%`.

## I'm not going to use AI for models — can I skip this?

You can. You still write components, systems and scenes in
TypeScript normally, and load `.glb` files you produced elsewhere
via `AssetLoader`. Blender is only required if you want to **generate**
models through the IDE.
