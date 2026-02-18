import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RegisterPage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// Mock auth client
const mockSignUpEmail = vi.fn();
const mockSignInSocial = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: {
      email: (...args: unknown[]) => mockSignUpEmail(...args),
    },
    signIn: {
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the registration form", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Arinova Chat")).toBeInTheDocument();
    expect(screen.getByText("Create a new account")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Account" })
    ).toBeInTheDocument();
  });

  it("renders name input as required", () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText("Name")).toBeRequired();
  });

  it("renders email input as required with email type", () => {
    render(<RegisterPage />);
    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toBeRequired();
    expect(emailInput).toHaveAttribute("type", "email");
  });

  it("renders password input with min length", () => {
    render(<RegisterPage />);
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toBeRequired();
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows validation error for short password", async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters")
      ).toBeInTheDocument();
    });
    expect(mockSignUpEmail).not.toHaveBeenCalled();
  });

  it("submits and redirects on success", async () => {
    mockSignUpEmail.mockResolvedValue({ data: { session: {} } });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
        name: "Test User",
      });
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows error on registration failure", async () => {
    mockSignUpEmail.mockResolvedValue({
      error: { message: "Email already exists" },
    });
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dup@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(screen.getByText("Email already exists")).toBeInTheDocument();
    });
  });

  it("shows error on unexpected exception", async () => {
    mockSignUpEmail.mockRejectedValue(new Error("Network error"));
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred")
      ).toBeInTheDocument();
    });
  });

  it("renders OAuth buttons for Google and GitHub", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("calls OAuth for Google", () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText("Google"));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/",
    });
  });

  it("calls OAuth for GitHub", () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText("GitHub"));
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/",
    });
  });

  it("links to the login page", () => {
    render(<RegisterPage />);
    const link = screen.getByText("Sign in");
    expect(link).toHaveAttribute("href", "/login");
  });
});
