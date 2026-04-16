import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/config";
import { buildForwardHeadersAsync } from "@/lib/auth";

/**
 * GET /api/projects/:name/learned/prs
 *
 * Lists open draft PRs with the "continuous-learning" label.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: projectName } = await params;
    const headers = await buildForwardHeadersAsync(request);

    // Get repo info from project
    const projectRes = await fetch(
      `${BACKEND_URL}/projects/${projectName}`,
      { method: "GET", headers }
    );
    if (!projectRes.ok) {
      return NextResponse.json({ prs: [] });
    }
    const project = await projectRes.json();
    const repoAnnotation =
      project?.data?.annotations?.["ambient.ai/repo"] ||
      project?.annotations?.["ambient.ai/repo"] ||
      "";

    if (!repoAnnotation) {
      return NextResponse.json({ prs: [] });
    }

    const ownerRepo = parseOwnerRepo(repoAnnotation);
    if (!ownerRepo) {
      return NextResponse.json({ prs: [] });
    }

    // Fetch open PRs from GitHub API
    const searchUrl = `https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/pulls?state=open&per_page=50`;
    const ghHeaders: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    try {
      const ghRes = await fetch(searchUrl, { headers: ghHeaders });
      if (!ghRes.ok) {
        return NextResponse.json({ prs: [] });
      }

      const allPrs = await ghRes.json();

      type GHLabel = { name: string };
      type GHUser = { login: string };
      type GHPR = {
        draft: boolean;
        number: number;
        title: string;
        html_url: string;
        created_at: string;
        user: GHUser;
        body: string;
        labels: GHLabel[];
      };

      const filteredPrs = (allPrs as GHPR[]).filter(
        (pr: GHPR) =>
          pr.draft === true &&
          pr.labels.some((l: GHLabel) => l.name === "continuous-learning")
      );

      const prs = filteredPrs.map((pr: GHPR) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        createdAt: pr.created_at,
        author: pr.user?.login || "",
        body: pr.body || "",
      }));

      return NextResponse.json({ prs });
    } catch {
      return NextResponse.json({ prs: [] });
    }
  } catch (error) {
    console.error("Failed to fetch learned draft PRs:", error);
    return NextResponse.json({ prs: [] });
  }
}

function parseOwnerRepo(
  repoUrl: string
): { owner: string; repo: string } | null {
  const cleaned = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const httpsMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  const parts = cleaned.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}
