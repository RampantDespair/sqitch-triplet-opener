# Sqitch Triplet Opener

A VS Code / Cursor extension that opens the matching `deploy`, `revert`, and `verify` SQL files side by side from the Explorer context menu.

## Features

- Right-click any `.sql` file inside a Sqitch project to open all three triplet files at once
- Automatically walks up the directory tree to find the triplet root — works with nested change files (e.g. `deploy/schema/my_change.sql`)
- Reuses existing editor groups if already open, otherwise creates new ones
- Configurable file order via VS Code settings

## Requirements

Your project must follow the standard Sqitch directory structure:

```
my-project/
  deploy/
    my_change.sql
  revert/
    my_change.sql
  verify/
    my_change.sql
```

Nested changes are supported:

```
my-project/
  deploy/
    schema/
      my_change.sql
  revert/
    schema/
      my_change.sql
  verify/
    schema/
      my_change.sql
```

## Usage

1. Open your Sqitch project in VS Code or Cursor
2. In the Explorer panel, right-click any `.sql` file
3. Select **Open Sqitch Deploy/Revert/Verify**

The three files will open side by side in separate editor groups. If editor groups are already open, they will be reused. The last file in the configured order will receive focus.

If any of the three triplet files are missing from disk, an error notification will appear and no files will be opened.

## Configuration

| Setting                     | Type       | Default                          | Description                                                |
| --------------------------- | ---------- | -------------------------------- | ---------------------------------------------------------- |
| `sqitchTripletOpener.order` | `string[]` | `["deploy", "revert", "verify"]` | Order in which the three files are opened in editor groups |

### Example

To open in `deploy → verify → revert` order, add this to your `settings.json`:

```json
"sqitchTripletOpener.order": ["deploy", "verify", "revert"]
```

Valid values are `"deploy"`, `"revert"`, and `"verify"`. All three must be present. If the setting is invalid, the extension falls back to the default order and shows a warning.

## Installation

### From VSIX

1. Download the latest `.vsix` from the [Releases](https://github.com/RampantDespair/sqitch-triplet-opener/releases) page
2. Open the Extensions panel (`Ctrl+Shift+X`)
3. Click the `...` menu (top right) → **Install from VSIX...**
4. Select the downloaded file and reload the window

Or via command line:

```bash
code --install-extension sqitch-triplet-opener-x.x.x.vsix
```

## License

MIT
