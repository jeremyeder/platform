package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestGeneratePKCE(t *testing.T) {
	pkce, err := GeneratePKCE()
	if err != nil {
		t.Fatalf("GeneratePKCE() error: %v", err)
	}

	if len(pkce.Verifier) != 43 {
		t.Errorf("verifier length = %d, want 43", len(pkce.Verifier))
	}

	// Verify S256 challenge matches verifier
	h := sha256.Sum256([]byte(pkce.Verifier))
	expected := base64.RawURLEncoding.EncodeToString(h[:])
	if pkce.Challenge != expected {
		t.Errorf("challenge mismatch:\n  got  %q\n  want %q", pkce.Challenge, expected)
	}
}

func TestGeneratePKCE_Uniqueness(t *testing.T) {
	p1, _ := GeneratePKCE()
	p2, _ := GeneratePKCE()
	if p1.Verifier == p2.Verifier {
		t.Error("two PKCE verifiers should not be identical")
	}
}

func TestGenerateState(t *testing.T) {
	state, err := GenerateState()
	if err != nil {
		t.Fatalf("GenerateState() error: %v", err)
	}

	if len(state) != 43 {
		t.Errorf("state length = %d, want 43", len(state))
	}
}

func TestGenerateState_Uniqueness(t *testing.T) {
	s1, _ := GenerateState()
	s2, _ := GenerateState()
	if s1 == s2 {
		t.Error("two state values should not be identical")
	}
}

func TestBuildAuthorizeURL(t *testing.T) {
	result := BuildAuthorizeURL(
		"https://auth.example.com/authorize",
		"my-client",
		"http://localhost:12345/callback",
		"test-state",
		"test-challenge",
		"openid email",
	)

	parsed, err := url.Parse(result)
	if err != nil {
		t.Fatalf("failed to parse URL: %v", err)
	}

	if parsed.Scheme != "https" || parsed.Host != "auth.example.com" || parsed.Path != "/authorize" {
		t.Errorf("unexpected base URL: %s", result)
	}

	params := parsed.Query()
	tests := map[string]string{
		"response_type":         "code",
		"client_id":             "my-client",
		"redirect_uri":          "http://localhost:12345/callback",
		"state":                 "test-state",
		"code_challenge":        "test-challenge",
		"code_challenge_method": "S256",
		"scope":                 "openid email",
	}

	for key, want := range tests {
		if got := params.Get(key); got != want {
			t.Errorf("param %q = %q, want %q", key, got, want)
		}
	}
}

func TestDiscoverEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/openid-configuration" {
			http.NotFound(w, r)
			return
		}
		json.NewEncoder(w).Encode(OIDCConfig{
			AuthorizationEndpoint: "https://auth.example.com/authorize",
			TokenEndpoint:         "https://auth.example.com/token",
		})
	}))
	defer server.Close()

	cfg, err := DiscoverEndpoints(server.URL)
	if err != nil {
		t.Fatalf("DiscoverEndpoints() error: %v", err)
	}

	if cfg.AuthorizationEndpoint != "https://auth.example.com/authorize" {
		t.Errorf("authorization_endpoint = %q", cfg.AuthorizationEndpoint)
	}
	if cfg.TokenEndpoint != "https://auth.example.com/token" {
		t.Errorf("token_endpoint = %q", cfg.TokenEndpoint)
	}
}

func TestDiscoverEndpoints_MissingEndpoints(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"issuer": "https://example.com"})
	}))
	defer server.Close()

	_, err := DiscoverEndpoints(server.URL)
	if err == nil {
		t.Fatal("expected error for missing endpoints")
	}
	if !strings.Contains(err.Error(), "missing required endpoints") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestDiscoverEndpoints_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}))
	defer server.Close()

	_, err := DiscoverEndpoints(server.URL)
	if err == nil {
		t.Fatal("expected error for server error")
	}
}

func TestExchangeCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad form", http.StatusBadRequest)
			return
		}

		if r.FormValue("grant_type") != "authorization_code" {
			http.Error(w, "bad grant_type", http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(TokenResponse{
			AccessToken:  "test-access-token",
			RefreshToken: "test-refresh-token",
			TokenType:    "Bearer",
			ExpiresIn:    3600,
		})
	}))
	defer server.Close()

	resp, err := ExchangeCode(server.URL, "client", "code", "http://localhost/callback", "verifier")
	if err != nil {
		t.Fatalf("ExchangeCode() error: %v", err)
	}

	if resp.AccessToken != "test-access-token" {
		t.Errorf("access_token = %q", resp.AccessToken)
	}
	if resp.RefreshToken != "test-refresh-token" {
		t.Errorf("refresh_token = %q", resp.RefreshToken)
	}
}

func TestExchangeCode_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
	}))
	defer server.Close()

	_, err := ExchangeCode(server.URL, "client", "bad-code", "http://localhost/callback", "verifier")
	if err == nil {
		t.Fatal("expected error for bad grant")
	}
}

func TestExchangeCode_MissingAccessToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"token_type": "Bearer"})
	}))
	defer server.Close()

	_, err := ExchangeCode(server.URL, "client", "code", "http://localhost/callback", "verifier")
	if err == nil {
		t.Fatal("expected error for missing access_token")
	}
}
