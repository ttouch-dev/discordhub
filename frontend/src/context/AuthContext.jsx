import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] =
    useState(true);

  async function loadMe() {
    const token = localStorage.getItem(
      "webhook_admin_token"
    );

    if (!token) {
      setAdmin(null);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get(
        "/auth/me"
      );

      setAdmin(data.admin);
    } catch {
      localStorage.removeItem(
        "webhook_admin_token"
      );

      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();

    const expire = () =>
      setAdmin(null);

    window.addEventListener(
      "auth-expired",
      expire
    );

    return () =>
      window.removeEventListener(
        "auth-expired",
        expire
      );
  }, []);

  async function login(email, password) {
    const { data } = await api.post(
      "/auth/login",
      {
        email,
        password,
      }
    );

    localStorage.setItem(
      "webhook_admin_token",
      data.token
    );

    setAdmin(data.admin);

    return data;
  }

  function logout() {
    localStorage.removeItem(
      "webhook_admin_token"
    );

    setAdmin(null);
  }

  const value = useMemo(
    () => ({
      admin,
      loading,
      login,
      logout,
      refresh: loadMe,
      setAdmin,
    }),
    [admin, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () =>
  useContext(AuthContext);
