import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignIn } from "./SignIn";

const signIn = vi.fn();
vi.mock("../state/AppContext", () => ({
  useApp: () => ({ signIn, bootState: "idle" }),
}));

describe("demo sign-in", () => {
  beforeEach(() => signIn.mockReset());
  it("uses credentials instead of exposing an account picker", async () => {
    render(<SignIn />);
    expect(screen.queryByText("Mai Pham")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "student@demo.local");
    await userEvent.type(screen.getByLabelText("Password"), "demo123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(signIn).toHaveBeenCalledWith("student@demo.local", "demo123");
  });
});
