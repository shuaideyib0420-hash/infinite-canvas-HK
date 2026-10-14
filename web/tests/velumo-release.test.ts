import { afterEach, expect, mock, test } from "bun:test";
import axios, { type InternalAxiosRequestConfig } from "axios";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
            memory.set(key, value);
        },
        removeItem: (key: string) => {
            memory.delete(key);
        },
        clear: () => memory.clear(),
        key: () => null,
        get length() {
            return memory.size;
        },
    },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: globalThis.localStorage, location: { href: "https://canvas.htvelumo.com/canvas/fixture" } } });
mock.module("@/i18n", () => ({ default: { t: (key: string) => key } }));
mock.module("@/constant/env", () => ({ VELUMO_API_URL: "https://api.htvelumo.com" }));
mock.module("@/services/image-storage", () => ({ imageToDataUrl: async (image: { dataUrl: string }) => image.dataUrl }));
let exported: Blob;
mock.module("file-saver", () => ({
    saveAs: (blob: Blob) => {
        exported = blob;
    },
}));
mock.module("@/stores/use-prompt-source-store", () => ({ usePromptSourceStore: { getState: () => ({ sources: [], schedule: {} }), setState: () => {} } }));

const { base64ImageDataUrl } = await import("../src/lib/image-utils");
const { CONFIG_STORE_KEY, createModelChannel, defaultConfig, resolveModelRequestConfig, resolveModelScript, useConfigStore, withLocalProxy } = await import("../src/stores/use-config-store");
const { requestGeneration, requestEdit } = await import("../src/services/api/image");
const { pollVideoGenerationTask } = await import("../src/services/api/video");
const { exportAppConfig, importAppConfig } = await import("../src/services/config-file");
const { fetchOfficialPlugins } = await import("../src/lib/canvas/plugin-registry");
const originalAdapter = axios.defaults.adapter;
const originalFetch = globalThis.fetch;
afterEach(() => {
    axios.defaults.adapter = originalAdapter;
    globalThis.fetch = originalFetch;
    useConfigStore.setState({ config: { ...defaultConfig } });
});
const formats = [
    ["image/png", "\x89PNG\r\n\x1a\nextra"],
    ["image/jpeg", "\xff\xd8\xfforiginal"],
    ["image/webp", "RIFF1234WEBPoriginal"],
] as const;
const config = () => ({ ...defaultConfig, model: "default::gpt-image-1", channels: [createModelChannel({ id: "default", apiKey: "test-only-key", models: [{ name: "gpt-image-1", capability: "image" }] })] });

test("the site registry resolves all five official plugin entries from a relative URL", async () => {
    let requested = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
        requested = String(url);
        return Response.json({ plugins: ["markdown", "svg", "html", "panorama", "sticky-note"].map((id) => ({ id, entry: `${id}.js` })) });
    }) as typeof fetch;
    const plugins = await fetchOfficialPlugins("/plugins/official-plugins.json");
    expect(requested).toBe("https://canvas.htvelumo.com/plugins/official-plugins.json");
    expect(plugins.map((plugin) => plugin.url)).toEqual(["markdown", "svg", "html", "panorama", "sticky-note"].map((id) => `https://canvas.htvelumo.com/plugins/${id}.js`));
});

for (const [mime, bytes] of formats)
    test(`${mime} response preserves original bytes`, async () => {
        const base64 = btoa(bytes);
        let calls = 0;
        axios.defaults.adapter = async (request) => {
            calls++;
            expect(request.url).toBe("https://api.htvelumo.com/v1/images/generations");
            expect(request.headers.Authorization).toBe("Bearer test-only-key");
            return { status: 200, statusText: "OK", headers: {}, config: request, data: { data: [{ b64_json: base64 }] } };
        };
        const result = await requestGeneration(config(), "fixture");
        expect(result[0].dataUrl).toBe(`data:${mime};base64,${base64}`);
        expect(atob(result[0].dataUrl.split(",")[1])).toBe(bytes);
        expect(calls).toBe(1);
    });
