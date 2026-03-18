import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

type TripletType = "deploy" | "revert" | "verify";

const TRIPLET_TYPES: TripletType[] = ["deploy", "revert", "verify"];

const DEFAULT_ORDER: TripletType[] = ["deploy", "revert", "verify"];

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "sqitchTripletOpener.openTriplet",
    async (uri: vscode.Uri) => {
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

      // Step 2: Build all three paths
      const paths = buildTripletPaths(root, changeName);

      // Step 3: Verify all three files exist before opening anything
      const missing: string[] = [];
      for (const type of TRIPLET_TYPES) {
        if (!fs.existsSync(paths[type])) {
          missing.push(`${type}: ${paths[type]}`);
        }
      }

      if (missing.length > 0) {
        vscode.window.showErrorMessage(
          `Cannot open Sqitch triplet — the following file(s) are missing:\n${missing.join("\n")}`,
        );
        return;
      }

      // Step 4: Determine the ordered list of files to open
      const order = getTripletOrder();
      const orderedUris = order.map((type) => vscode.Uri.file(paths[type]));

      // Step 5: Determine which view columns to use
      // Reuse existing editor groups if present, otherwise use One/Two/Three
      const existingGroups = vscode.window.tabGroups.all;
      const columns: vscode.ViewColumn[] = [
        existingGroups[0]?.viewColumn ?? vscode.ViewColumn.One,
        existingGroups[1]?.viewColumn ?? vscode.ViewColumn.Two,
        existingGroups[2]?.viewColumn ?? vscode.ViewColumn.Three,
      ];

      // Step 6: Open files, always focusing the last opened (append focus behavior)
      for (let i = 0; i < orderedUris.length; i++) {
        await openInGroup(orderedUris[i], columns[i]);
      }
    },
  );

  context.subscriptions.push(disposable);
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
