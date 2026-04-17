package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
)

// LearnedEntry represents a parsed learned file entry from docs/learned/
type LearnedEntry struct {
	Type     string `json:"type"`
	Date     string `json:"date"`
	Title    string `json:"title"`
	Session  string `json:"session,omitempty"`
	Project  string `json:"project,omitempty"`
	Author   string `json:"author,omitempty"`
	Content  string `json:"content"`
	FilePath string `json:"filePath"`
}

// parseFrontmatter extracts YAML-like frontmatter key-value pairs from a
// markdown string delimited by "---".  Returns the frontmatter map and the
// body text after the closing delimiter.  Returns nil if no valid
// frontmatter is present.
func parseFrontmatter(content string) (map[string]string, string) {
	if !strings.HasPrefix(content, "---") {
		return nil, content
	}

	parts := strings.SplitN(content, "---", 3)
	if len(parts) < 3 {
		return nil, content
	}

	fm := make(map[string]string)
	for _, line := range strings.Split(strings.TrimSpace(parts[1]), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		idx := strings.Index(line, ":")
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		// Strip surrounding quotes
		val = strings.Trim(val, "\"'")
		if key != "" {
			fm[key] = val
		}
	}

	body := strings.TrimSpace(parts[2])
	return fm, body
}

// ListLearnedEntries handles GET /api/projects/:projectName/learned
//
// Reads docs/learned/ from the workspace repo via GitHub API and returns
// parsed entries with frontmatter metadata and content.
//
// Query parameters:
//   - repo: repository URL (required)
//   - ref: git ref/branch (required)
//   - type: filter by entry type (optional, e.g. "correction")
//
// Uses GetK8sClientsForRequest for user-scoped RBAC.
func ListLearnedEntries(c *gin.Context) {
	project := c.Param("projectName")
	repo := c.Query("repo")
	ref := c.Query("ref")
	typeFilter := c.Query("type")

	if repo == "" || ref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "repo and ref query parameters required"})
		return
	}

	userID, _ := c.Get("userID")
	reqK8s, reqDyn := GetK8sClientsForRequest(c)

	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing user context"})
		return
	}

	// Detect provider — only GitHub is supported for learned files
	provider := types.DetectProvider(repo)
	if provider != types.ProviderGitHub {
		c.JSON(http.StatusBadRequest, gin.H{"error": "learned files endpoint only supports GitHub repositories"})
		return
	}

	token, err := GetGitHubTokenRepo(c.Request.Context(), reqK8s, reqDyn, project, userID.(string))
	if err != nil {
		log.Printf("Failed to get GitHub token for learned endpoint, project %s: %v", project, err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		return
	}

	owner, repoName, err := parseOwnerRepo(repo)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entries, err := fetchLearnedFiles(c, owner, repoName, ref, token)
	if err != nil {
		// If docs/learned/ doesn't exist, return empty array (not 404)
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
			c.JSON(http.StatusOK, gin.H{"entries": []LearnedEntry{}})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to fetch learned files: %v", err)})
		return
	}

	// Apply type filter
	if typeFilter != "" {
		filtered := make([]LearnedEntry, 0, len(entries))
		for _, e := range entries {
			if e.Type == typeFilter {
				filtered = append(filtered, e)
			}
		}
		entries = filtered
	}

	c.JSON(http.StatusOK, gin.H{"entries": entries})
}

