# Game icons

When you generate the installer, the `.exe` carries **two icons that
you control**:

- **Installer icon** — what shows on the downloaded `.exe` and on
  the install wizard window.
- **Game icon** — what shows in the taskbar, in the corner of the
  game window and on the Desktop shortcut after install.

By default, both come from a gray-blue placeholder generated
automatically by the IDE. Replacing them with real art is a single
command.

## Where the icons live

Inside the project:

```
your-game/
└── src-tauri/
    └── icons/
        ├── 32x32.png         small icon (taskbar, file explorer)
        ├── 128x128.png       medium icon (Start menu, shortcuts)
        ├── 128x128@2x.png    256×256 version (high-DPI)
        └── icon.ico          Windows icon (installer + .exe)
```

The `tauri.conf.json` references these files in the `bundle.icon`
field. You don't need to edit that list — just replace the files.

## Generate from your own PNG

The Tauri CLI has a command that generates all sizes from
**a single source PNG**. Run it in the IDE's embedded terminal:

```bash
yarn tauri icon path/to/icon.png
```

It automatically replaces the 4 files in `src-tauri/icons/`.

### Source PNG requirements

| Item | Recommended value |
|---|---|
| Size | **1024×1024** (square) |
| Format | PNG with transparency (alpha channel) |
| Content | Centered logo/symbol, with inner margin |

<div class="callout callout-warn">

**Square required.** A rectangular PNG generates distorted icons at
smaller sizes. If your original art is rectangular, open it in an
editor (Figma, Photoshop, GIMP) and place it inside a 1024×1024
canvas first.

</div>

### Where to keep the source PNG

Suggested convention: save it in `assets/branding/icon.png` inside
the project. That path is versioned in git and easy to iterate when
the art changes:

```bash
yarn tauri icon assets/branding/icon.png
```

## Test the result

After generating:

1. **Menu → Project → Generate installer...** — packages the `.exe`
   with the new icons.
2. Open `src-tauri/target/release/bundle/nsis/` in Explorer — the
   `_setup.exe` icon already reflects what you generated.
3. Run the `_setup.exe` — the install wizard uses the same icon.
4. After installing, open the game — the icon shows in the taskbar
   and in the corner of the window.

<div class="callout callout-info">

**Tip.** Windows aggressively caches icons. If you regenerated and
still see the old placeholder in Explorer, clear the cache: run
`ie4uinit.exe -show` in the terminal, or restart Explorer via Task
Manager.

</div>

## Set the window name and title

The name that shows in the **game window title**, **Start menu** and
**Add/Remove Programs** comes from `tauri.conf.json`:

```json
{
  "productName": "My Cool Game",
  "version": "0.0.1",
  "app": {
    "windows": [
      {
        "title": "My Cool Game",
        "width": 1280,
        "height": 720
      }
    ]
  }
}
```

By default, both fields are filled with the project name. Change
them whenever — the next **Generate installer...** call picks up
the change.

## I'll replace the icon later — do I lose anything?

No. `yarn tauri icon` overwrites the 4 files in `src-tauri/icons/`,
and the next Rust incremental build picks them up immediately. The
"replace icon → build" cycle takes the same ~30 seconds of a normal
incremental build.
