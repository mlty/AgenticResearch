import { NextRequest, NextResponse } from "next/server";

import { loadWorkspaceSnapshots, saveWorkspaceSnapshot } from "@/lib/workspace-storage";
import type { WorkspaceTask } from "@/types/product";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspaces = await loadWorkspaceSnapshots();
    return NextResponse.json({ workspaces, storageDir: "research-workspaces" });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { workspace?: WorkspaceTask };

    if (!body.workspace) {
      return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    }

    const result = await saveWorkspaceSnapshot(body.workspace);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}