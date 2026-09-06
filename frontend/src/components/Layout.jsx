import { useState } from "react";
import {
  NavLink,
  Outlet,
} from "react-router-dom";

import {
  KeyRound,
  LogOut,
  Menu,
  RadioTower,
  Send,
  UserPlus,
  UserRound,
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
    to: "/admin/users",
    label: "Add User",
    icon: UserPlus,
  },
  {
    to: "/admin/profile",
    label: "Profile",
    icon: UserRound,
  },
  {
    to: "/admin/change-password",
    label: "Change Password",
    icon: KeyRound,
  },
];

function initials(name, email) {
  const source =
    name?.trim() ||
    email?.trim() ||
    "A";

  const parts = source.split(/\s+/);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Layout() {
  const [open, setOpen] =
    useState(false);

  const { admin, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${
          open ? "open" : ""
        }`}
      >
        <div className="brand-row">
          <div>
            <strong>
              Webhook Manager
            </strong>

            <span>
              Discord Broadcast Admin
            </span>
          </div>

          <button
            className="icon-btn mobile-only"
            onClick={() =>
              setOpen(false)
            }
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          {links.map(
            ({
              to,
              label,
              icon: Icon,
            }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() =>
                  setOpen(false)
                }
                className={({
                  isActive,
                }) =>
                  `nav-link ${
                    isActive
                      ? "active"
                      : ""
                  }`
                }
              >
                <Icon size={18} />
                <span>
                  {label}
                </span>
              </NavLink>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/admin/profile"
            onClick={() =>
              setOpen(false)
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              marginBottom: "10px",
              padding: "8px",
              borderRadius: "12px",
              color: "inherit",
            }}
          >
            {admin?.profileImage ? (
              <img
                src={
                  admin.profileImage
                }
                alt=""
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  flexShrink: 0,
                  background:
                    "rgba(99,102,241,.14)",
                  color: "#818cf8",
                }}
              >
                {initials(
                  admin?.name,
                  admin?.email
                )}
              </div>
            )}

            <div
              style={{
                minWidth: 0,
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "13px",
                  overflow: "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {admin?.name ||
                  "Admin"}
              </strong>

              <span
                className="admin-email"
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {admin?.email}
              </span>
            </div>
          </NavLink>

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
          onClick={() =>
            setOpen(false)
          }
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-btn mobile-only"
            onClick={() =>
              setOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div>
            <strong>
              Admin Panel
            </strong>

            <span>
              Manage webhooks,
              users and broadcasts
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
