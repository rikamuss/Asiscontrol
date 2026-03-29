import { Outlet } from "react-router-dom";
import AppSidebar from "./Sidebar";

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="md:ml-64 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