// fetchLearnedFiles retrieves and parses learned markdown files from the
// GitHub Contents API.  It reads the top-level docs/learned/ directory and
// the corrections/ and patterns/ subdirectories.
func fetchLearnedFiles(c *gin.Context, owner, repo, ref, token string) ([]LearnedEntry, error) {
	api := githubAPIBaseURL("github.com")

	// Collect .md file paths from docs/learned/ and its subdirectories
	var mdPaths []string

	for _, dirPath := range []string{"docs/learned", "docs/learned/corrections", "docs/learned/patterns"} {
		url := fmt.Sprintf("%s/repos/%s/%s/contents/%s?ref=%s", api, owner, repo, dirPath, ref)
		resp, err := doGitHubRequest(c.Request.Context(), http.MethodGet, url, "Bearer "+token, "", nil)
		if err != nil {
			if dirPath == "docs/learned" {
				return nil, fmt.Errorf("GitHub API request failed: %w", err)
			}
			continue
		}

		if resp.StatusCode == http.StatusNotFound {
			resp.Body.Close()
			if dirPath == "docs/learned" {
				return nil, fmt.Errorf("404 Not Found")
			}
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			if dirPath == "docs/learned" {
				b, _ := io.ReadAll(resp.Body)
				resp.Body.Close()
				return nil, fmt.Errorf("GitHub API error %d: %s", resp.StatusCode, string(b))
			}
			resp.Body.Close()
			continue
		}

		var decoded interface{}
		if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()
		mdPaths = append(mdPaths, collectMDPaths(decoded)...)
	}

	// Deduplicate paths
	seen := make(map[string]bool)
	uniquePaths := make([]string, 0, len(mdPaths))
	for _, p := range mdPaths {
		if !seen[p] {
			seen[p] = true
			uniquePaths = append(uniquePaths, p)
		}
	}

	// Fetch and parse each file
	var entries []LearnedEntry
	for _, filePath := range uniquePaths {
		fileURL := fmt.Sprintf("%s/repos/%s/%s/contents/%s?ref=%s", api, owner, repo, filePath, ref)
		fileResp, fileErr := doGitHubRequest(c.Request.Context(), http.MethodGet, fileURL, "Bearer "+token, "", nil)
		if fileErr != nil {
			log.Printf("Failed to fetch learned file %s: %v", filePath, fileErr)
			continue
		}

		if fileResp.StatusCode != http.StatusOK {
			fileResp.Body.Close()
			continue
		}

		var fileObj map[string]interface{}
		if json.NewDecoder(fileResp.Body).Decode(&fileObj) != nil {
			fileResp.Body.Close()
			continue
		}
		fileResp.Body.Close()

		rawContent, _ := fileObj["content"].(string)
		encoding, _ := fileObj["encoding"].(string)

		var textContent string
		if strings.ToLower(encoding) == "base64" {
			raw := strings.ReplaceAll(rawContent, "\n", "")
			data, decErr := base64.StdEncoding.DecodeString(raw)
			if decErr != nil {
				continue
			}
			textContent = string(data)
		} else {
			textContent = rawContent
		}

		fm, body := parseFrontmatter(textContent)
		if fm == nil {
			continue
		}

		entryType := fm["type"]
		title := fm["title"]
		date := fm["date"]
		if entryType == "" || title == "" || date == "" {
			continue
		}

		entries = append(entries, LearnedEntry{
			Type:     entryType,
			Date:     date,
			Title:    title,
			Session:  fm["session"],
			Project:  fm["project"],
			Author:   fm["author"],
			Content:  body,
			FilePath: filePath,
		})
	}

	return entries, nil
}

