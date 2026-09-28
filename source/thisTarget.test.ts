import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  isBackground,
  isContentScript,
  isExtensionContext,
  isOffscreenDocument,
} from "webext-detect";
import type * as SerializeError from "serialize-error";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";

vi.mock("webext-detect");
vi.mock("./sender.js", () => ({ messenger: vi.fn() }));
vi.mock("./receiver.js", () => ({ registerMethods: vi.fn() }));
// Each test re-imports the modules; serialize-error's registry is not reset with them.
vi.mock("serialize-error", async (importOriginal) => ({
  ...(await importOriginal<typeof SerializeError>()),
  addKnownErrorConstructor: vi.fn(),
}));

type Context = "contentScript" | "extensionPage" | "background";

/** Loads a fresh `thisTarget.js`, whose state is decided at import time. */
async function loadIn(context: Context) {
  vi.mocked(isExtensionContext).mockReturnValue(true);
  vi.mocked(isContentScript).mockReturnValue(context === "contentScript");
  vi.mocked(isBackground).mockReturnValue(context === "background");
  vi.mocked(isOffscreenDocument).mockReturnValue(false);
  return import("./thisTarget.js");
}

beforeEach(() => {
  vi.resetModules();
  // `initPrivateApi` refuses to run twice in the same global scope (#88)
  delete (globalThis as { __webextMessenger?: string }).__webextMessenger;
  vi.stubGlobal("document", {});
  vi.mocked(messenger).mockResolvedValue({ tabId: 7, frameId: 3 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test("content scripts do not message the background on load", async () => {
  const { initPrivateApi } = await loadIn("contentScript");
  initPrivateApi();

  expect(registerMethods).toHaveBeenCalledOnce();
  expect(messenger).not.toHaveBeenCalled();
});

test("content scripts fetch their tab data when getThisFrame() asks for it", async () => {
  const { initPrivateApi, getThisFrame } = await loadIn("contentScript");
  initPrivateApi();

  await expect(getThisFrame()).resolves.toEqual({ tabId: 7, frameId: 3 });
  await expect(getThisFrame()).resolves.toEqual({ tabId: 7, frameId: 3 });
  expect(messenger).toHaveBeenCalledOnce();
  expect(messenger).toHaveBeenCalledWith("__getTabData", {}, { page: "any" });
});

test("extension pages still fetch their tab data on load", async () => {
  const { initPrivateApi, getTabDataStatus } = await loadIn("extensionPage");
  initPrivateApi();

  expect(messenger).toHaveBeenCalledOnce();
  expect(messenger).toHaveBeenCalledWith("__getTabData", {}, { page: "any" });
  await vi.waitFor(() => {
    expect(getTabDataStatus()).toBe("received");
  });
});

test("the background never fetches tab data", async () => {
  const { initPrivateApi, getTabDataStatus } = await loadIn("background");
  initPrivateApi();

  expect(messenger).not.toHaveBeenCalled();
  expect(getTabDataStatus()).toBe("not-needed");
});
