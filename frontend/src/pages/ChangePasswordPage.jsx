import { useState } from "react";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

import api, { getErrorMessage } from "../services/api";

export default function ChangePasswordPage() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [showPassword, setShowPassword] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  function togglePassword(field) {
    setShowPassword((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  }

  function validate() {
    const e = {};

    if (!form.currentPassword) {
      e.currentPassword = "Current password is required";
    }

    if (form.newPassword.length < 8) {
      e.newPassword = "Use at least 8 characters";
    } else if (
      !/[A-Z]/.test(form.newPassword) ||
      !/[a-z]/.test(form.newPassword) ||
      !/[0-9]/.test(form.newPassword)
    ) {
      e.newPassword =
        "Include uppercase, lowercase and a number";
    }

    if (form.confirmPassword !== form.newPassword) {
      e.confirmPassword = "Passwords do not match";
    }

    setErrors(e);

    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();

    if (!validate()) return;

    setSaving(true);

    try {
      await api.post("/auth/change-password", {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      toast.success("Password changed");

      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowPassword({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });

      setErrors({});
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const passwordWrapperStyle = {
    position: "relative",
    width: "100%",
  };

  const passwordInputStyle = {
    paddingRight: "48px",
  };

  const eyeButtonStyle = {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    padding: "5px",
    margin: 0,
    minWidth: "auto",
    minHeight: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    cursor: "pointer",
  };

  return (
    <section
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "620px",
        }}
      >
        <div className="page-heading">
          <div>
            <h1>Change Password</h1>
            <p>Keep your admin account secure.</p>
          </div>
        </div>

        <form
          className="panel"
          onSubmit={submit}
          noValidate
          style={{
            width: "100%",
          }}
        >
          <label>Current Password</label>

          <div style={passwordWrapperStyle}>
            <input
              type={
                showPassword.currentPassword
                  ? "text"
                  : "password"
              }
              value={form.currentPassword}
              onChange={(e) =>
                setForm({
                  ...form,
                  currentPassword: e.target.value,
                })
              }
              style={passwordInputStyle}
              autoComplete="current-password"
            />

            <button
              type="button"
              onClick={() =>
                togglePassword("currentPassword")
              }
              style={eyeButtonStyle}
              aria-label={
                showPassword.currentPassword
                  ? "Hide current password"
                  : "Show current password"
              }
            >
              {showPassword.currentPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {errors.currentPassword && (
            <div className="field-error">
              {errors.currentPassword}
            </div>
          )}

          <label>New Password</label>

          <div style={passwordWrapperStyle}>
            <input
              type={
                showPassword.newPassword
                  ? "text"
                  : "password"
              }
              value={form.newPassword}
              onChange={(e) =>
                setForm({
                  ...form,
                  newPassword: e.target.value,
                })
              }
              style={passwordInputStyle}
              autoComplete="new-password"
            />

            <button
              type="button"
              onClick={() =>
                togglePassword("newPassword")
              }
              style={eyeButtonStyle}
              aria-label={
                showPassword.newPassword
                  ? "Hide new password"
                  : "Show new password"
              }
            >
              {showPassword.newPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {errors.newPassword && (
            <div className="field-error">
              {errors.newPassword}
            </div>
          )}

          <label>Confirm New Password</label>

          <div style={passwordWrapperStyle}>
            <input
              type={
                showPassword.confirmPassword
                  ? "text"
                  : "password"
              }
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({
                  ...form,
                  confirmPassword: e.target.value,
                })
              }
              style={passwordInputStyle}
              autoComplete="new-password"
            />

            <button
              type="button"
              onClick={() =>
                togglePassword("confirmPassword")
              }
              style={eyeButtonStyle}
              aria-label={
                showPassword.confirmPassword
                  ? "Hide confirm password"
                  : "Show confirm password"
              }
            >
              {showPassword.confirmPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>

          {errors.confirmPassword && (
            <div className="field-error">
              {errors.confirmPassword}
            </div>
          )}

          <button
            type="submit"
            className="primary-btn"
            disabled={saving}
            style={{
              marginTop: "18px",
            }}
          >
            {saving ? "Saving…" : "Change Password"}
          </button>
        </form>
      </div>
    </section>
  );
}