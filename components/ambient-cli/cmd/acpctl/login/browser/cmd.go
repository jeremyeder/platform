// Package browser implements browser-based OAuth2 login using Authorization Code + PKCE.
package browser

import (
	"bufio"
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/ambient-code/platform/components/ambient-cli/pkg/config"
	"github.com/ambient-code/platform/components/ambient-cli/pkg/oauth"
	"github.com/spf13/cobra"
)

var args struct {
	issuerURL string
	clientID  string
	scopes    string
}

var Cmd = &cobra.Command{
	Use:   "browser",
	Short: "Log in via browser-based OAuth2 flow",
	Long: `Open a browser to authenticate with the identity provider using OAuth2
Authorization Code + PKCE. The CLI starts a local callback server to receive the
authorization code, then exchanges it for access and refresh tokens.`,
	Args: cobra.NoArgs,
	RunE: run,
}

func init() {
	flags := Cmd.Flags()
	flags.StringVar(&args.issuerURL, "issuer-url", "", "OIDC issuer URL (e.g. https://keycloak.example.com/realms/myrealm)")
	flags.StringVar(&args.clientID, "client-id", "", "OAuth2 client ID")
	flags.StringVar(&args.scopes, "scopes", "openid email profile", "OAuth2 scopes to request")
}

func run(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	issuerURL := args.issuerURL
	if issuerURL == "" {
		issuerURL = cfg.GetIssuerURL()
	}
	if issuerURL == "" {
		return fmt.Errorf("--issuer-url is required (or set AMBIENT_ISSUER_URL / issuer_url in config)")
	}

	clientID := args.clientID
	if clientID == "" {
		clientID = cfg.GetClientID()
	}
	if clientID == "" {
		return fmt.Errorf("--client-id is required (or set AMBIENT_CLIENT_ID / client_id in config)")
	}

	fmt.Fprintf(cmd.OutOrStdout(), "Authenticating with %s...\n", issuerURL)

	oidcCfg, err := oauth.DiscoverEndpoints(issuerURL)
	if err != nil {
		return fmt.Errorf("OIDC discovery: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	state, err := oauth.GenerateState()
	if err != nil {
		return err
	}

	pkce, err := oauth.GeneratePKCE()
	if err != nil {
		return err
	}

	addr, resultCh, cleanup, err := oauth.StartCallbackServer(ctx, state)
	if err != nil {
		return err
	}
	defer cleanup()

	redirectURI := "http://" + addr + "/callback"
	authorizeURL := oauth.BuildAuthorizeURL(
		oidcCfg.AuthorizationEndpoint,
		clientID,
		redirectURI,
		state,
		pkce.Challenge,
		args.scopes,
	)

	if err := oauth.OpenBrowser(authorizeURL); err != nil {
		fmt.Fprintf(cmd.ErrOrStderr(), "Could not open browser: %v\n", err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), "If the browser did not open, visit this URL:")
	fmt.Fprintln(cmd.OutOrStdout(), authorizeURL)
	fmt.Fprintln(cmd.OutOrStdout())
	fmt.Fprintln(cmd.OutOrStdout(), "Or paste the redirect URL here:")

	// Listen for both callback and manual URL paste.
	// Use a pipe so we can close the reader to unblock the goroutine.
	pr, pw, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("create pipe: %w", err)
	}
	defer pr.Close()

	// Copy stdin to pipe in background so we can close pr to stop the scanner.
	go func() {
		defer pw.Close()
		buf := make([]byte, 4096)
		for {
			n, err := os.Stdin.Read(buf)
			if n > 0 {
				pw.Write(buf[:n]) //nolint:errcheck
			}
			if err != nil {
				return
			}
		}
	}()

	manualCh := make(chan oauth.CallbackResult, 1)
	go func() {
		scanner := bufio.NewScanner(pr)
		if scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				return
			}
			parsed, err := url.Parse(line)
			if err != nil {
				manualCh <- oauth.CallbackResult{Err: fmt.Errorf("invalid URL: %w", err)}
				return
			}
			code := parsed.Query().Get("code")
			pastedState := parsed.Query().Get("state")
			if code == "" {
				manualCh <- oauth.CallbackResult{Err: fmt.Errorf("URL missing 'code' parameter")}
				return
			}
			if pastedState != "" && pastedState != state {
				manualCh <- oauth.CallbackResult{Err: fmt.Errorf("state mismatch in pasted URL")}
				return
			}
			manualCh <- oauth.CallbackResult{Code: code}
		}
	}()

	var result oauth.CallbackResult
	select {
	case result = <-resultCh:
	case result = <-manualCh:
	case <-ctx.Done():
		return fmt.Errorf("login timed out after 5 minutes")
	}

	if result.Err != nil {
		return fmt.Errorf("authorization failed: %w", result.Err)
	}

	fmt.Fprintln(cmd.OutOrStdout(), "Authorization code received, exchanging for tokens...")

	tokenResp, err := oauth.ExchangeCode(
		oidcCfg.TokenEndpoint,
		clientID,
		result.Code,
		redirectURI,
		pkce.Verifier,
	)
	if err != nil {
		return fmt.Errorf("token exchange: %w", err)
	}

	cfg.AccessToken = tokenResp.AccessToken
	cfg.RefreshToken = tokenResp.RefreshToken
	cfg.IssuerURL = issuerURL
	cfg.ClientID = clientID

	if err := config.Save(cfg); err != nil {
		return fmt.Errorf("save config: %w", err)
	}

	location, err := config.Location()
	if err != nil {
		fmt.Fprintln(cmd.OutOrStdout(), "Login successful. Configuration saved.")
	} else {
		fmt.Fprintf(cmd.OutOrStdout(), "Login successful. Configuration saved to %s\n", location)
	}

	if exp, err := config.TokenExpiry(tokenResp.AccessToken); err == nil && !exp.IsZero() {
		if time.Until(exp) < 24*time.Hour {
			fmt.Fprintf(cmd.ErrOrStderr(), "Note: token expires at %s\n", exp.Format(time.RFC3339))
		}
	}

	return nil
}
