import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileBarChart, Menu, X, Radio, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/empleados", icon: Users, label: "Empleados" },
  { to: "/reportes", icon: FileBarChart, label: "Reportes" },
];

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border md:hidden"
      >
        {collapsed ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-card border-r border-border transition-all duration-300 ${
          collapsed ? "w-64 translate-x-0" : "-translate-x-full md:translate-x-0 md:w-64"
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-6 border-b border-border">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <Radio className="text-primary-foreground" size={20} />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-lg">AsistControl</h1>
            <p className="text-xs text-muted-foreground">ESP32 + Cloud</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setCollapsed(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                location.pathname === item.to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-2 px-4">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
            <span className="text-xs text-muted-foreground">ESP32 Conectado</span>
          </div>
          {user && (
            <div className="px-4 space-y-2">
              <p className="text-xs text-muted-foreground truncate" title={user.email ?? ""}>{user.email}</p>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
