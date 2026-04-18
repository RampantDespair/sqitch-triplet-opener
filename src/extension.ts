import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

type TripletType = "deploy" | "revert" | "verify";

const TRIPLET_TYPES: TripletType[] = ["deploy", "revert", "verify"];

const DEFAULT_ORDER: TripletType[] = ["deploy", "revert", "verify"];

export function activate(context: vscode.ExtensionContext): void {
  const openTriplet = vscode.commands.registerCommand(
    "sqitchTripletOpener.openTriplet",
    async (firstArg: unknown) => {
      const uri = resourceUriOrFirst(firstArg);
      if (uri == null) {
        vscode.window.showErrorMessage(
          "Sqitch Triplet Opener: no file selected. Right-click a .sql file in the Explorer.",
        );
        return;
      }
      const filePath = uri.fsPath;

      // Step 1: Identify triplet root by walking up directories
      const tripletInfo = findTripletRoot(filePath);
      if (!tripletInfo) {
        vscode.window.showErrorMessage(
          `Not a valid Sqitch file: could not find a "deploy", "revert", or "verify" ancestor directory for:\n${filePath}`,
        );
        return;
      }

      const { changeName, root } = tripletInfo;

      // Step 2: Build and validate the triplet, then open it
      await openTripletForChange(root, changeName);
    },
  );

  const openTripletFolder = vscode.commands.registerCommand(
    "sqitchTripletOpener.openTripletFolder",
    async (firstArg: unknown) => {
      const uri = resourceUriOrFirst(firstArg);
      if (uri == null) {
        vscode.window.showErrorMessage(
          "Sqitch Triplet Opener: no folder selected. Right-click a folder in the Explorer.",
        );
        return;
      }
      const folderPath = uri.fsPath;

      // Step 1: Collect all .sql files directly in the folder (non-recursive)
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(folderPath, { withFileTypes: true });
      } catch {
        vscode.window.showErrorMessage(`Cannot read directory:\n${folderPath}`);
        return;
      }

      const sqlFiles = entries
        .filter((e) => e.isFile() && e.name.endsWith(".sql"))
        .map((e) => path.join(folderPath, e.name));

      if (sqlFiles.length === 0) {
        vscode.window.showErrorMessage(
          `No .sql files found directly in:\n${folderPath}`,
        );
        return;
      }

      // Step 2: Resolve each sql file to a triplet and open it
      // Collect all errors and report them together rather than bailing on the first one
      const errors: string[] = [];

      for (const filePath of sqlFiles) {
        const tripletInfo = findTripletRoot(filePath);
        if (!tripletInfo) {
          errors.push(`Skipped (no triplet ancestor): ${filePath}`);
          continue;
        }

        const { changeName, root } = tripletInfo;
        const result = await openTripletForChange(root, changeName);
        if (result !== "ok") {
          errors.push(result);
        }
      }

      if (errors.length > 0) {
        vscode.window.showWarningMessage(
          `Sqitch Triplet Opener — some files had issues:\n${errors.join("\n")}`,
        );
      }
    },
  );

  context.subscriptions.push(openTriplet, openTripletFolder);
}

export function deactivate(): void {}

function buildTripletPaths(
  root: string,
  changeName: string,
): Record<TripletType, string> {
  return {
    deploy: path.join(root, "deploy", `${changeName}.sql`),
    revert: path.join(root, "revert", `${changeName}.sql`),
    verify: path.join(root, "verify", `${changeName}.sql`),
  };
}

function findTripletRoot(
  filePath: string,
): { changeName: string; root: string; type: TripletType } | null {
  let dir = path.dirname(filePath);
  const fileName = path.basename(filePath, ".sql");

  // Walk up until we find a directory whose name is one of the triplet types
  while (true) {
    const dirName = path.basename(dir);

    if (TRIPLET_TYPES.includes(dirName as TripletType)) {
      const root = path.dirname(dir);
      // The change name is relative from the triplet dir to preserve subdirectory structure
      const relativeFromTripletDir = path.relative(dir, path.dirname(filePath));
      const changeName = relativeFromTripletDir
        ? path.join(relativeFromTripletDir, fileName)
        : fileName;

      return { changeName, root, type: dirName as TripletType };
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root without finding a triplet directory
      return null;
    }
    dir = parent;
  }
}

function getTripletOrder(): TripletType[] {
  const config = vscode.workspace.getConfiguration("sqitchTripletOpener");
  const raw = config.get<string[]>("order", DEFAULT_ORDER);

  const validated = raw.filter((entry): entry is TripletType =>
    TRIPLET_TYPES.includes(entry as TripletType),
  );

  if (validated.length !== 3) {
    vscode.window.showWarningMessage(
      `sqitchTripletOpener.order is invalid. Falling back to default order: ${DEFAULT_ORDER.join(", ")}.`,
    );
    return [...DEFAULT_ORDER];
  }

  const hasAll = TRIPLET_TYPES.every((t) => validated.includes(t));
  if (!hasAll) {
    vscode.window.showWarningMessage(
      `sqitchTripletOpener.order must contain all three types (deploy, revert, verify). Falling back to default.`,
    );
    return [...DEFAULT_ORDER];
  }

  return validated;
}

async function openInGroup(
  uri: vscode.Uri,
  viewColumn: vscode.ViewColumn,
): Promise<void> {
  await vscode.window.showTextDocument(uri, {
    preserveFocus: false,
    preview: false,
    viewColumn,
  });
}

/**
 * Builds paths, validates all three files exist, then opens them.
 * Returns "ok" on success, or an error string that the caller can surface.
 */
async function openTripletForChange(
  root: string,
  changeName: string,
): Promise<"ok" | string> {
  const paths = buildTripletPaths(root, changeName);

  const missing: string[] = [];
  for (const type of TRIPLET_TYPES) {
    if (!fs.existsSync(paths[type])) {
      missing.push(`${type}: ${paths[type]}`);
    }
  }

  if (missing.length > 0) {
    const msg = `Cannot open Sqitch triplet — missing file(s):\n${missing.join("\n")}`;
    vscode.window.showErrorMessage(msg);
    return msg;
  }

  const order = getTripletOrder();
  const orderedUris = order.map((type) => vscode.Uri.file(paths[type]));

  // Use ViewColumn.Beside for 2nd and 3rd files. Numeric ViewColumn.Two/Three
  // only apply when those groups already exist; the workbench may otherwise
  // open in the active group (e.g. after a Cursor/VS Code update), so
  // "Beside" reliably creates the split layout.
  const firstCol =
    vscode.window.tabGroups.all[0]?.viewColumn ?? vscode.ViewColumn.One;
  await openInGroup(orderedUris[0], firstCol);
  await openInGroup(orderedUris[1], vscode.ViewColumn.Beside);
  await openInGroup(orderedUris[2], vscode.ViewColumn.Beside);

  return "ok";
}

/**
 * Explorer context / multi-select: argument may be a single Uri, Uri[], or
 * (in some builds) the resource may be missing; normalize before use.
 */
function resourceUriOrFirst(uris: unknown): undefined | vscode.Uri {
  if (uris == null) {
    return undefined;
  }
  if (Array.isArray(uris)) {
    if (uris.length < 1) {
      return undefined;
    }
    return uris[0] as vscode.Uri;
  }
  if (typeof (uris as vscode.Uri).fsPath === "string") {
    return uris as vscode.Uri;
  }
  return undefined;
}
