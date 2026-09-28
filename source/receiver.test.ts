import { afterEach, expect, test, vi } from "vitest";
import { isBackground } from "webext-detect";
import { registerMethods } from "./receiver.js";
import { handlers } from "./handlers.js";
import { type MessengerMessage } from "./types.js";

vi.mock("webext-detect");
vi.mock("./thisTarget.js", () => ({
  __getTabData: vi.fn(),
  thisTarget: { page: "background" },
  getTabDataStatus: () => "not-needed",
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  handlers.clear();
});

test("forwarded notifications send once without mutating the incoming trace", async () => {
  vi.useFakeTimers();
  vi.mocked(isBackground).mockReturnValue(true);
  const addListener = vi.fn();
  const sendMessage = vi
    .fn()
    .mockRejectedValue(
      new Error(
        "Could not establish connection. Receiving end does not exist.",
      ),
    );
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      onMessage: { addListener },
      onMessageExternal: { addListener: vi.fn() },
    },
    tabs: { sendMessage },
  });
  registerMethods({});
  const listener = addListener.mock.calls[0]![0] as (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (response: unknown) => void,
  ) => unknown;
  const sender = { frameId: 2 };
  const trace = [{ frameId: 1 }];
  const message: MessengerMessage = {
    __webextMessenger: true,
    type: "_",
    args: [],
    target: { tabId: 1 },
    options: { isNotification: true, trace },
  };
  const respond = vi.fn();

  expect(listener(message, sender, respond)).toBe(true);
  await vi.runAllTimersAsync();

  expect(sendMessage).toHaveBeenCalledOnce();
  expect(sendMessage.mock.calls[0]![1]).toMatchObject({
    options: { isNotification: true, trace: [...trace, sender] },
  });
  expect(trace).toEqual([{ frameId: 1 }]);
  expect(respond).toHaveBeenCalledWith({
    __webextMessenger: true,
    value: undefined,
  });
});
