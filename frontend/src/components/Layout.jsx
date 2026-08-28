import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import {
  KeyRound,
  LogOut,
  Menu,
  RadioTower,
  Send,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const links = [
  {
    to: "/admin/send",
    label: "Send Message",
    icon: Send,
  },
  {
    to: "/admin/webhooks",
    label: "Webhooks",
    icon: RadioTower,
  },
  {
    to: "/admin/change-password",
    label: "Change Password",
    icon: KeyRound,
  },
];

export default function Layout() {
  const [open, setOpen] = useState(false);

  const { admin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${open ? "open" : ""}`}
      >
        <div className="brand-row">
          <div>
            <strong>Webhook Manager</strong>
            <span>Discord Broadcast Admin</span>
          </div>

          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          {links.map(
            ({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `nav-link ${
                    isActive ? "active" : ""
                  }`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ),
          )}
        </nav>

        <div className="sidebar-footer">
          <span className="admin-email">
            {admin?.email}
          </span>

          <button
            className="nav-link logout-btn"
            onClick={logout}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {open && (
        <button
          className="overlay mobile-only"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div>
            <strong>Admin Panel</strong>
            <span>
              Manage webhooks and broadcasts
            </span>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}