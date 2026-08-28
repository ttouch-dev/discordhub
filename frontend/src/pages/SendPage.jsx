import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CalendarPlus, CheckCheck, Send } from "lucide-react";

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

  useEffect(() => {
    api
      .get("/webhooks")
      .then(({ data }) => {
        const active = data.webhooks.filter((w) => w.isActive);

        setWebhooks(active);
        setSelected(active.map((w) => w._id));
      })
      .catch((e) => {
        toast.error(getErrorMessage(e));
      });
  }, []);

  const allSelected =
    webhooks.length > 0 &&
    selected.length === webhooks.length;

  const groups = useMemo(
    () => [...new Set(webhooks.map((w) => w.group))],
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

    const groupAllSelected = ids.every((id) =>
      selected.includes(id),
    );

    setSelected((current) =>
      groupAllSelected
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  }

  function handleGenerateNextDay() {
    setMessage(nextDayText());
  }

  async function send(e) {
    e.preventDefault();

    const clean = message.trim();

    if (!clean) {
      toast.error("Write a message first");
      return;
    }

    if (clean.length > 2000) {
      toast.error(
        "Discord messages can be at most 2000 characters",
      );
      return;
    }

    if (!selected.length) {
      toast.error("Select at least one webhook");
      return;
    }

    const confirmed = window.confirm(
      `Send this message to ${selected.length} webhook${
        selected.length > 1 ? "s" : ""
      }?`,
    );

    if (!confirmed) return;

    setSending(true);
    setResult(null);

    try {
      const { data } = await api.post(
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
            data.successCount !== 1 ? "s" : ""
          }`,
        );
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Send Message</h1>

          <p>
            Write once and broadcast to all or selected active
            Discord webhooks.
          </p>
        </div>
      </div>

      <div className="send-layout">
        <form
          className="panel send-panel"
          onSubmit={send}
        >
          <div className="section-title">
            <div>
              <h2>Message</h2>
              <p>{message.length}/2000 characters</p>
            </div>

            <button
              type="button"
              className="secondary-btn"
              onClick={handleGenerateNextDay}
            >
              <CalendarPlus size={17} />
              Generate Next Day
            </button>
          </div>

          <textarea
            rows="7"
            value={message}
            onChange={(e) =>
              setMessage(e.target.value)
            }
            maxLength={2000}
            placeholder="Write your message here..."
          />

          <div className="selection-head">
            <div>
              <h2>Recipients</h2>

              <p>
                {selected.length} of {webhooks.length} selected
              </p>
            </div>

            <button
              type="button"
              className="secondary-btn"
              onClick={toggleAll}
            >
              <CheckCheck size={17} />

              {allSelected
                ? "Clear All"
                : "Select All"}
            </button>
          </div>

          {groups.length > 0 && (
            <div className="group-chips">
              {groups.map((group) => (
                <button
                  type="button"
                  key={group}
                  onClick={() =>
                    selectGroup(group)
                  }
                >
                  {group}
                </button>
              ))}
            </div>
          )}

          <div className="recipient-list">
            {webhooks.length === 0 ? (
              <div className="empty-state">
                No active webhooks. Add or enable a webhook first.
              </div>
            ) : (
              webhooks.map((webhook) => (
                <label
                  className="recipient-row"
                  key={webhook._id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(
                      webhook._id,
                    )}
                    onChange={() =>
                      toggleOne(webhook._id)
                    }
                  />

                  <div>
                    <strong>
                      {webhook.name}
                    </strong>

                    <span>
                      {webhook.group}
                    </span>
                  </div>
                </label>
              ))
            )}
          </div>

          <button
            className="primary-btn full send-main-btn"
            disabled={
              sending || !webhooks.length
            }
          >
            <Send size={18} />

            {sending
              ? "Sending…"
              : `Send to ${selected.length} Webhook${
                  selected.length !== 1
                    ? "s"
                    : ""
                }`}
          </button>
        </form>

        <aside className="panel result-panel">
          <h2>Last Result</h2>

          {!result ? (
            <div className="empty-state compact">
              Your latest broadcast result will appear here.
            </div>
          ) : (
            <>
              <div className="result-stats">
                <div>
                  <span>Total</span>
                  <strong>
                    {result.totalWebhooks}
                  </strong>
                </div>

                <div>
                  <span>Success</span>
                  <strong>
                    {result.successCount}
                  </strong>
                </div>

                <div>
                  <span>Failed</span>
                  <strong>
                    {result.failedCount}
                  </strong>
                </div>
              </div>

              <div className="result-list">
                {result.results.map((item) => (
                  <div
                    className={`result-row ${item.status.toLowerCase()}`}
                    key={item.webhookId}
                  >
                    <div>
                      <strong>
                        {item.webhookName}
                      </strong>

                      <span>
                        {item.group}
                      </span>
                    </div>

                    <b>{item.status}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}