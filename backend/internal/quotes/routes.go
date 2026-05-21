package quotes

import "github.com/go-chi/chi/v5"

// Mount registers the quote-app routes onto the given chi.Router. Caller
// is responsible for placing it under /api and applying auth.Middleware.
//
// Route order matters: /quotes/distinct-sales must be registered before
// the /{id} pattern, otherwise chi treats "distinct-sales" as an id and
// our parseID handler returns 400.
func Mount(r chi.Router, h *Handler) {
	r.Get("/me", h.Me)

	r.Route("/quotes", func(r chi.Router) {
		// Collection routes
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Post("/next-number", h.NextNumber)
		r.Get("/distinct-sales", h.DistinctSales)
		// by-number deep-link (#/quote/AW-...): literal prefix, precedes {id}
		r.Get("/by-number/{quote_no}", h.GetByNumber)

		// Item routes (literal paths above must come first to avoid {id} catch-all)
		r.Route("/{id}", func(r chi.Router) {
			r.Get("/", h.Get)
			r.Put("/", h.Update)
			r.Delete("/", h.SoftDelete)
		})
	})
}
