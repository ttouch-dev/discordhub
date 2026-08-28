import { useState } from "react";
import {
  Navigate,
  useNavigate,
} from "react-router-dom";

import toast from "react-hot-toast";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../services/api";

export default function LoginPage() {
  const { admin, login } = useAuth();

  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (admin) {
    return (
      <Navigate
        to="/admin/send"
        replace
      />
    );
  }

  function validate() {
    const next = {};

    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      next.email = "Enter a valid email";
    }

    if (form.password.length < 6) {
      next.password =
        "Password must be at least 6 characters";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function submit(e) {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);

    try {
      await login(
        form.email.trim(),
        form.password,
      );

      toast.success("Login successful");

      navigate("/admin/send", {
        replace: true,
      });
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pageStyle = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #ede9fe 100%)",
  };

  const glowOneStyle = {
    position: "absolute",
    width: "420px",
    height: "420px",
    borderRadius: "50%",
    background:
      "rgba(79, 70, 229, 0.16)",
    filter: "blur(80px)",
    top: "-130px",
    left: "-100px",
    animation:
      "floatGlowOne 8s ease-in-out infinite",
  };

  const glowTwoStyle = {
    position: "absolute",
    width: "420px",
    height: "420px",
    borderRadius: "50%",
    background:
      "rgba(124, 58, 237, 0.14)",
    filter: "blur(90px)",
    bottom: "-150px",
    right: "-100px",
    animation:
      "floatGlowTwo 10s ease-in-out infinite",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: "440px",
    background:
      "rgba(255,255,255,0.88)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter:
      "blur(18px)",
    border:
      "1px solid rgba(255,255,255,0.8)",
    borderRadius: "24px",
    padding: "32px",
    boxShadow:
      "0 24px 70px rgba(15,23,42,0.16)",
    position: "relative",
    zIndex: 2,
    animation:
      "loginCardEnter .65s cubic-bezier(.2,.8,.2,1)",
  };

  const logoStyle = {
    width: "64px",
    height: "64px",
    margin: "0 auto",
    borderRadius: "18px",
    background:
      "linear-gradient(135deg,#4f46e5,#7c3aed)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    boxShadow:
      "0 12px 30px rgba(79,70,229,.30)",
    position: "relative",
  };

  const inputWrapperStyle = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    border: "1px solid #d8dee6",
    borderRadius: "12px",
    paddingLeft: "12px",
    background: "#fff",
    transition: ".2s",
    position: "relative",
  };

  const inputStyle = {
    border: "none",
    boxShadow: "none",
    outline: "none",
    background: "transparent",
    padding: "12px 44px 12px 0",
    width: "100%",
  };

  const iconStyle = {
    color: "#6b7280",
    flexShrink: 0,
  };

  const eyeButtonStyle = {
    position: "absolute",
    right: "10px",
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
    <div style={pageStyle}>
      <style>
        {`
          @keyframes loginCardEnter {
            from {
              opacity: 0;
              transform: translateY(24px) scale(.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes floatGlowOne {
            0%,100% {
              transform: translate(0,0);
            }
            50% {
              transform: translate(40px,30px);
            }
          }

          @keyframes floatGlowTwo {
            0%,100% {
              transform: translate(0,0);
            }
            50% {
              transform: translate(-35px,-25px);
            }
          }

          @keyframes pulseLogo {
            0%,100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
          }

          @keyframes shimmer {
            0% {
              transform: translateX(-120%);
            }
            100% {
              transform: translateX(220%);
            }
          }

          .premium-login-input:focus-within {
            border-color: #4f46e5 !important;
            box-shadow:
              0 0 0 3px rgba(79,70,229,.12) !important;
          }

          .premium-login-btn {
            position: relative;
            overflow: hidden;
            transition:
              transform .2s ease,
              box-shadow .2s ease;
          }

          .premium-login-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
              0 12px 26px rgba(79,70,229,.28);
          }

          .premium-login-btn::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 38%;
            height: 100%;
            background:
              linear-gradient(
                90deg,
                transparent,
                rgba(255,255,255,.28),
                transparent
              );
            transform: translateX(-120%);
          }

          .premium-login-btn:hover::after {
            animation: shimmer .8s ease;
          }
        `}
      </style>

      <div style={glowOneStyle} />
      <div style={glowTwoStyle} />

      <form
        style={cardStyle}
        onSubmit={submit}
        noValidate
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              ...logoStyle,
              animation:
                "pulseLogo 4s ease-in-out infinite",
            }}
          >
            <ShieldCheck size={30} />

            <div
              style={{
                position: "absolute",
                right: "-4px",
                top: "-4px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#fff",
                color: "#7c3aed",
                display: "grid",
                placeItems: "center",
                boxShadow:
                  "0 4px 12px rgba(0,0,0,.12)",
              }}
            >
              <Sparkles size={12} />
            </div>
          </div>

          <h1
            style={{
              margin:
                "18px 0 8px",
              fontSize: "30px",
              color: "#111827",
            }}
          >
            Welcome Back
          </h1>

         
        </div>

        <label>Email</label>

        <div
          className="premium-login-input"
          style={inputWrapperStyle}
        >
          <Mail
            size={18}
            style={iconStyle}
          />

          <input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value,
              })
            }
            autoComplete="email"
            placeholder="admin@example.com"
            style={{
              ...inputStyle,
              paddingRight: "12px",
            }}
          />
        </div>

        {errors.email && (
          <div className="field-error">
            {errors.email}
          </div>
        )}

        <label>Password</label>

        <div
          className="premium-login-input"
          style={inputWrapperStyle}
        >
          <LockKeyhole
            size={18}
            style={iconStyle}
          />

          <input
            type={
              showPassword
                ? "text"
                : "password"
            }
            value={form.password}
            onChange={(e) =>
              setForm({
                ...form,
                password: e.target.value,
              })
            }
            autoComplete="current-password"
            placeholder="••••••••"
            style={inputStyle}
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword(
                (prev) => !prev,
              )
            }
            style={eyeButtonStyle}
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
            title={
              showPassword
                ? "Hide password"
                : "Show password"
            }
          >
            {showPassword ? (
              <EyeOff size={18} />
            ) : (
              <Eye size={18} />
            )}
          </button>
        </div>

        {errors.password && (
          <div className="field-error">
            {errors.password}
          </div>
        )}

        <button
          className="primary-btn full premium-login-btn"
          disabled={submitting}
          style={{
            marginTop: "22px",
            minHeight: "48px",
            borderRadius: "12px",
            background:
              "linear-gradient(135deg,#4f46e5,#7c3aed)",
            fontSize: "15px",
          }}
        >
          {submitting
            ? "Signing in…"
            : "Login"}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginTop: "18px",
            color: "#9ca3af",
            fontSize: "12px",
          }}
        >
          <LockKeyhole size={13} />
          Secure Admin Access
        </div>
      </form>
    </div>
  );
}