import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockSignUpEmail = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: (...args: unknown[]) => mockSignUpEmail(...args),
    },
    signIn: {
      social: (...args: unknown[]) => vi.fn()(...args),
    },
  },
}));

import RegisterPage from "./page";

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name, email, password inputs and Create Account button", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i })
    ).toBeInTheDocument();
  });

  it("renders the page heading", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Arinova Chat")).toBeInTheDocument();
    expect(screen.getByText(/create a new account/i)).toBeInTheDocument();
  });

  it("shows 'Password must be at least 8 characters' when submitting with short password", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    // Type a short password (fewer than 8 characters)
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters")
      ).toBeInTheDocument();
    });

    // No API call should have been made
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("does not call signUp.email when password is too short", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "abc");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("calls signUp.email with correct data when form is valid", async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValueOnce({ error: null, data: { user: {} } });

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledWith({
        email: "alice@example.com",
        password: "securepassword",
        name: "Alice",
      });
    });
  });

  it("redirects to / on successful registration", async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValueOnce({ error: null, data: { user: {} } });

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("shows error message when registration fails", async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockResolvedValueOnce({
      error: { message: "Email already in use" },
    });

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already in use")).toBeInTheDocument();
    });
  });

  it("shows generic error when signUp throws unexpectedly", async () => {
    const user = userEvent.setup();
    mockSignUpEmail.mockRejectedValueOnce(new Error("Network error"));

    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Alice");
    await user.type(screen.getByLabelText(/^email$/i), "alice@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred")
      ).toBeInTheDocument();
    });
  });

  it("has a link to /login", () => {
    render(<RegisterPage />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("renders Google and GitHub OAuth buttons", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("button", { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /github/i })).toBeInTheDocument();
  });
});
