package router

import (
	"net/http"

	"aarogyaruchi/internal/handler"
	"aarogyaruchi/internal/middleware"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func New(h *handler.Handler, auth *middleware.AuthMiddleware, allowedOrigins []string) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.RequestID)

	// Health (unversioned — load balancers and monitors use it)
	r.Get("/health", h.Health)
	r.Get("/health/detailed", h.HealthDetailed)

	// Guest chatbot (public SSE; CORS restricted to the website origins)
	r.Group(func(r chi.Router) {
		r.Use(h.ChatCORS())
		r.Post("/chat/stream", h.ChatStream)
		r.Options("/chat/stream", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})
	})

	// Versioned platform API. CORS is credential-aware and origin-locked.
	r.Route("/v1", func(r chi.Router) {
		r.Use(middleware.CORS(allowedOrigins))

		// Auth (public): role-split OTP entry points prevent a customer
		// login flow from ever minting privileged sessions.
		r.Route("/auth", func(r chi.Router) {
			r.Post("/customer/send-otp", h.SendCustomerOTP)
			r.Post("/customer/verify-otp", h.VerifyCustomerOTP)
			r.Post("/admin/send-otp", h.SendAdminOTP)
			r.Post("/admin/verify-otp", h.VerifyAdminOTP)
			r.Post("/partner/send-otp", h.SendPartnerOTP)
			r.Post("/partner/verify-otp", h.VerifyPartnerOTP)
			r.Post("/partner/refresh", h.RefreshPartnerTokens)
			r.Post("/logout", h.Logout)
			r.Get("/session", h.GetSession)
		})

		// Public catalog
		r.Get("/products", h.ListProducts)
		r.Get("/localities", h.ListLocalities)
		r.Get("/localities/resolve", h.ResolveLocality)

		// Web push (subscription management; role comes from the session)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireUserOrAdmin)
			r.Post("/push/subscribe", h.PushSubscribe)
			r.Post("/push/unsubscribe", h.PushUnsubscribe)
			r.Post("/push/permission", h.PushReportPermission)
		})
		r.Get("/push/public-key", h.PushPublicKey)

		// Support chat (customer side)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireUser)
			r.Get("/chat/me", h.GetMyChat)
			r.Get("/chat/unread", h.GetMyChatUnread)
			r.Post("/chat/me/messages", h.SendMyChatMessage)
		})

		// Customer (cookie session)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireUser)
			r.Get("/customers/me", h.GetCustomer)
			r.Patch("/customers/me", h.UpdateCustomer)
			r.Get("/customers/me/addresses", h.ListAddresses)
			r.Post("/customers/me/addresses", h.CreateAddress)
			r.Patch("/customers/me/addresses/{id}", h.UpdateAddress)
			r.Delete("/customers/me/addresses/{id}", h.DeleteAddress)

			r.Post("/orders/quote", h.QuoteOrder)
			r.Post("/orders", h.CreateOrder)
			r.Get("/orders", h.ListUserOrders)
			r.Get("/orders/{id}", h.GetOrder)
			r.Post("/orders/{id}/cancel", h.CancelOrder)
		})

		// Admin (cookie session; management subset is super_admin)
		r.Route("/admin", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(auth.RequireAdmin)

				r.Get("/dashboard", h.AdminDashboard)
				r.Get("/batches", h.AdminListBatches)
				r.Get("/batches/current", h.CurrentBatch)
				r.Get("/batches/{id}", h.AdminGetBatch)
				r.Post("/batches/{id}/close", h.AdminCloseBatch)
				r.Get("/batches/{id}/preparation-summary", h.AdminGetBatch) // summary included in detail
				r.Post("/batches/{id}/labels", h.AdminBatchLabels)
				r.Get("/batches/{id}/labels", h.AdminBatchLabelData)

				r.Get("/orders", h.AdminListOrders)
				r.Get("/orders/{id}", h.AdminGetOrder)
				r.Get("/orders/{id}/label", h.AdminOrderLabel)
				r.Patch("/orders/{id}/status", h.AdminUpdateOrderStatus)
				r.Post("/orders/bulk-status", h.AdminBulkStatus)

				r.Post("/delivery-runs", h.AdminCreateRun)
				r.Get("/delivery-runs", h.AdminListRuns)
				r.Get("/delivery-runs/active", h.ActiveRunsOverview)
				r.Get("/delivery-runs/{id}", h.AdminGetRun)
				r.Patch("/delivery-runs/{id}", h.AdminUpdateRun)
				r.Post("/delivery-runs/{id}/stops", h.AdminAddStop)
				r.Delete("/delivery-runs/{id}/stops/{stop_id}", h.AdminRemoveStop)
				r.Patch("/delivery-runs/{id}/stops/reorder", h.AdminReorderStops)
				r.Post("/delivery-runs/{id}/dispatch", h.AdminDispatchRun)
				r.Get("/delivery-runs/{id}/tracking", h.AdminRunTracking)

				r.Get("/delivery-runs/{id}/cash-summary", h.AdminCashSummary)
				r.Post("/delivery-runs/{id}/reconciliation/confirm", h.AdminConfirmHandover)
				r.Get("/cash/handovers", h.AdminHandoverHistory)

				// Users + support chat
				r.Get("/users", h.AdminListUsers)
				r.Get("/users/{user_id}", h.AdminGetUser)
				r.Get("/chat/threads", h.AdminListChatThreads)
				r.Get("/chat/threads/{user_id}", h.AdminGetChatThread)
				r.Post("/chat/threads/{user_id}/messages", h.AdminSendChatMessage)
			})

			// Privileged management (super_admin).
			r.Group(func(r chi.Router) {
				r.Use(auth.RequireSuperAdmin)

				r.Get("/products", h.AdminListAllProducts)
				r.Post("/products", h.AdminCreateProduct)
				r.Get("/products/{id}", h.AdminGetProduct)
				r.Put("/products/{id}", h.AdminUpdateProduct)
				r.Delete("/products/{id}", h.AdminArchiveProduct)
				r.Delete("/products/{id}/permanent", h.AdminDeleteProduct)
				r.Post("/uploads/image", h.CreateImageUploadToken)

				r.Get("/localities", h.AdminListAllLocalities)
				r.Post("/localities", h.AdminCreateLocality)
				r.Put("/localities/{id}", h.AdminUpdateLocality)

				r.Get("/delivery-partners", h.AdminListPartners)
				r.Post("/delivery-partners", h.AdminCreatePartner)
				r.Patch("/delivery-partners/{id}", h.AdminUpdatePartner)

				r.Get("/admins", h.AdminListAdmins)
				r.Post("/admins", h.AdminCreateAdmin)
				r.Patch("/admins/{id}", h.AdminUpdateAdmin)

				r.Get("/settings", h.AdminGetSettings)
				r.Patch("/settings", h.AdminUpdateSettings)
			})
		})

		// Delivery partner (Bearer access token)
		r.Route("/partner", func(r chi.Router) {
			r.Use(auth.RequirePartner)

			r.Get("/me", h.GetPartnerMe)
			r.Get("/runs", h.ListPartnerRuns)
			r.Get("/runs/{id}", h.GetPartnerRun)
			r.Post("/runs/{id}/accept", h.AcceptPartnerRun)
			r.Post("/runs/{id}/pickup", h.PickupPartnerRun)
			r.Post("/runs/{id}/complete", h.CompletePartnerRun)
			r.Post("/runs/{id}/cash-handover", h.SubmitCashHandover)
			r.Post("/packages/scan", h.ScanPackage)
			r.Get("/stops/{id}", h.GetPartnerStop)
			r.Post("/stops/{id}/start", h.StartPartnerStop)
			r.Post("/stops/{id}/delivered", h.CompletePartnerStop)
			r.Post("/stops/{id}/failed", h.FailPartnerStop)
			r.Post("/location/batch", h.PartnerLocationBatch)
		})

		// WebSocket (cookie or access_token)
		r.Get("/ws", h.WebSocket)
	})

	return r
}
