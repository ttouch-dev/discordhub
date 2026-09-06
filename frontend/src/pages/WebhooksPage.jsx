import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import api, { getErrorMessage } from "../services/api";

const emptyForm = {
  name: "",
  group: "GENERAL",
  webhookUrl: "",
  isActive: true,
};

const ITEMS_PER_PAGE = 24;

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/webhooks");

      setWebhooks(data.webhooks || []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    return [
      ...new Set(
        webhooks
          .map((w) => w.group)
          .filter(Boolean),
      ),
    ];
  }, [webhooks]);

  const filteredWebhooks = useMemo(() => {
    const keyword = search
      .trim()
      .toLowerCase();

    if (!keyword) {
      return webhooks;
    }

    return webhooks.filter((w) =>
      String(w.name || "")
        .toLowerCase()
        .includes(keyword),
    );
  }, [webhooks, search]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredWebhooks.length /
        ITEMS_PER_PAGE,
    ),
  );

  const paginatedWebhooks = useMemo(() => {
    const startIndex =
      (currentPage - 1) *
      ITEMS_PER_PAGE;

    const endIndex =
      startIndex + ITEMS_PER_PAGE;

    return filteredWebhooks.slice(
      startIndex,
      endIndex,
    );
  }, [filteredWebhooks, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function getPageNumbers() {
    if (totalPages <= 5) {
      return Array.from(
        { length: totalPages },
        (_, index) => index + 1,
      );
    }

    if (currentPage <= 3) {
      return [
        1,
        2,
        3,
        "...",
        totalPages,
      ];
    }

    if (
      currentPage >=
      totalPages - 2
    ) {
      return [
        1,
        "...",
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [
      1,
      "...",
      currentPage,
      "...",
      totalPages,
    ];
  }

  function goToPage(page) {
    if (
      page < 1 ||
      page > totalPages
    ) {
      return;
    }

    setCurrentPage(page);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModal(true);
  }

  function openEdit(w) {
    setEditing(w);

    setForm({
      name: w.name,
      group: w.group,
      webhookUrl: "",
      isActive: w.isActive,
    });

    setErrors({});
    setModal(true);
  }

  function validate() {
    const next = {};

    if (
      form.name.trim().length < 2
    ) {
      next.name =
        "Name must be at least 2 characters";
    }

    if (!form.group.trim()) {
      next.group =
        "Group is required";
    }

    const webhookRegex =
      /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//i;

    if (
      !editing &&
      !webhookRegex.test(
        form.webhookUrl.trim(),
      )
    ) {
      next.webhookUrl =
        "Enter a valid Discord webhook URL";
    }

    if (
      editing &&
      form.webhookUrl &&
      !webhookRegex.test(
        form.webhookUrl.trim(),
      )
    ) {
      next.webhookUrl =
        "Enter a valid Discord webhook URL";
    }

    setErrors(next);

    return (
      Object.keys(next).length ===
      0
    );
  }

  async function save(e) {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    try {
      if (editing) {
        const payload = {
          name: form.name.trim(),
          group: form.group.trim(),
          isActive: form.isActive,
        };

        if (
          form.webhookUrl.trim()
        ) {
          payload.webhookUrl =
            form.webhookUrl.trim();
        }

        await api.put(
          `/webhooks/${editing._id}`,
          payload,
        );

        toast.success(
          "Webhook updated",
        );
      } else {
        await api.post(
          "/webhooks",
          {
            ...form,
            name: form.name.trim(),
            group:
              form.group.trim(),
            webhookUrl:
              form.webhookUrl.trim(),
          },
        );

        toast.success(
          "Webhook added",
        );
      }

      setModal(false);

      await load();
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(w) {
    try {
      await api.put(
        `/webhooks/${w._id}`,
        {
          isActive:
            !w.isActive,
        },
      );

      setWebhooks((list) =>
        list.map((x) =>
          x._id === w._id
            ? {
                ...x,
                isActive:
                  !x.isActive,
              }
            : x,
        ),
      );

      toast.success(
        `Webhook ${
          w.isActive
            ? "disabled"
            : "enabled"
        }`,
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      );
    }
  }

  // Open delete confirmation modal
  function remove(w) {
    setDeleteTarget(w);
  }

  // Actually delete selected webhook
  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await api.delete(
        `/webhooks/${deleteTarget._id}`,
      );

      setWebhooks((list) =>
        list.filter(
          (x) =>
            x._id !== deleteTarget._id,
        ),
      );

      toast.success(
        `${deleteTarget.name} deleted successfully`,
      );

      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      );
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    if (deleting) return;

    setDeleteTarget(null);
  }

  const paginationButtonStyle = (
    active = false,
  ) => ({
    minWidth: "38px",
    height: "38px",
    padding: "0 10px",
    border: active
      ? "1px solid #4f46e5"
      : "1px solid #d8dee6",
    borderRadius: "8px",
    background: active
      ? "#4f46e5"
      : "#ffffff",
    color: active
      ? "#ffffff"
      : "#374151",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Webhooks</h1>

          <p>
            Add, group, enable,
            disable, and manage
            Discord webhooks.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "300px",
              minHeight: "42px",
              padding: "0 12px",
              background:
                "#ffffff",
              border:
                "1px solid #d8dee6",
              borderRadius:
                "10px",
            }}
          >
            <Search
              size={17}
              style={{
                color: "#6b7280",
                flexShrink: 0,
              }}
            />

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value,
                )
              }
              placeholder="Search webhook name..."
              style={{
                width: "100%",
                minWidth: 0,
                border: "none",
                outline: "none",
                boxShadow: "none",
                padding: 0,
                background:
                  "transparent",
                borderRadius: 0,
                fontSize: "14px",
              }}
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch("")
                }
                title="Clear search"
                style={{
                  border: "none",
                  background:
                    "transparent",
                  color: "#6b7280",
                  padding: "4px",
                  minHeight:
                    "auto",
                  minWidth:
                    "auto",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  borderRadius:
                    "6px",
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <button
            className="primary-btn"
            onClick={openCreate}
          >
            <Plus size={18} />
            Add Webhook
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span>Total</span>

          <strong>
            {webhooks.length}
          </strong>
        </div>

        <div className="stat-card">
          <span>Active</span>

          <strong>
            {
              webhooks.filter(
                (w) =>
                  w.isActive,
              ).length
            }
          </strong>
        </div>

        <div className="stat-card">
          <span>Groups</span>

          <strong>
            {groups.length}
          </strong>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            Loading…
          </div>
        ) : webhooks.length ===
          0 ? (
          <div className="empty-state">
            No webhooks yet. Add
            your first webhook.
          </div>
        ) : filteredWebhooks.length ===
          0 ? (
          <div className="empty-state">
            No webhook found for "
            {search}".
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                justifyContent:
                  "space-between",
                gap: "12px",
                marginBottom:
                  "16px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize:
                    "13px",
                  color: "#6b7280",
                }}
              >
                Showing{" "}
                {(currentPage - 1) *
                  ITEMS_PER_PAGE +
                  1}
                {" - "}
                {Math.min(
                  currentPage *
                    ITEMS_PER_PAGE,
                  filteredWebhooks.length,
                )}{" "}
                of{" "}
                {
                  filteredWebhooks.length
                }
              </span>

              <span
                style={{
                  fontSize:
                    "13px",
                  color: "#6b7280",
                  fontWeight: 600,
                }}
              >
                {ITEMS_PER_PAGE} per page
              </span>
            </div>

            <div className="webhook-grid">
              {paginatedWebhooks.map(
                (w) => (
                  <article
                    className="webhook-card"
                    key={w._id}
                  >
                    <div className="card-top">
                      <div>
                        <span className="group-badge">
                          {w.group}
                        </span>

                        <h3>
                          {w.name}
                        </h3>
                      </div>

                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={
                            w.isActive
                          }
                          onChange={() =>
                            toggle(w)
                          }
                        />

                        <span />
                      </label>
                    </div>

                    <p className="masked-url">
                      {w.maskedUrl}
                    </p>

                    <div className="card-actions">
                      <button
                        className="secondary-btn"
                        onClick={() =>
                          openEdit(
                            w,
                          )
                        }
                      >
                        <Edit3
                          size={
                            16
                          }
                        />
                        Edit
                      </button>

                      <button
                        className="danger-btn"
                        onClick={() =>
                          remove(w)
                        }
                      >
                        <Trash2
                          size={
                            16
                          }
                        />
                        Delete
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>

            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  gap: "6px",
                  marginTop:
                    "24px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    goToPage(
                      currentPage -
                        1,
                    )
                  }
                  disabled={
                    currentPage ===
                    1
                  }
                  style={paginationButtonStyle()}
                >
                  &lt;
                </button>

                {getPageNumbers().map(
                  (
                    page,
                    index,
                  ) => {
                    if (
                      page ===
                      "..."
                    ) {
                      return (
                        <span
                          key={`dots-${index}`}
                          style={{
                            minWidth:
                              "28px",
                            height:
                              "38px",
                            display:
                              "inline-flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            color:
                              "#6b7280",
                            fontWeight:
                              700,
                          }}
                        >
                          ...
                        </span>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={
                          page
                        }
                        onClick={() =>
                          goToPage(
                            page,
                          )
                        }
                        style={paginationButtonStyle(
                          currentPage ===
                            page,
                        )}
                      >
                        {page}
                      </button>
                    );
                  },
                )}

                <button
                  type="button"
                  onClick={() =>
                    goToPage(
                      currentPage +
                        1,
                    )
                  }
                  disabled={
                    currentPage ===
                    totalPages
                  }
                  style={paginationButtonStyle()}
                >
                  &gt;
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
        >
          <form
            className="modal-card"
            onSubmit={save}
            noValidate
          >
            <div className="modal-head">
              <div>
                <h2>
                  {editing
                    ? "Edit Webhook"
                    : "Add Webhook"}
                </h2>

                <p>
                  {editing
                    ? "Leave URL blank to keep the existing URL."
                    : "Webhook URL will be encrypted before saving."}
                </p>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={() =>
                  setModal(false)
                }
              >
                <X size={20} />
              </button>
            </div>

            <label>Name</label>

            <input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name:
                    e.target
                      .value,
                })
              }
              placeholder="TR Orders"
            />

            {errors.name && (
              <div className="field-error">
                {errors.name}
              </div>
            )}

            <label>Group</label>

            <input
              value={form.group}
              onChange={(e) =>
                setForm({
                  ...form,
                  group:
                    e.target
                      .value,
                })
              }
              placeholder="TR"
            />

            {errors.group && (
              <div className="field-error">
                {errors.group}
              </div>
            )}

            <label>
              Discord Webhook URL
            </label>

            <input
              type="url"
              value={
                form.webhookUrl
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  webhookUrl:
                    e.target
                      .value,
                })
              }
              placeholder="https://discord.com/api/webhooks/..."
            />

            {errors.webhookUrl && (
              <div className="field-error">
                {
                  errors.webhookUrl
                }
              </div>
            )}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={
                  form.isActive
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    isActive:
                      e.target
                        .checked,
                  })
                }
              />

              Active
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-btn"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : "Save Webhook"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeDeleteModal();
            }
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-webhook-title"
            style={{
              width:
                "calc(100% - 32px)",
              maxWidth:
                "460px",
            }}
          >
            <div className="modal-head">
              <div>
                <h2
                  id="delete-webhook-title"
                  style={{
                    color:
                      "#b91c1c",
                  }}
                >
                  Delete Webhook?
                </h2>

                <p>
                  You are about to delete the selected webhook.
                  This action cannot be undone.
                </p>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={
                  closeDeleteModal
                }
                disabled={
                  deleting
                }
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                marginTop:
                  "18px",
                padding:
                  "16px",
                border:
                  "1px solid #fecaca",
                background:
                  "#fef2f2",
                borderRadius:
                  "12px",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "flex-start",
                  justifyContent:
                    "space-between",
                  gap:
                    "12px",
                }}
              >
                <div>
                  <span
                    style={{
                      display:
                        "inline-flex",
                      alignItems:
                        "center",
                      minHeight:
                        "22px",
                      padding:
                        "2px 8px",
                      borderRadius:
                        "999px",
                      background:
                        "#e0e7ff",
                      color:
                        "#3730a3",
                      fontSize:
                        "11px",
                      fontWeight:
                        700,
                      marginBottom:
                        "8px",
                    }}
                  >
                    {deleteTarget.group ||
                      "GENERAL"}
                  </span>

                  <h3
                    style={{
                      margin:
                        "0 0 8px",
                      fontSize:
                        "18px",
                      color:
                        "#111827",
                    }}
                  >
                    {deleteTarget.name}
                  </h3>
                </div>

                <div
                  style={{
                    width:
                      "36px",
                    height:
                      "36px",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    borderRadius:
                      "10px",
                    background:
                      "#fee2e2",
                    color:
                      "#dc2626",
                    flexShrink:
                      0,
                  }}
                >
                  <Trash2
                    size={18}
                  />
                </div>
              </div>

              <p
                style={{
                  margin: 0,
                  color:
                    "#6b7280",
                  fontSize:
                    "13px",
                  lineHeight:
                    1.6,
                  wordBreak:
                    "break-all",
                }}
              >
                {deleteTarget.maskedUrl ||
                  "Webhook URL unavailable"}
              </p>
            </div>

            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "flex-start",
                gap:
                  "10px",
                marginTop:
                  "14px",
                padding:
                  "12px 14px",
                border:
                  "1px solid #fed7aa",
                background:
                  "#fff7ed",
                borderRadius:
                  "10px",
                color:
                  "#9a3412",
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
              }}
            >
              <Trash2
                size={17}
                style={{
                  flexShrink:
                    0,
                  marginTop:
                    "1px",
                }}
              />

              <span>
                Only this webhook card will be deleted.
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={
                  closeDeleteModal
                }
                disabled={
                  deleting
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="danger-btn"
                onClick={
                  confirmDelete
                }
                disabled={
                  deleting
                }
                style={{
                  display:
                    "inline-flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  gap:
                    "7px",
                }}
              >
                <Trash2
                  size={16}
                />

                {deleting
                  ? "Deleting..."
                  : "Delete Webhook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}