package oauth

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

// CallbackResult holds the authorization code received from the callback.
type CallbackResult struct {
	Code string
	Err  error
}

// StartCallbackServer starts a local HTTP server on a random port to receive
// the OAuth callback. It returns the server's address and a channel that will
// receive the authorization code.
func StartCallbackServer(ctx context.Context, expectedState string) (addr string, resultCh <-chan CallbackResult, cleanup func(), err error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, nil, fmt.Errorf("listen on localhost: %w", err)
	}

	ch := make(chan CallbackResult, 1)
	mux := http.NewServeMux()
	server := &http.Server{Handler: mux}

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		if state != expectedState {
			http.Error(w, "Invalid state parameter", http.StatusBadRequest)
			ch <- CallbackResult{Err: fmt.Errorf("state mismatch: expected %q, got %q", expectedState, state)}
			return
		}

		errParam := r.URL.Query().Get("error")
		if errParam != "" {
			desc := r.URL.Query().Get("error_description")
			http.Error(w, "Authorization failed: "+errParam, http.StatusBadRequest)
			ch <- CallbackResult{Err: fmt.Errorf("authorization error: %s: %s", errParam, desc)}
			return
		}

		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "Missing authorization code", http.StatusBadRequest)
			ch <- CallbackResult{Err: fmt.Errorf("callback missing authorization code")}
			return
		}

		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, successHTML)
		ch <- CallbackResult{Code: code}
	})

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			ch <- CallbackResult{Err: fmt.Errorf("callback server: %w", err)}
		}
	}()

	cleanupFn := func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		server.Shutdown(shutdownCtx) //nolint:errcheck
	}

	return listener.Addr().String(), ch, cleanupFn, nil
}

const successHTML = `<!DOCTYPE html>
<html><head><title>Login Successful</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
       display: flex; justify-content: center; align-items: center; height: 100vh;
       margin: 0; background: #1a1a2e; color: #e0e0e0; }
.container { text-align: center; padding: 2rem; }
h1 { color: #4ecca3; }
p { color: #a0a0a0; }
</style></head>
<body><div class="container">
<h1>Login Successful</h1>
<p>You can close this window and return to the terminal.</p>
</div></body></html>`
