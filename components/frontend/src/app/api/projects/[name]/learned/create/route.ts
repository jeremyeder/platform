import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/config";
import { buildForwardHeadersAsync } from "@/lib/auth";
import { parseOwnerRepo } from "@/lib/github-utils";

/**
 * POST /api/projects/:name/learned/create
 *
 * Creates a new memory by opening a draft PR in the target repo.
 * Proxies to backend POST /projects/:name/learned/create.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: projectName } = await params;
    const headers = await buildForwardHeadersAsync(request);
    const body = await request.json();

    const { title, content, type, repo } = body as {
      title: string;
      content: string;
      type: "correction" | "pattern";
      repo?: string;
    };

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: "title, content, and type are required" },
        { status: 400 }
      );
    }

    if (!["correction", "pattern"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'correction' or 'pattern'" },
        { status: 400 }
      );
    }

    // Resolve repo: use explicit repo from request, fall back to project annotation
    let repoStr = repo || "";
    if (!repoStr) {
      const projectRes = await fetch(
        `${BACKEND_URL}/projects/${projectName}`,
        { method: "GET", headers }
      );
      if (projectRes.ok) {
        const project = await projectRes.json();
        repoStr =
          project?.data?.annotations?.["ambient.ai/repo"] ||
          project?.annotations?.["ambient.ai/repo"] ||
          "";
      }
    }

    if (!repoStr) {
      return NextResponse.json(
        { error: "No repository specified. Enter a target repository (owner/repo)." },
        { status: 400 }
      );
    }

    const ownerRepo = parseOwnerRepo(repoStr);
    if (!ownerRepo) {
      return NextResponse.json(
        { error: "Invalid repository format. Use owner/repo (e.g. jeremyeder/continuous-learning-example)" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${BACKEND_URL}/projects/${projectName}/learned/create`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          title,
          content,
          type,
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: errBody },
        { status: res.status }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create memory:", error);
    return NextResponse.json(
      { error: "Failed to create memory" },
      { status: 500 }
    );
  }
}
