import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarPlus,
  CheckCheck,
  Send,
  X,
  AlertTriangle,
} from "lucide-react";

import api, { getErrorMessage } from "../services/api";

function nextDayText() {
  const d = new Date();

  d.setDate(d.getDate() + 1);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  return `NEXT DAY\n${dd}/${mm}/${yyyy}`;
}

export default function SendPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api
      .get("/webhooks")
      .then(({ data }) => {
        const active = data.webhooks.filter(
          (w) => w.isActive,
        );

        setWebhooks(active);

        setSelected(
          active.map((w) => w._id),
        );
      })
      .catch((e) => {
        toast.error(getErrorMessage(e));
      });
  }, []);

  const allSelected =
    webhooks.length > 0 &&
    selected.length === webhooks.length;

  const groups = useMemo(
    () => [
      ...new Set(
        webhooks.map((w) => w.group),
      ),
    ],
    [webhooks],
  );

  function toggleAll() {
    setSelected(
      allSelected
        ? []
        : webhooks.map((w) => w._id),
    );
  }

  function toggleOne(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    );
  }

  function selectGroup(group) {
    const ids = webhooks
      .filter((w) => w.group === group)
      .map((w) => w._id);

    const groupAllSelected = ids.every(
      (id) => selected.includes(id),
    );

    setSelected((current) =>
      groupAllSelected
        ? current.filter(
            (id) => !ids.includes(id),
          )
        : [
            ...new Set([
              ...current,
              ...ids,
            ]),
          ],
    );
  }

  function handleGenerateNextDay() {
    setMessage(nextDayText());
  }

  function handleSendClick(e) {
    e.preventDefault();

    const clean = message.trim();

    if (!clean) {
      toast.error(
        "Write a message first",
      );
      return;
    }

    if (clean.length > 2000) {
      toast.error(
        "Discord messages can be at most 2000 characters",
      );
      return;
    }

    if (!selected.length) {
      toast.error(
        "Select at least one webhook",
      );
      return;
    }

    setShowConfirm(true);
  }

  async function confirmSend() {
    const clean = message.trim();

    setShowConfirm(false);
    setSending(true);
    setResult(null);

    try {
      const { data } =
        await api.post(
          "/messages/broadcast",
          {
            message: clean,
            webhookIds: selected,
          },
        );

      setResult(data);

      if (data.failedCount) {
        toast.error(
          `${data.successCount} sent, ${data.failedCount} failed`,
        );
      } else {
        toast.success(
          `Sent successfully to ${data.successCount} webhook${
            data.successCount !== 1
              ? "s"
              : ""
          }`,
        );
      }
    } catch (error) {
      toast.error(
        getErrorMessage(error),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <section>
        <div className="page-heading">
          <div>
            <h1>Send Message</h1>

            <p>
              Write once and broadcast to
              all or selected active Discord
              webhooks.
            </p>
          </div>
        </div>

        <div className="send-layout">
          <form
            className="panel send-panel"
            onSubmit={handleSendClick}
          >
            <div className="section-title">
              <div>
                <h2>Message</h2>

                <p>
                  {message.length}/2000
                  characters
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={
                  handleGenerateNextDay
                }
              >
                <CalendarPlus
                  size={17}
                />

                Generate Next Day
              </button>
            </div>

            <textarea
              rows="7"
              value={message}
              onChange={(e) =>
                setMessage(
                  e.target.value,
                )
              }
              maxLength={2000}
              placeholder="Write your message here..."
            />

            <div className="selection-head">
              <div>
                <h2>Recipients</h2>

                <p>
                  {selected.length} of{" "}
                  {webhooks.length} selected
                </p>
              </div>

              <button
                type="button"
                className="secondary-btn"
                onClick={toggleAll}
              >
                <CheckCheck
                  size={17}
                />

                {allSelected
                  ? "Clear All"
                  : "Select All"}
              </button>
            </div>

            {groups.length > 0 && (
              <div className="group-chips">
                {groups.map(
                  (group) => (
                    <button
                      type="button"
                      key={group}
                      onClick={() =>
                        selectGroup(
                          group,
                        )
                      }
                    >
                      {group}
                    </button>
                  ),
                )}
              </div>
            )}

            <div className="recipient-list">
              {webhooks.length ===
              0 ? (
                <div className="empty-state">
                  No active webhooks.
                  Add or enable a
                  webhook first.
                </div>
              ) : (
                webhooks.map(
                  (webhook) => (
                    <label
                      className="recipient-row"
                      key={
                        webhook._id
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(
                          webhook._id,
                        )}
                        onChange={() =>
                          toggleOne(
                            webhook._id,
                          )
                        }
                      />

                      <div>
                        <strong>
                          {
                            webhook.name
                          }
                        </strong>

                        <span>
                          {
                            webhook.group
                          }
                        </span>
                      </div>
                    </label>
                  ),
                )
              )}
            </div>

            <button
              type="submit"
              className="primary-btn full send-main-btn"
              disabled={
                sending ||
                !webhooks.length
              }
            >
              <Send size={18} />

              {sending
                ? "Sending…"
                : `Send to ${selected.length} Webhook${
                    selected.length !==
                    1
                      ? "s"
                      : ""
                  }`}
            </button>
          </form>

          <aside className="panel result-panel">
            <h2>Last Result</h2>

            {!result ? (
              <div className="empty-state compact">
                Your latest broadcast
                result will appear here.
              </div>
            ) : (
              <>
                <div className="result-stats">
                  <div>
                    <span>Total</span>

                    <strong>
                      {
                        result.totalWebhooks
                      }
                    </strong>
                  </div>

                  <div>
                    <span>Success</span>

                    <strong>
                      {
                        result.successCount
                      }
                    </strong>
                  </div>

                  <div>
                    <span>Failed</span>

                    <strong>
                      {
                        result.failedCount
                      }
                    </strong>
                  </div>
                </div>

                <div className="result-list">
                  {result.results.map(
                    (item) => (
                      <div
                        className={`result-row ${item.status.toLowerCase()}`}
                        key={
                          item.webhookId
                        }
                      >
                        <div>
                          <strong>
                            {
                              item.webhookName
                            }
                          </strong>

                          <span>
                            {
                              item.group
                            }
                          </span>
                        </div>

                        <b>
                          {
                            item.status
                          }
                        </b>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </section>

      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background:
              "rgba(15, 23, 42, 0.55)",
            backdropFilter:
              "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            zIndex: 9999,
            animation:
              "confirmFadeIn .2s ease",
          }}
          onClick={() =>
            setShowConfirm(false)
          }
        >
          <style>
            {`
              @keyframes confirmFadeIn {
                from {
                  opacity: 0;
                }

                to {
                  opacity: 1;
                }
              }

              @keyframes confirmCardIn {
                from {
                  opacity: 0;
                  transform:
                    translateY(15px)
                    scale(.96);
                }

                to {
                  opacity: 1;
                  transform:
                    translateY(0)
                    scale(1);
                }
              }
            `}
          </style>

          <div
            onClick={(e) =>
              e.stopPropagation()
            }
            style={{
              width: "100%",
              maxWidth: "430px",
              background: "#fff",
              borderRadius: "20px",
              padding: "26px",
              boxShadow:
                "0 30px 80px rgba(15,23,42,.28)",
              position: "relative",
              animation:
                "confirmCardIn .25s ease",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setShowConfirm(
                  false,
                )
              }
              style={{
                position:
                  "absolute",
                top: "14px",
                right: "14px",
                width: "34px",
                height: "34px",
                border: "none",
                borderRadius: "10px",
                background:
                  "#f3f4f6",
                color: "#64748b",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "16px",
                display: "grid",
                placeItems: "center",
                margin:
                  "0 auto 16px",
                background:
                  "#fff7ed",
                color: "#ea580c",
              }}
            >
              <AlertTriangle
                size={28}
              />
            </div>

            <div
              style={{
                textAlign: "center",
              }}
            >
              <h2
                style={{
                  margin:
                    "0 0 8px",
                  fontSize: "22px",
                  color: "#111827",
                }}
              >
                Confirm Broadcast
              </h2>

              <p
                style={{
                  margin:
                    "0 0 18px",
                  color: "#6b7280",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                Are you sure you want
                to send this message
                to{" "}
                <strong
                  style={{
                    color:
                      "#111827",
                  }}
                >
                  {selected.length}
                </strong>{" "}
                webhook
                {selected.length !== 1
                  ? "s"
                  : ""}
                ?
              </p>
            </div>

            <div
              style={{
                background:
                  "#f9fafb",
                border:
                  "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "20px",
                maxHeight: "130px",
                overflowY: "auto",
                whiteSpace:
                  "pre-wrap",
                fontSize: "13px",
                color: "#374151",
              }}
            >
              {message}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setShowConfirm(
                    false,
                  )
                }
                style={{
                  minHeight:
                    "44px",
                  borderRadius:
                    "11px",
                  border:
                    "1px solid #d1d5db",
                  background:
                    "#fff",
                  color:
                    "#374151",
                  fontWeight: 700,
                  cursor:
                    "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  confirmSend
                }
                style={{
                  minHeight:
                    "44px",
                  borderRadius:
                    "11px",
                  border: "none",
                  background:
                    "linear-gradient(135deg,#4f46e5,#7c3aed)",
                  color: "#fff",
                  fontWeight: 700,
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  gap: "7px",
                  cursor:
                    "pointer",
                }}
              >
                <Send
                  size={17}
                />

                Yes, Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}