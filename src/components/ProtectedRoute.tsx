import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  return children;
}
