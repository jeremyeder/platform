package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// correctionRequest represents the incoming correction payload from the frontend.
type correctionRequest struct {
	CorrectionType string `json:"correction_type" binding:"required"`
	UserCorrection string `json:"user_correction" binding:"required"`
	SessionName    string `json:"session_name" binding:"required"`
	MessageID      string `json:"message_id" binding:"required"`
	MessageContent string `json:"message_content,omitempty"`
	Source         string `json:"source" binding:"required"`
}

// validCorrectionTypes is the set of allowed correction_type values,
// matching the runner's CORRECTION_TYPES constant.
var validCorrectionTypes = map[string]bool{
	"incomplete":   true,
	"incorrect":    true,
	"out_of_scope": true,
	"style":        true,
}

// validCorrectionSources is the set of allowed source values.
var validCorrectionSources = map[string]bool{
	"user":   true,
	"human":  true,
	"rubric": true,
}

const maxCorrectionTextLength = 2000

// HandleCorrection handles POST /api/projects/:projectName/corrections
// It validates the correction, checks if the target session is running,
// and either forwards to the runner (active sessions) or returns success
// (completed sessions -- Langfuse persistence happens in the runner or
// will be handled by the offline pipeline).
func HandleCorrection(c *gin.Context) {
	projectName := c.Param("projectName")

	var req correctionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid correction payload: %v", err)})
		return
	}

	// Validate correction_type
	if !validCorrectionTypes[req.CorrectionType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid correction_type: %s", req.CorrectionType)})
		return
	}

	// Validate source
	if !validCorrectionSources[req.Source] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid source: %s", req.Source)})
		return
	}

	// Validate user_correction length
	charCount := utf8.RuneCountInString(req.UserCorrection)
	if charCount < 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_correction must be at least 10 characters"})
		return
	}
	if charCount > maxCorrectionTextLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("user_correction must be at most %d characters", maxCorrectionTextLength)})
		return
	}

	// Check session status to decide whether to forward to runner
	sessionRunning := isSessionRunning(projectName, req.SessionName)

	if !sessionRunning {
		// Session is not running -- accept the correction silently.
		// Langfuse persistence will be handled by the offline pipeline.
		c.JSON(http.StatusOK, gin.H{
			"message": "Correction accepted",
			"status":  "accepted",
		})
		return
	}

	// Session is running -- forward as META event to runner
	metaPayload := map[string]interface{}{
		"correction_type": req.CorrectionType,
		"user_correction": req.UserCorrection,
		"message_id":      req.MessageID,
		"source":          req.Source,
	}

	if req.MessageContent != "" {
		metaPayload["message_content"] = req.MessageContent
	}

	metaEvent := map[string]interface{}{
		"type":     "META",
		"metaType": "user_correction",
		"payload":  metaPayload,
		"threadId": req.SessionName,
		"ts":       time.Now().UnixMilli(),
	}

	// Resolve runner endpoint
	runnerURL := correctionRunnerEndpoint(projectName, req.SessionName)
	feedbackURL := runnerURL + "feedback"

	bodyBytes, _ := json.Marshal(metaEvent)
	httpReq, err := http.NewRequest("POST", feedbackURL, bytes.NewReader(bodyBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(httpReq)
	if err != nil {
		// Runner unavailable -- correction is not lost (user can retry)
		log.Printf("Correction: runner unavailable for session %s: %v", SanitizeForLog(req.SessionName), err)
		c.JSON(http.StatusOK, gin.H{
			"message": "Correction saved. Could not forward to active session.",
			"status":  "accepted_no_forward",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		log.Printf("Correction: runner returned %d for session %s: %s", resp.StatusCode, SanitizeForLog(req.SessionName), string(body))
		c.JSON(http.StatusOK, gin.H{
			"message": "Correction saved. Could not forward to active session.",
			"status":  "accepted_no_forward",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Correction submitted and forwarded to session",
		"status":  "forwarded",
	})
}

// isSessionRunning checks if the given session is in Running state by reading the CR status.
func isSessionRunning(projectName, sessionName string) bool {
	if DynamicClient == nil {
		return false
	}

	gvr := GetAgenticSessionV1Alpha1Resource()
	obj, err := DynamicClient.Resource(gvr).Namespace(projectName).Get(
		context.Background(), sessionName, v1.GetOptions{},
	)
	if err != nil {
		return false
	}

	return getSessionPhase(obj) == "Running"
}

// getSessionPhase extracts the phase from a session CR's status.
func getSessionPhase(obj *unstructured.Unstructured) string {
	status, found, _ := unstructured.NestedMap(obj.Object, "status")
	if !found {
		return ""
	}
	phase, _ := status["phase"].(string)
	return phase
}

// correctionRunnerEndpoint resolves the runner HTTP endpoint for a session.
// This mirrors the websocket package's getRunnerEndpoint but lives in handlers
// to avoid circular imports.
func correctionRunnerEndpoint(projectName, sessionName string) string {
	return fmt.Sprintf("http://session-%s.%s.svc.cluster.local:%d/", sessionName, projectName, DefaultRunnerPort)
}
