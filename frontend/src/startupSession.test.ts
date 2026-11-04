import { beforeEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { HomeLaunchError, prepareStartupSession } from "./startupSession";

vi.mock("./api", () => ({ api: vi.fn() }));
const account = { name: "resident", role: "user", csrf: "csrf" };
const location = (pathname = "/", hash = "") => ({ pathname, hash });
const history = () => ({ replaceState: vi.fn() });
beforeEach(() => {
  vi.mocked(api).mockReset();
});

it("normal startup reads the session without touching the address or redeeming a ticket", async () => {
  vi.mocked(api).mockResolvedValue(account);
  const navigation = history();
  const session = prepareStartupSession(
    location("/", "#unrelated"),
    navigation,
  );
  expect(await session()).toEqual(account);
  expect(navigation.replaceState).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledExactlyOnceWith("session");
});

it("clears the launch address immediately and shares one redemption before concurrent session checks", async () => {
  let complete!: () => void;
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "customer-access/redeem")
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    return account;
  });
  const navigation = history(),
    token = "x".repeat(48);
  const session = prepareStartupSession(
    location("/prefix/_account", "#" + token),
    navigation,
  );
  expect(navigation.replaceState).toHaveBeenCalledWith(null, "", "/prefix/");
  const first = session(),
    second = session();
  expect(api).toHaveBeenCalledExactlyOnceWith(
    "customer-access/redeem",
    "POST",
    { token },
    expect.any(AbortSignal),
  );
  complete();
  expect(await Promise.all([first, second])).toEqual([account, account]);
  expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
    "customer-access/redeem",
    "session",
    "session",
  ]);
});

it("a failed one-time redemption is never replayed or replaced by a pre-existing session", async () => {
  vi.mocked(api).mockRejectedValue(new Error("network failure"));
  const session = prepareStartupSession(
    location("/_account", "#" + "x".repeat(48)),
    history(),
  );
  await expect(session()).rejects.toBeInstanceOf(HomeLaunchError);
  await expect(session()).rejects.toBeInstanceOf(HomeLaunchError);
  expect(api).toHaveBeenCalledTimes(1);
});

it("can recheck a temporarily unavailable session after redemption without reusing the ticket", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ ready: true })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(account);
  const session = prepareStartupSession(
    location("/_account", "#" + "x".repeat(48)),
    history(),
  );
  await expect(session()).rejects.toThrow("offline");
  expect(await session()).toEqual(account);
  expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
    "customer-access/redeem",
    "session",
    "session",
  ]);
});

it("an entry without a launch ticket cannot fall through to a session or submit an empty ticket", async () => {
  const session = prepareStartupSession(location("/_account"), history());
  await expect(session()).rejects.toBeInstanceOf(HomeLaunchError);
  await expect(session()).rejects.toBeInstanceOf(HomeLaunchError);
  expect(api).not.toHaveBeenCalled();
});
