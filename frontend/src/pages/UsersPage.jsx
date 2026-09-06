import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import toast from "react-hot-toast";

import {
  AlertTriangle,
  Camera,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import api, {
  getErrorMessage,
} from "../services/api";

import { useAuth } from "../context/AuthContext";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  profileImage: "",
};

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

function sameId(a, b) {
  return String(a || "") ===
    String(b || "");
}

function userId(user) {
  return user?._id || user?.id;
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString();
}

function Modal({
  children,
  onClose,
  maxWidth = "560px",
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background:
          "rgba(15,23,42,.58)",
        backdropFilter:
          "blur(5px)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={(e) =>
          e.stopPropagation()
        }
        style={{
          width: "100%",
          maxWidth,
          maxHeight:
            "calc(100vh - 40px)",
          overflowY: "auto",
          background: "#fff",
          borderRadius: "22px",
          boxShadow:
            "0 30px 80px rgba(15,23,42,.28)",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      style={{
        position: "absolute",
        top: "14px",
        right: "14px",
        width: "36px",
        height: "36px",
        border: "none",
        borderRadius: "10px",
        background: "#f1f5f9",
        color: "#64748b",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      }}
    >
      <X size={18} />
    </button>
  );
}

export default function UsersPage() {
  const {
    admin,
    refresh,
  } = useAuth();

  const fileRef = useRef(null);

  const [users, setUsers] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [mode, setMode] =
    useState(null);

  const [selectedUser, setSelectedUser] =
    useState(null);

  const [deleteTarget, setDeleteTarget] =
    useState(null);

  const [showPassword, setShowPassword] =
    useState(false);

  const [form, setForm] =
    useState(emptyForm);

  async function loadUsers() {
    setLoading(true);

    try {
      const { data } =
        await api.get(
          "/auth/users"
        );

      setUsers(
        data.users || []
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      if (!q) return users;

      return users.filter(
        (user) =>
          user.name
            ?.toLowerCase()
            .includes(q) ||
          user.email
            ?.toLowerCase()
            .includes(q)
      );
    }, [users, search]);

  function openAdd() {
    setForm(emptyForm);
    setSelectedUser(null);
    setShowPassword(false);
    setMode("add");
  }

  function openView(user) {
    setSelectedUser(user);
    setMode("view");
  }

  function openEdit(user) {
    setSelectedUser(user);

    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      profileImage:
        user.profileImage || "",
    });

    setShowPassword(false);
    setMode("edit");
  }

  function closeModal() {
    if (saving) return;

    setMode(null);
    setSelectedUser(null);
    setForm(emptyForm);
    setShowPassword(false);
  }

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
      const data =
        await fileToBase64(file);

      setForm((current) => ({
        ...current,
        profileImage: data,
      }));
    } catch {
      toast.error(
        "Could not read image"
      );
    } finally {
      e.target.value = "";
    }
  }

  function validateForm() {
    if (
      form.name.trim().length <
      2
    ) {
      toast.error(
        "Name must be at least 2 characters"
      );
      return false;
    }

    if (
      !/^\S+@\S+\.\S+$/.test(
        form.email
      )
    ) {
      toast.error(
        "Enter a valid email"
      );
      return false;
    }

    if (
      mode === "add" &&
      !form.password
    ) {
      toast.error(
        "Password is required"
      );
      return false;
    }

    if (form.password) {
      if (
        form.password.length <
          8 ||
        !/[A-Z]/.test(
          form.password
        ) ||
        !/[a-z]/.test(
          form.password
        ) ||
        !/[0-9]/.test(
          form.password
        )
      ) {
        toast.error(
          "Password needs 8+ characters, uppercase, lowercase and number"
        );
        return false;
      }
    }

    return true;
  }

  async function submit(e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);

    try {
      if (mode === "add") {
        await api.post(
          "/auth/users",
          {
            name:
              form.name.trim(),
            email:
              form.email
                .trim()
                .toLowerCase(),
            password:
              form.password,
            profileImage:
              form.profileImage,
          }
        );

        toast.success(
          "User added successfully"
        );
      } else {
        const payload = {
          name:
            form.name.trim(),
          email:
            form.email
              .trim()
              .toLowerCase(),
          profileImage:
            form.profileImage,
        };

        if (form.password) {
          payload.password =
            form.password;
        }

        await api.put(
          `/auth/users/${userId(
            selectedUser
          )}`,
          payload
        );

        toast.success(
          "User updated successfully"
        );

        if (
          sameId(
            userId(
              selectedUser
            ),
            admin?.id ||
              admin?._id
          )
        ) {
          await refresh();
        }
      }

      closeModal();
      await loadUsers();
    } catch (error) {
      toast.error(
        getErrorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  }

  function askDelete(user) {
    const isSelf =
      sameId(
        userId(user),
        admin?.id ||
          admin?._id
      );

    if (isSelf) {
      toast.error(
        "You cannot delete your own account"
      );
      return;
    }

    setDeleteTarget(user);
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      await api.delete(
        `/auth/users/${userId(
          deleteTarget
        )}`
      );

      toast.success(
        "User deleted successfully"
      );

      setDeleteTarget(null);
      await loadUsers();
    } catch (error) {
      toast.error(
        getErrorMessage(error)
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section>
        <div className="page-heading">
          <div>
            <h1>
              User Management
            </h1>

            <p>
              Add, view, edit and
              delete admin users.
              Your current account
              cannot delete itself.
            </p>
          </div>

          <button
            className="primary-btn"
            onClick={openAdd}
          >
            <Plus size={17} />
            Add User
          </button>
        </div>

        <div
          className="panel"
          style={{
            padding: "18px",
            marginBottom: "18px",
          }}
        >
          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search by name or email..."
          />
        </div>

        {loading ? (
          <div
            className="panel"
            style={{
              padding: "30px",
              textAlign:
                "center",
            }}
          >
            Loading users...
          </div>
        ) : filteredUsers.length ===
          0 ? (
          <div
            className="panel"
            style={{
              padding: "30px",
              textAlign:
                "center",
            }}
          >
            No users found.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(270px, 1fr))",
              gap: "16px",
            }}
          >
            {filteredUsers.map(
              (user) => {
                const isSelf =
                  sameId(
                    userId(user),
                    admin?.id ||
                      admin?._id
                  );

                return (
                  <article
                    key={
                      userId(user)
                    }
                    className="panel"
                    style={{
                      padding:
                        "20px",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",
                        gap: "14px",
                        alignItems:
                          "center",
                      }}
                    >
                      <div
                        style={{
                          width:
                            "58px",
                          height:
                            "58px",
                          flexShrink: 0,
                          borderRadius:
                            "50%",
                          overflow:
                            "hidden",
                          background:
                            "#eef2ff",
                          display:
                            "grid",
                          placeItems:
                            "center",
                          color:
                            "#4f46e5",
                        }}
                      >
                        {user.profileImage ? (
                          <img
                            src={
                              user.profileImage
                            }
                            alt=""
                            style={{
                              width:
                                "100%",
                              height:
                                "100%",
                              objectFit:
                                "cover",
                            }}
                          />
                        ) : (
                          <UserRound
                            size={28}
                          />
                        )}
                      </div>

                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            gap: "7px",
                            alignItems:
                              "center",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <strong
                            style={{
                              fontSize:
                                "16px",
                            }}
                          >
                            {user.name ||
                              "Admin"}
                          </strong>

                          {isSelf && (
                            <span
                              style={{
                                fontSize:
                                  "11px",
                                fontWeight:
                                  800,
                                color:
                                  "#4f46e5",
                                background:
                                  "#eef2ff",
                                padding:
                                  "3px 7px",
                                borderRadius:
                                  "999px",
                              }}
                            >
                              YOU
                            </span>
                          )}
                        </div>

                        <span
                          style={{
                            display:
                              "block",
                            marginTop:
                              "3px",
                            color:
                              "#64748b",
                            fontSize:
                              "13px",
                            overflow:
                              "hidden",
                            textOverflow:
                              "ellipsis",
                          }}
                        >
                          {user.email}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop:
                          "1px solid #e5e7eb",
                        marginTop:
                          "18px",
                        paddingTop:
                          "14px",
                        display:
                          "grid",
                        gridTemplateColumns:
                          "repeat(3, 1fr)",
                        gap: "8px",
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() =>
                          openView(
                            user
                          )
                        }
                        style={{
                          justifyContent:
                            "center",
                        }}
                      >
                        <Eye
                          size={16}
                        />
                        View
                      </button>

                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() =>
                          openEdit(
                            user
                          )
                        }
                        style={{
                          justifyContent:
                            "center",
                        }}
                      >
                        <Pencil
                          size={16}
                        />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          askDelete(
                            user
                          )
                        }
                        disabled={
                          isSelf
                        }
                        title={
                          isSelf
                            ? "You cannot delete your own account"
                            : "Delete user"
                        }
                        style={{
                          border:
                            "1px solid #fecaca",
                          background:
                            isSelf
                              ? "#f8fafc"
                              : "#fff1f2",
                          color:
                            isSelf
                              ? "#94a3b8"
                              : "#dc2626",
                          borderRadius:
                            "10px",
                          minHeight:
                            "40px",
                          fontWeight:
                            700,
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "center",
                          gap: "6px",
                          cursor:
                            isSelf
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        <Trash2
                          size={16}
                        />
                        Delete
                      </button>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>

      {(mode === "add" ||
        mode === "edit") && (
        <Modal
          onClose={
            closeModal
          }
        >
          <CloseButton
            onClick={
              closeModal
            }
          />

          <form
            onSubmit={submit}
            style={{
              padding:
                "28px",
            }}
          >
            <h2
              style={{
                margin:
                  "0 0 6px",
              }}
            >
              {mode === "add"
                ? "Add User"
                : "Edit User"}
            </h2>

            <p
              style={{
                margin:
                  "0 0 22px",
                color:
                  "#64748b",
              }}
            >
              {mode === "add"
                ? "Create a new admin account."
                : "Update this admin account."}
            </p>

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: "16px",
                marginBottom:
                  "20px",
              }}
            >
              <div
                style={{
                  width:
                    "76px",
                  height:
                    "76px",
                  borderRadius:
                    "50%",
                  overflow:
                    "hidden",
                  background:
                    "#eef2ff",
                  display:
                    "grid",
                  placeItems:
                    "center",
                  color:
                    "#4f46e5",
                }}
              >
                {form.profileImage ? (
                  <img
                    src={
                      form.profileImage
                    }
                    alt=""
                    style={{
                      width:
                        "100%",
                      height:
                        "100%",
                      objectFit:
                        "cover",
                    }}
                  />
                ) : (
                  <UserRound
                    size={34}
                  />
                )}
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: "8px",
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() =>
                    fileRef.current?.click()
                  }
                >
                  <Camera
                    size={16}
                  />
                  Image
                </button>

                {form.profileImage && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() =>
                      setForm(
                        (current) => ({
                          ...current,
                          profileImage:
                            "",
                        })
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>

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

            <div
              style={{
                display:
                  "grid",
                gap: "16px",
              }}
            >
              <div>
                <label>
                  Name *
                </label>

                <input
                  value={
                    form.name
                  }
                  onChange={(e) =>
                    setForm(
                      (current) => ({
                        ...current,
                        name:
                          e.target
                            .value,
                      })
                    )
                  }
                  maxLength={80}
                  placeholder="Full name"
                />
              </div>

              <div>
                <label>
                  Email *
                </label>

                <input
                  type="email"
                  value={
                    form.email
                  }
                  onChange={(e) =>
                    setForm(
                      (current) => ({
                        ...current,
                        email:
                          e.target
                            .value,
                      })
                    )
                  }
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label>
                  Password{" "}
                  {mode ===
                  "add"
                    ? "*"
                    : ""}
                </label>

                <div
                  style={{
                    position:
                      "relative",
                  }}
                >
                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      form.password
                    }
                    onChange={(e) =>
                      setForm(
                        (current) => ({
                          ...current,
                          password:
                            e.target
                              .value,
                        })
                      )
                    }
                    placeholder={
                      mode ===
                      "edit"
                        ? "Leave blank to keep current password"
                        : "Minimum 8 characters"
                    }
                    style={{
                      paddingRight:
                        "46px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    style={{
                      position:
                        "absolute",
                      right: "8px",
                      top: "50%",
                      transform:
                        "translateY(-50%)",
                      border:
                        "none",
                      background:
                        "transparent",
                      color:
                        "#64748b",
                      cursor:
                        "pointer",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff
                        size={18}
                      />
                    ) : (
                      <Eye
                        size={18}
                      />
                    )}
                  </button>
                </div>
              </div>

              <button
                className="primary-btn"
                disabled={
                  saving
                }
                style={{
                  justifyContent:
                    "center",
                  minHeight:
                    "46px",
                  marginTop:
                    "4px",
                }}
              >
                <Save
                  size={17}
                />
                {saving
                  ? "Saving..."
                  : mode ===
                    "add"
                  ? "Create User"
                  : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "view" &&
        selectedUser && (
          <Modal
            onClose={
              closeModal
            }
            maxWidth="500px"
          >
            <CloseButton
              onClick={
                closeModal
              }
            />

            <div
              style={{
                padding:
                  "30px",
              }}
            >
              <div
                style={{
                  textAlign:
                    "center",
                  marginBottom:
                    "24px",
                }}
              >
                <div
                  style={{
                    width:
                      "94px",
                    height:
                      "94px",
                    borderRadius:
                      "50%",
                    overflow:
                      "hidden",
                    margin:
                      "0 auto 14px",
                    background:
                      "#eef2ff",
                    display:
                      "grid",
                    placeItems:
                      "center",
                    color:
                      "#4f46e5",
                  }}
                >
                  {selectedUser.profileImage ? (
                    <img
                      src={
                        selectedUser.profileImage
                      }
                      alt=""
                      style={{
                        width:
                          "100%",
                        height:
                          "100%",
                        objectFit:
                          "cover",
                      }}
                    />
                  ) : (
                    <UserRound
                      size={42}
                    />
                  )}
                </div>

                <h2
                  style={{
                    margin:
                      "0 0 5px",
                  }}
                >
                  {selectedUser.name}
                </h2>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#64748b",
                  }}
                >
                  {selectedUser.email}
                </p>
              </div>

              <div
                style={{
                  background:
                    "#f8fafc",
                  border:
                    "1px solid #e2e8f0",
                  borderRadius:
                    "14px",
                  padding:
                    "16px",
                  display:
                    "grid",
                  gap: "12px",
                  fontSize:
                    "14px",
                }}
              >
                <div>
                  <strong>
                    Role
                  </strong>

                  <div>
                    {selectedUser.role}
                  </div>
                </div>

                <div>
                  <strong>
                    Created
                  </strong>

                  <div>
                    {formatDate(
                      selectedUser.createdAt
                    )}
                  </div>
                </div>

                <div>
                  <strong>
                    Updated
                  </strong>

                  <div>
                    {formatDate(
                      selectedUser.updatedAt
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="primary-btn"
                onClick={() =>
                  openEdit(
                    selectedUser
                  )
                }
                style={{
                  width: "100%",
                  justifyContent:
                    "center",
                  marginTop:
                    "18px",
                }}
              >
                <Pencil
                  size={17}
                />
                Edit User
              </button>
            </div>
          </Modal>
        )}

      {deleteTarget && (
        <Modal
          onClose={() =>
            !deleting &&
            setDeleteTarget(
              null
            )
          }
          maxWidth="430px"
        >
          <CloseButton
            onClick={() =>
              !deleting &&
              setDeleteTarget(
                null
              )
            }
          />

          <div
            style={{
              padding: "30px",
              textAlign:
                "center",
            }}
          >
            <div
              style={{
                width: "62px",
                height: "62px",
                borderRadius:
                  "18px",
                margin:
                  "0 auto 16px",
                display:
                  "grid",
                placeItems:
                  "center",
                background:
                  "#fff1f2",
                color:
                  "#dc2626",
              }}
            >
              <AlertTriangle
                size={30}
              />
            </div>

            <h2
              style={{
                margin:
                  "0 0 8px",
              }}
            >
              Delete User?
            </h2>

            <p
              style={{
                margin:
                  "0 0 18px",
                color:
                  "#64748b",
                lineHeight: 1.6,
              }}
            >
              Are you sure you
              want to delete{" "}
              <strong
                style={{
                  color:
                    "#0f172a",
                }}
              >
                {deleteTarget.name}
              </strong>
              ? This action
              cannot be undone.
            </p>

            <div
              style={{
                background:
                  "#f8fafc",
                border:
                  "1px solid #e2e8f0",
                borderRadius:
                  "12px",
                padding:
                  "12px",
                marginBottom:
                  "20px",
                textAlign:
                  "left",
              }}
            >
              <strong>
                {deleteTarget.name}
              </strong>

              <span
                style={{
                  display:
                    "block",
                  color:
                    "#64748b",
                  fontSize:
                    "13px",
                  marginTop:
                    "3px",
                }}
              >
                {deleteTarget.email}
              </span>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "10px",
              }}
            >
              <button
                type="button"
                className="secondary-btn"
                disabled={
                  deleting
                }
                onClick={() =>
                  setDeleteTarget(
                    null
                  )
                }
                style={{
                  justifyContent:
                    "center",
                  minHeight:
                    "44px",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  deleting
                }
                onClick={
                  confirmDelete
                }
                style={{
                  minHeight:
                    "44px",
                  border:
                    "none",
                  borderRadius:
                    "10px",
                  background:
                    "#dc2626",
                  color: "#fff",
                  fontWeight:
                    800,
                  cursor:
                    deleting
                      ? "not-allowed"
                      : "pointer",
                  display:
                    "flex",
                  justifyContent:
                    "center",
                  alignItems:
                    "center",
                  gap: "7px",
                }}
              >
                <Trash2
                  size={17}
                />
                {deleting
                  ? "Deleting..."
                  : "Yes, Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
