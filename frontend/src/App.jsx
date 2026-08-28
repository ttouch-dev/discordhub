import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import LoginPage from "./pages/LoginPage";
import SendPage from "./pages/SendPage";
import WebhooksPage from "./pages/WebhooksPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Navigate
              to="send"
              replace
            />
          }
        />

        <Route
          path="send"
          element={<SendPage />}
        />

        <Route
          path="webhooks"
          element={<WebhooksPage />}
        />

        <Route
          path="change-password"
          element={<ChangePasswordPage />}
        />
      </Route>

      <Route
        path="*"
        element={
          <Navigate
            to="/admin"
            replace
          />
        }
      />
    </Routes>
  );
}