package oauth

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestCallbackServer_Success(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	state := "test-state-123"
	addr, resultCh, cleanup, err := StartCallbackServer(ctx, state)
	if err != nil {
		t.Fatalf("StartCallbackServer() error: %v", err)
	}
	defer cleanup()

	callbackURL := fmt.Sprintf("http://%s/callback?code=test-code&state=%s", addr, state)
	resp, err := http.Get(callbackURL) //nolint:gosec
	if err != nil {
		t.Fatalf("GET callback error: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("callback status = %d, want 200", resp.StatusCode)
	}

	select {
	case result := <-resultCh:
		if result.Err != nil {
			t.Fatalf("unexpected error: %v", result.Err)
		}
		if result.Code != "test-code" {
			t.Errorf("code = %q, want %q", result.Code, "test-code")
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for result")
	}
}

func TestCallbackServer_StateMismatch(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	addr, resultCh, cleanup, err := StartCallbackServer(ctx, "expected-state")
	if err != nil {
		t.Fatalf("StartCallbackServer() error: %v", err)
	}
	defer cleanup()

	callbackURL := fmt.Sprintf("http://%s/callback?code=test-code&state=wrong-state", addr)
	resp, err := http.Get(callbackURL) //nolint:gosec
	if err != nil {
		t.Fatalf("GET callback error: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("callback status = %d, want 400", resp.StatusCode)
	}

	select {
	case result := <-resultCh:
		if result.Err == nil {
			t.Fatal("expected error for state mismatch")
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for result")
	}
}

func TestCallbackServer_MissingCode(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	state := "test-state"
	addr, resultCh, cleanup, err := StartCallbackServer(ctx, state)
	if err != nil {
		t.Fatalf("StartCallbackServer() error: %v", err)
	}
	defer cleanup()

	callbackURL := fmt.Sprintf("http://%s/callback?state=%s", addr, state)
	resp, err := http.Get(callbackURL) //nolint:gosec
	if err != nil {
		t.Fatalf("GET callback error: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("callback status = %d, want 400", resp.StatusCode)
	}

	select {
	case result := <-resultCh:
		if result.Err == nil {
			t.Fatal("expected error for missing code")
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for result")
	}
}

func TestCallbackServer_AuthorizationError(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	state := "test-state"
	addr, resultCh, cleanup, err := StartCallbackServer(ctx, state)
	if err != nil {
		t.Fatalf("StartCallbackServer() error: %v", err)
	}
	defer cleanup()

	callbackURL := fmt.Sprintf("http://%s/callback?state=%s&error=access_denied&error_description=user+denied", addr, state)
	resp, err := http.Get(callbackURL) //nolint:gosec
	if err != nil {
		t.Fatalf("GET callback error: %v", err)
	}
	resp.Body.Close()

	select {
	case result := <-resultCh:
		if result.Err == nil {
			t.Fatal("expected error for authorization error")
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for result")
	}
}
