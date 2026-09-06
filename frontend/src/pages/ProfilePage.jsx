import {
  useEffect,
  useRef,
  useState,
} from "react";

import toast from "react-hot-toast";

import {
  Camera,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import api, {
  getErrorMessage,
} from "../services/api";

import { useAuth } from "../context/AuthContext";

function fileToBase64(file) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () =>
        resolve(reader.result);

      reader.onerror =
        reject;

      reader.readAsDataURL(file);
    }
  );
}

export default function ProfilePage() {
  const {
    admin,
    refresh,
  } = useAuth();

  const fileRef = useRef(null);

  const [name, setName] =
    useState("");

  const [
    profileImage,
    setProfileImage,
  ] = useState("");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    setName(admin?.name || "");
    setProfileImage(
      admin?.profileImage || ""
    );
  }, [admin]);

  async function chooseImage(e) {
    const file =
      e.target.files?.[0];

    if (!file) return;

    if (
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
      ].includes(file.type)
    ) {
      toast.error(
        "Use PNG, JPG or WebP"
      );
      return;
    }

    if (
      file.size >
      2 * 1024 * 1024
    ) {
      toast.error(
        "Image must be smaller than 2 MB"
      );
      return;
    }

    try {
      const base64 =
        await fileToBase64(file);

      setProfileImage(base64);
    } catch {
      toast.error(
        "Could not read image"
      );
    } finally {
      e.target.value = "";
    }
  }

  async function submit(e) {
    e.preventDefault();

    if (
      name.trim().length < 2
    ) {
      toast.error(
        "Name must be at least 2 characters"
      );
      return;
    }

    setSaving(true);

    try {
      await api.put(
        "/auth/profile",
        {
          name: name.trim(),
          profileImage,
        }
      );

      await refresh();

      toast.success(
        "Profile updated successfully"
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Profile</h1>

          <p>
            Your name and image are
            used as the Discord
            broadcast sender.
          </p>
        </div>
      </div>

      <form
        className="panel"
        onSubmit={submit}
        style={{
          maxWidth: "680px",
          padding: "28px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "22px",
            marginBottom: "28px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: "112px",
              height: "112px",
              borderRadius: "50%",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              background: "#eef2ff",
              color: "#4f46e5",
              border:
                "4px solid #fff",
              boxShadow:
                "0 10px 30px rgba(15,23,42,.12)",
            }}
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <UserRound
                size={46}
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                fileRef.current?.click()
              }
            >
              <Camera size={17} />
              Change Image
            </button>

            {profileImage && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setProfileImage("")
                }
              >
                <Trash2
                  size={17}
                />
                Remove
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              onChange={
                chooseImage
              }
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "18px",
          }}
        >
          <div>
            <label>Name</label>

            <input
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                )
              }
              maxLength={80}
              placeholder="Your name"
            />
          </div>

          <div>
            <label>Email</label>

            <input
              value={
                admin?.email || ""
              }
              disabled
            />

            <small
              style={{
                color: "#64748b",
              }}
            >
              Email is managed
              from User Management.
            </small>
          </div>

          <button
            className="primary-btn"
            disabled={saving}
            style={{
              justifySelf: "start",
            }}
          >
            <Save size={17} />
            {saving
              ? "Saving..."
              : "Update Profile"}
          </button>
        </div>
      </form>
    </section>
  );
}
