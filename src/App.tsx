import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { OfflineBanner } from "@/components/OfflineBanner";

// Lazy-loaded routes for code splitting
const Portal = lazy(() => import("./pages/Portal"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ClientSpace = lazy(() => import("./pages/ClientSpace"));
const AvocatSpace = lazy(() => import("./pages/AvocatSpace"));
const AdminSpace = lazy(() => import("./pages/AdminSpace"));
const AdminChoice = lazy(() => import("./pages/AdminChoice"));
const SuperAdminSpace = lazy(() => import("./pages/SuperAdminSpace"));
const AdminJuridiqueSpace = lazy(() => import("./pages/AdminJuridiqueSpace"));
const Setup2FA = lazy(() => import("./pages/Setup2FA"));
const ActivateAdmin = lazy(() => import("./pages/ActivateAdmin"));
const ActivateAvocat = lazy(() => import("./pages/ActivateAvocat"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CGU = lazy(() => import("./pages/CGU"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="font-syne font-extrabold text-xl tracking-tight">
          IZY<em className="not-italic bg-gold-2 text-background px-1.5 py-0.5 rounded-[3px] text-sm">VISA</em>
        </div>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OfflineBanner />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Portal />} />
              <Route path="/cgu" element={<CGU />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/setup-2fa" element={<Setup2FA />} />
              <Route path="/activate-admin" element={<ActivateAdmin />} />
              <Route path="/activate-avocat" element={<ActivateAvocat />} />
              <Route
                path="/client/*"
                element={
                  <ProtectedRoute allowedRoles={["client"]}>
                    <ClientSpace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/avocat/*"
                element={
                  <ProtectedRoute allowedRoles={["avocat"]}>
                    <AvocatSpace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "admin_delegue"]} requireMfa>
                    <AdminSpace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin-choice"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]} requireMfa>
                    <AdminChoice />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/super-admin/*"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]} requireMfa>
                    <SuperAdminSpace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin-juridique/*"
                element={
                  <ProtectedRoute allowedRoles={["admin_juridique"]} requireMfa>
                    <AdminJuridiqueSpace />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