test("unknown format fails without retry", async () => {
    expect(() => base64ImageDataUrl(btoa("not an image"))).toThrow();
    let calls = 0;
    axios.defaults.adapter = async () => {
        calls++;
        throw new Error("simulated timeout");
    };
    await expect(requestGeneration(config(), "fixture")).rejects.toThrow();
    expect(calls).toBe(1);
});
test("site origin is preserved while Gemini protocol and model scripts remain available", () => {
    const script = "return []";
    const channel = createModelChannel({ ...config().channels[0], baseUrl: "https://untrusted.invalid", apiFormat: "gemini", models: [{ name: "gpt-image-1", capability: "image", script }] });
    expect(channel.baseUrl).toBe("https://api.htvelumo.com");
    expect(channel.apiFormat).toBe("gemini");
    expect(channel.models[0].script).toBe(script);
    expect(resolveModelRequestConfig({ ...config(), channels: [channel] }, "default::gpt-image-1").apiFormat).toBe("gemini");
    expect(resolveModelScript({ ...config(), channels: [channel] }, "default::gpt-image-1")).toBe(script);
});
test("a model call script executes and returns the existing image without a second POST", async () => {
    const dataUrl = `data:image/png;base64,${btoa(formats[0][1])}`;
    const scripted = config();
    scripted.channels[0].models[0].script = `return [${JSON.stringify(dataUrl)}]`;
    let calls = 0;
    axios.defaults.adapter = async () => { calls++; throw new Error("Unexpected upstream call"); };
    const images = await requestGeneration(scripted, "fixture");
    expect(images[0].dataUrl).toBe(dataUrl);
    expect(calls).toBe(0);
});
test("Gemini images use the site native endpoint, personal Key and official response modalities", async () => {
    const native = config();
    native.channels[0].apiFormat = "gemini";
    let calls = 0;
    const base64 = btoa(formats[0][1]);
    axios.defaults.adapter = async (request) => {
        calls++;
        expect(request.url).toBe("https://api.htvelumo.com/v1beta/models/gpt-image-1:generateContent");
        expect(request.headers["x-goog-api-key"]).toBe("test-only-key");
        const body = JSON.parse(request.data as string);
        expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
        expect(body.generationConfig.responseFormat).toBeUndefined();
        return { status: 200, statusText: "OK", headers: {}, config: request, data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: base64 } }] } }] } };
    };
    expect((await requestGeneration(native, "fixture"))[0].dataUrl).toBe(`data:image/png;base64,${base64}`);
    expect(calls).toBe(1);
});
test("the official local proxy forwards network URLs once and leaves local image bytes alone", () => {
    useConfigStore.setState({ config: { ...defaultConfig, proxyEnabled: true } });
    const direct = "https://api.htvelumo.com/v1/models";
    const forwarded = `http://127.0.0.1:23210/${direct}`;
    expect(withLocalProxy(direct)).toBe(forwarded);
    expect(withLocalProxy(forwarded)).toBe(forwarded);
    expect(withLocalProxy("data:image/png;base64,fixture")).toBe("data:image/png;base64,fixture");
    expect(withLocalProxy("blob:fixture")).toBe("blob:fixture");
    useConfigStore.setState({ config: { ...defaultConfig, proxyEnabled: false } });
    expect(withLocalProxy(direct)).toBe(direct);
});
test("Key persistence follows opt-in and clears on opt-out and reload", async () => {
    useConfigStore.setState({ config: config() });
    const persisted = () => useConfigStore.persist.getOptions().storage?.getItem(CONFIG_STORE_KEY);
    expect(JSON.stringify(await persisted())).not.toContain("test-only-key");
    useConfigStore.getState().updateConfig("rememberApiKey", true);
    expect(JSON.stringify(await persisted())).toContain("test-only-key");
    useConfigStore.getState().updateConfig("rememberApiKey", false);
    expect(JSON.stringify(await persisted())).not.toContain("test-only-key");
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("");
});
test("configuration export/import excludes credentials", async () => {
    useConfigStore.setState({ config: { ...config(), rememberApiKey: true }, webdav: { url: "", username: "", password: "secret-test-password", directory: "", lastSyncedAt: "" } });
    exportAppConfig();
    const text = await exported.text();
    expect(text).not.toContain("test-only-key");
    expect(text).not.toContain("secret-test-password");
    await importAppConfig(new File([text], "config.json"));
    expect(useConfigStore.getState().config.rememberApiKey).toBe(false);
    expect(useConfigStore.getState().config.channels[0].apiKey).toBe("");
});
for (const provider of ["openai", "gemini"] as const)
    for (const origin of ["https://api.htvelumo.com", "https://media.example.invalid"])
        test(`${provider} video downloads send the personal Key only to the site origin`, async () => {
            const video = config();
            video.channels[0].apiFormat = provider;
            video.channels[0].models = [{ name: "video-model", capability: "video" }];
            const uri = `${origin}/video.mp4?signature=fixture`;
            let calls = 0;
            let mediaRequest: InternalAxiosRequestConfig | undefined;
            axios.defaults.adapter = async (request) => {
                calls++;
                if (calls === 1) {
                    const data = provider === "gemini"
                        ? { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } } }
                        : { id: "fixture-task", status: "completed", video_url: uri };
                    return { status: 200, statusText: "OK", headers: {}, config: request, data };
                }
                mediaRequest = request;
                return { status: 200, statusText: "OK", headers: {}, config: request, data: new Blob(["fixture-video"], { type: "video/mp4" }) };
            };
            const result = await pollVideoGenerationTask(video, { id: "fixture-task", provider, model: "default::video-model" });
            expect(result.status).toBe("completed");
            expect(calls).toBe(2);
            expect(mediaRequest?.url).toBe(uri);
            expect(mediaRequest?.url).not.toContain("test-only-key");
            expect(mediaRequest?.headers.Authorization).toBe(origin === "https://api.htvelumo.com" ? "Bearer test-only-key" : undefined);
            expect(mediaRequest?.headers["x-goog-api-key"]).toBeUndefined();
            if (result.status === "completed") expect(await result.result.blob?.text()).toBe("fixture-video");
        });
for (const count of [1, 2])
    test(`edit sends ${count} references in order with original bytes`, async () => {
        const base64 = btoa(formats[0][1]);
        axios.defaults.adapter = async (request) => {
            expect(request.url).toBe("https://api.htvelumo.com/v1/images/edits");
            const form = request.data as FormData;
            const field = count === 1 ? "image" : "image[]";
            const files = form.getAll(field) as File[];
            expect(files.length).toBe(count);
            for (let i = 0; i < count; i++) {
                expect(files[i].name).toBe(`${i}.png`);
                expect(new Uint8Array(await files[i].arrayBuffer())).toEqual(Uint8Array.from(formats[0][1], (c) => c.charCodeAt(0)));
            }
            return { status: 200, statusText: "OK", headers: {}, config: request, data: { data: [{ b64_json: base64 }] } };
        };
        await requestEdit(
            config(),
            "fixture",
            Array.from({ length: count }, (_, i) => ({ id: `${i}`, name: `${i}.png`, type: "image/png", dataUrl: `data:image/png;base64,${base64}` })),
        );
    });
