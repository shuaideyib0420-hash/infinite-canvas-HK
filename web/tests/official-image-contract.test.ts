import { afterEach, expect, mock, test } from "bun:test";
import axios from "axios";

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
    },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: globalThis.localStorage, location: { href: "https://canvas.htvelumo.com/canvas/fixture" } } });
mock.module("@/i18n", () => ({ default: { t: (key: string) => key } }));
mock.module("@/constant/env", () => ({ VELUMO_API_URL: "https://api.htvelumo.com", PLUGIN_REGISTRY_URL: "/plugins/official-plugins.json" }));
mock.module("@/services/image-storage", () => ({ imageToDataUrl: async (image: { dataUrl: string }) => image.dataUrl }));
mock.module("@/stores/use-prompt-source-store", () => ({ usePromptSourceStore: { getState: () => ({ sources: [], schedule: {} }), setState: () => {} } }));
const { createModelChannel, defaultConfig } = await import("../src/stores/use-config-store");
const { requestGeneration } = await import("../src/services/api/image");
const originalAdapter = axios.defaults.adapter;
afterEach(() => {
    axios.defaults.adapter = originalAdapter;
});
const base64 = btoa("\x89PNG\r\n\x1a\nfixture");
const config = (format = "openai") => ({ ...defaultConfig, model: "default::gpt-image-1", channels: [createModelChannel({ id: "default", apiKey: "fake-key", apiFormat: format, models: [{ name: "gpt-image-1", capability: "image" }] })] });

test("official b64 and url coexist; original b64 takes priority", async () => {
    let calls = 0;
    axios.defaults.adapter = async (request) => {
        calls++;
        return { status: 200, statusText: "OK", headers: {}, config: request, data: { data: [{ b64_json: base64, url: "https://fixture.example/image.png", provider: "fixture" }] } };
    };
    expect((await requestGeneration(config(), "fixture"))[0].dataUrl).toBe(`data:image/png;base64,${base64}`);
    expect(calls).toBe(1);
});

test("official late HTTP200 error fails without retry", async () => {
    let calls = 0;
    axios.defaults.adapter = async (request) => {
        calls++;
        return { status: 200, statusText: "OK", headers: {}, config: request, data: { error: { message: "fixture late error" } } };
    };
    await expect(requestGeneration(config(), "fixture")).rejects.toThrow();
    expect(calls).toBe(1);
});

test("Gemini unknown and nonimage parts do not become generated images", async () => {
    axios.defaults.adapter = async (request) => ({
        status: 200,
        statusText: "OK",
        headers: {},
        config: request,
        data: {
            candidates: [
                {
                    content: {
                        parts: [
                            { functionCall: { name: "fixture", args: {} } },
                            { futurePart: { preserved: true } },
                            { inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: "AAECAw==" } },
                            { inlineData: { mimeType: "image/png", data: base64 } },
                        ],
                    },
                },
            ],
        },
    });
    const images = await requestGeneration(config("gemini"), "fixture");
    expect(images).toHaveLength(1);
    expect(images[0].dataUrl).toBe(`data:image/png;base64,${base64}`);
});
