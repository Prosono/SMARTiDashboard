import { describe, it, expect } from "vitest";
import { responseError } from "./api";
describe("safe API errors", () => {
  it("recognizes both legacy and JSON origin errors", () => {
    expect(responseError(403, "origin_rejected").code).toBe("origin_rejected");
    expect(responseError(403, '{"detail":"origin_rejected"}').code).toBe(
      "origin_rejected",
    );
  });
  it("distinguishes wrong setup secret from origin rejection", () => {
    expect(responseError(403, '{"detail":"invalid_setup_secret"}').code).toBe(
      "invalid_setup_secret",
    );
  });
  it("does not retain server-echoed passwords or arbitrary error text", () => {
    const error = responseError(
      422,
      JSON.stringify({
        detail: [
          {
            loc: ["body", "password"],
            input: "secret-password",
            msg: "echoed secret-password",
          },
        ],
      }),
    );
    expect(error.fields).toEqual(["password"]);
    expect(JSON.stringify(error)).not.toContain("secret-password");
    expect(responseError(500, "private server information").code).toBe("");
  });
});
