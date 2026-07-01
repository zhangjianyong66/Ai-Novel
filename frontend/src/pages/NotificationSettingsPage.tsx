import { Bell, ExternalLink, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "../components/ui/toast";
import { ApiError } from "../services/apiClient";
import {
  browserNotificationPermission,
  invalidateGenerationNotificationSettingsCache,
  requestBrowserNotificationPermission,
} from "../services/browserGenerationNotifications";
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  type UserNotificationSettings,
} from "../services/notificationSettingsApi";

type PermissionState = ReturnType<typeof browserNotificationPermission>;

function permissionText(permission: PermissionState): string {
  if (permission === "unsupported") return "当前浏览器不支持 Notification API";
  if (permission === "granted") return "已授权";
  if (permission === "denied") return "已拒绝，请在浏览器站点设置中重新允许";
  return "未授权";
}

export function NotificationSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<UserNotificationSettings | null>(null);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [feishuEnabled, setFeishuEnabled] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [clearWebhook, setClearWebhook] = useState(false);
  const [permission, setPermission] = useState<PermissionState>(() => browserNotificationPermission());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchNotificationSettings();
      setSettings(next);
      setBrowserEnabled(Boolean(next.browser_enabled));
      setFeishuEnabled(Boolean(next.feishu_enabled));
      setWebhookDraft("");
      setClearWebhook(false);
      setPermission(browserNotificationPermission());
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.toastError(err ? `${err.message} (${err.code})` : "通知设置加载失败", err?.requestId);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      browserEnabled !== settings.browser_enabled ||
      feishuEnabled !== settings.feishu_enabled ||
      webhookDraft.trim().length > 0 ||
      clearWebhook
    );
  }, [browserEnabled, clearWebhook, feishuEnabled, settings, webhookDraft]);

  const requestPermission = useCallback(async () => {
    const next = await requestBrowserNotificationPermission();
    setPermission(next);
    if (next === "granted") toast.toastSuccess("浏览器通知已授权");
  }, [toast]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Parameters<typeof saveNotificationSettings>[0] = {
        browser_enabled: browserEnabled,
        feishu_enabled: feishuEnabled,
      };
      if (clearWebhook) payload.feishu_webhook_url = "";
      else if (webhookDraft.trim()) payload.feishu_webhook_url = webhookDraft.trim();

      const next = await saveNotificationSettings(payload);
      invalidateGenerationNotificationSettingsCache();
      setSettings(next);
      setBrowserEnabled(Boolean(next.browser_enabled));
      setFeishuEnabled(Boolean(next.feishu_enabled));
      setWebhookDraft("");
      setClearWebhook(false);
      toast.toastSuccess("通知设置已保存");
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.toastError(err ? `${err.message} (${err.code})` : "通知设置保存失败", err?.requestId);
    } finally {
      setSaving(false);
    }
  }, [browserEnabled, clearWebhook, feishuEnabled, toast, webhookDraft]);

  if (loading) return <div className="text-subtext">加载中...</div>;

  return (
    <div className="grid gap-4">
      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 font-content text-xl">
              <Bell size={20} />
              个人通知设置
            </div>
            <div className="text-xs text-subtext">这些设置只对当前登录用户生效，覆盖所有项目的 AI 生成任务。</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => void load()} disabled={saving}>
              <RotateCcw size={16} />
              刷新
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
            >
              <Save size={16} />
              保存
            </button>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div className="grid gap-1">
          <div className="font-content text-lg">浏览器通知</div>
          <div className="text-xs text-subtext">页面打开时，AI 生成成功或失败会通过系统通知提醒。</div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              className="checkbox"
              checked={browserEnabled}
              onChange={(e) => setBrowserEnabled(e.target.checked)}
              type="checkbox"
            />
            启用浏览器通知
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs text-subtext">
            <span>权限状态：{permissionText(permission)}</span>
            {permission === "default" ? (
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => void requestPermission()}>
                请求授权
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div className="grid gap-1">
          <div className="font-content text-lg">飞书 Webhook</div>
          <div className="text-xs text-subtext">
            后端在生成成功或失败后发送飞书通知；Webhook 会加密保存，页面不会回显明文。
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              className="checkbox"
              checked={feishuEnabled}
              onChange={(e) => setFeishuEnabled(e.target.checked)}
              type="checkbox"
            />
            启用飞书通知
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-subtext">
              Webhook URL
              {settings?.feishu_webhook_configured ? `（已配置：${settings.feishu_webhook_masked || "****"}）` : ""}
            </span>
            <input
              className="input"
              value={webhookDraft}
              onChange={(e) => {
                setWebhookDraft(e.target.value);
                if (e.target.value.trim()) setClearWebhook(false);
              }}
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              className="checkbox"
              checked={clearWebhook}
              onChange={(e) => {
                setClearWebhook(e.target.checked);
                if (e.target.checked) setWebhookDraft("");
              }}
              type="checkbox"
            />
            清除已保存的 Webhook
          </label>
          <a
            className="inline-flex w-fit items-center gap-1 text-xs text-accent hover:underline"
            href="https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot"
            target="_blank"
            rel="noreferrer"
          >
            飞书自定义机器人文档
            <ExternalLink size={14} />
          </a>
        </div>
      </section>
    </div>
  );
}