// CreateLearnedPR handles POST /api/projects/:projectName/learned/create
//
// Creates a learned file on a new branch and opens a draft PR.
// Body: {"owner":"...","repo":"...","title":"...","content":"...","type":"correction|pattern"}
func CreateLearnedPR(c *gin.Context) {
	project := c.Param("projectName")

	var req struct {
		Owner   string `json:"owner" binding:"required"`
		Repo    string `json:"repo" binding:"required"`
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
		Type    string `json:"type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Type != "correction" && req.Type != "pattern" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be 'correction' or 'pattern'"})
		return
	}

	userID, _ := c.Get("userID")
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		return
	}
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing user context"})
		return
	}

	repoURL := fmt.Sprintf("https://github.com/%s/%s", req.Owner, req.Repo)
	token, err := GetGitHubTokenRepo(c.Request.Context(), reqK8s, reqDyn, project, userID.(string))
	if err != nil {
		log.Printf("Failed to get GitHub token for learned PR, project %s: %v", project, err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "GitHub authentication required. Connect GitHub via the Integrations page (GitHub App or PAT)."})
		return
	}
	_ = repoURL

	api := "https://api.github.com"
	auth := "Bearer " + token

	// 1. Get default branch SHA
	refResp, err := doGitHubRequest(c.Request.Context(), "GET",
		fmt.Sprintf("%s/repos/%s/%s/git/ref/heads/main", api, req.Owner, req.Repo),
		auth, "", nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to get default branch: %v", err)})
		return
	}
	defer refResp.Body.Close()
	if refResp.StatusCode != 200 {
		body, _ := io.ReadAll(refResp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to get default branch (%d): %s", refResp.StatusCode, string(body))})
		return
	}
	var refData struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	json.NewDecoder(refResp.Body).Decode(&refData)
	baseSHA := refData.Object.SHA

	// 2. Create branch
	date := time.Now().Format("2006-01-02")
	slug := slugRegex.ReplaceAllString(strings.ToLower(req.Title), "-")
	slug = strings.Trim(slug, "-")
	if len(slug) > 60 {
		slug = slug[:60]
	}
	if slug == "" {
		slug = "memory"
	}
	branchName := fmt.Sprintf("learned/%s-%s-%s", req.Type, date, slug)

	branchBody, _ := json.Marshal(map[string]interface{}{
		"ref": "refs/heads/" + branchName,
		"sha": baseSHA,
	})
	branchResp, err := doGitHubRequest(c.Request.Context(), "POST",
		fmt.Sprintf("%s/repos/%s/%s/git/refs", api, req.Owner, req.Repo),
		auth, "", bytes.NewReader(branchBody))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create branch: %v", err)})
		return
	}
	defer branchResp.Body.Close()
	if branchResp.StatusCode != 201 {
		body, _ := io.ReadAll(branchResp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create branch (%d): %s", branchResp.StatusCode, string(body))})
		return
	}

	// 3. Create file on branch
	filePath := fmt.Sprintf("docs/learned/%ss/%s-%s.md", req.Type, date, slug)
	now := time.Now().UTC().Format(time.RFC3339)
	author := userID.(string)
	fileContent := fmt.Sprintf("---\ntype: %s\ndate: %s\nauthor: %s\ntitle: \"%s\"\n---\n\n%s\n",
		req.Type, now, author, req.Title, req.Content)

	fileBody, _ := json.Marshal(map[string]interface{}{
		"message": fmt.Sprintf("learned: %s", req.Title),
		"content": base64.StdEncoding.EncodeToString([]byte(fileContent)),
		"branch":  branchName,
	})
	fileResp, err := doGitHubRequest(c.Request.Context(), "PUT",
		fmt.Sprintf("%s/repos/%s/%s/contents/%s", api, req.Owner, req.Repo, filePath),
		auth, "", bytes.NewReader(fileBody))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create file: %v", err)})
		return
	}
	defer fileResp.Body.Close()
	if fileResp.StatusCode != 201 {
		body, _ := io.ReadAll(fileResp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create file (%d): %s", fileResp.StatusCode, string(body))})
		return
	}

	// 4. Create draft PR
	prBody, _ := json.Marshal(map[string]interface{}{
		"title": fmt.Sprintf("learned: %s", req.Title),
		"body":  fmt.Sprintf("## New Memory\n\n**Type:** %s\n**Source:** Manual entry\n\n---\n\n%s", req.Type, req.Content),
		"head":  branchName,
		"base":  "main",
		"draft": true,
	})
	prResp, err := doGitHubRequest(c.Request.Context(), "POST",
		fmt.Sprintf("%s/repos/%s/%s/pulls", api, req.Owner, req.Repo),
		auth, "", bytes.NewReader(prBody))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create PR: %v", err)})
		return
	}
	defer prResp.Body.Close()
	prRespBody, _ := io.ReadAll(prResp.Body)
	if prResp.StatusCode != 201 {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("failed to create PR (%d): %s", prResp.StatusCode, string(prRespBody))})
		return
	}

	var prResult struct {
		HTMLURL string `json:"html_url"`
		Number  int    `json:"number"`
	}
	json.Unmarshal(prRespBody, &prResult)

	// 5. Add continuous-learning label (best-effort)
	labelBody, _ := json.Marshal(map[string]interface{}{
		"labels": []string{"continuous-learning"},
	})
	labelResp, _ := doGitHubRequest(c.Request.Context(), "POST",
		fmt.Sprintf("%s/repos/%s/%s/issues/%d/labels", api, req.Owner, req.Repo, prResult.Number),
		auth, "", bytes.NewReader(labelBody))
	if labelResp != nil {
		labelResp.Body.Close()
	}

	c.JSON(http.StatusCreated, gin.H{
		"prUrl":    prResult.HTMLURL,
		"prNumber": prResult.Number,
	})
}

// collectMDPaths extracts .md file paths from a GitHub API directory listing.
func collectMDPaths(decoded interface{}) []string {
	var paths []string

	switch v := decoded.(type) {
	case []interface{}:
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				name, _ := m["name"].(string)
				path, _ := m["path"].(string)
				typ, _ := m["type"].(string)
				if strings.ToLower(typ) == "file" && strings.HasSuffix(strings.ToLower(name), ".md") {
					paths = append(paths, path)
				}
			}
		}
	case map[string]interface{}:
		name, _ := v["name"].(string)
		path, _ := v["path"].(string)
		typ, _ := v["type"].(string)
		if strings.ToLower(typ) == "file" && strings.HasSuffix(strings.ToLower(name), ".md") {
			paths = append(paths, path)
		}
	}

	return paths
}
