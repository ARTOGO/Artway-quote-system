// Package static serves the embedded React build for the Cloud Run single
// service deployment. The production Dockerfile replaces dist/ with
// frontend/dist before compiling the Go binary.
package static

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

//go:embed dist
var distFS embed.FS

// Handler returns an HTTP handler for the embedded Vite build. Unknown
// non-API routes fall back to index.html so the SPA can own routing.
func Handler() http.Handler {
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("static dist unavailable: " + err.Error())
	}
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "." {
			name = "index.html"
		}
		if fileExists(dist, name) {
			fileServer.ServeHTTP(w, r)
			return
		}

		serveIndex(w, r, fileServer)
	})
}

func fileExists(dist fs.FS, name string) bool {
	info, err := fs.Stat(dist, name)
	return err == nil && !info.IsDir()
}

func serveIndex(w http.ResponseWriter, r *http.Request, fileServer http.Handler) {
	if contentType := mime.TypeByExtension(".html"); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	clone := r.Clone(r.Context())
	clone.URL.Path = "/"
	clone.URL.RawPath = ""
	fileServer.ServeHTTP(w, clone)
}
