import { Alert, Button, Select } from "antd";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { buildApiUrl, type ModelChannel } from "@/stores/use-config-store";

type KeyInfo = {
    api_key?: { name: string };
    group: { name: string };
    models: Array<{
        model: string;
        status: string;
        billing_mode: string;
        currency: string;
        tiers: Array<{ label: string; price: number }>;
        token_tiers: Array<{ min_tokens: number; max_tokens: number | null; input_price: number; output_price: number; image_input_price: number; image_output_price: number; cache_read_price: number }>;
    }>;
};

export function VelumoKeyDetails({ channel }: { channel: ModelChannel }) {
    const [model, setModel] = useState("");
    const [info, setInfo] = useState<KeyInfo | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const request = useRef<AbortController | null>(null);
    useEffect(() => {
        setInfo(null);
        setError("");
        setLoading(false);
        return () => {
            request.current?.abort();
        };
    }, [channel.apiKey, model]);
    const check = async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setInfo(null);
        setError("");
        try {
            const response = await axios.get<KeyInfo>(buildApiUrl(channel.baseUrl, "/sub2api/image-key"), {
                headers: { Authorization: `Bearer ${channel.apiKey.trim()}` },
                params: model ? { model } : undefined,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) setInfo(response.data);
        } catch (failure) {
            if (controller.signal.aborted) return;
            const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
            setError(status ? `查询失败（HTTP ${status}），请检查 Key 和模型权限。` : "连接失败，请稍后手动查询。");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    };
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <Select
                    className="min-w-0 flex-1"
                    aria-label="参考价格模型"
                    placeholder="选择模型查询参考价格（可选）"
                    allowClear
                    value={model || undefined}
                    onChange={(value) => setModel(value || "")}
                    options={channel.models.map((item) => ({ value: item.name, label: item.name }))}
                />
                <Button loading={loading} disabled={!channel.apiKey.trim()} onClick={() => void check()}>
                    检查 Key / 参考价格
                </Button>
            </div>
            {error ? <Alert type="error" title={error} /> : null}
            {info ? (
                <div className="space-y-1 text-xs">
                    <p>
                        Key 名称：{info.api_key?.name || "未命名"} · 分组：{info.group.name}
                    </p>
                    {info.models.map((item) => (
                        <div key={item.model}>
                            <p>
                                {item.model}：
                                {item.status !== "known" || item.currency !== "site_credit"
                                    ? "参考价格未知，不影响原有生成权限"
                                    : item.billing_mode === "image"
                                      ? item.tiers.map((tier) => `${tier.label}：${tier.price} 站内额度/张`).join("；")
                                      : "按实际 Token 计费"}
                            </p>
                            {item.status === "known" && item.billing_mode === "token" && item.currency === "site_credit"
                                ? item.token_tiers.map((tier, index) => (
                                      <p key={index}>
                                          Token 档 ({tier.min_tokens}, {tier.max_tokens ?? "∞"}]：输入 {tier.input_price} / 输出 {tier.output_price} / 图片输入 {tier.image_input_price} / 图片输出 {tier.image_output_price} / 缓存读取{" "}
                                          {tier.cache_read_price}（站内额度/Token）
                                      </p>
                                  ))
                                : null}
                        </div>
                    ))}
                    <p>参考价格来自本站，不代表模型参数能力或最终账单；实际扣费以控制台用量为准。</p>
                </div>
            ) : null}
        </div>
    );
}
