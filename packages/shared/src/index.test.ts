import { describe, it, expect } from "vitest";
import { APP_NAME } from "./index";

describe("@ds/shared", () => {
  it("exposes the app name", () => {
    expect(APP_NAME).toBe("DS Product Discovery");
  });
});
