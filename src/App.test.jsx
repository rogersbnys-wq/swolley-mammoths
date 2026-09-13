import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import App from "./App.jsx";

/* the render + logic test harness (Phase 3.5): a handful of smoke
   tests over the real component tree, on top of the exhaustive pure
   logic.test.js coverage. This is not trying to be exhaustive UI
   coverage — it exists to catch "the app doesn't mount" regressions. */

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe("SwolleyMammoths", () => {
  it("boots to the Today tab with the seed plans visible", async () => {
    render(<App />);
    expect(await screen.findByText(/SWOLLEY/)).toBeInTheDocument();
    expect(await screen.findByText("Push Day")).toBeInTheDocument();
    expect(screen.getByText("Freestyle — no plan")).toBeInTheDocument();
  });

  it("navigates to the Coach tab and shows the empty-goals state", async () => {
    render(<App />);
    await screen.findByText(/SWOLLEY/);
    fireEvent.click(screen.getByText("Coach"));
    expect(await screen.findByText(/No goals yet/)).toBeInTheDocument();
    expect(screen.getByText("+ Add a goal")).toBeInTheDocument();
  });

  it("opens the goal creation sheet from the Coach tab", async () => {
    render(<App />);
    await screen.findByText(/SWOLLEY/);
    fireEvent.click(screen.getByText("Coach"));
    fireEvent.click(await screen.findByText("+ Add a goal"));
    expect(await screen.findByText("What are you working toward?")).toBeInTheDocument();
    expect(screen.getByText("Hyrox")).toBeInTheDocument();
  });

  it("starts a freestyle session and logs a set", async () => {
    render(<App />);
    await screen.findByText(/SWOLLEY/);
    fireEvent.click(screen.getByText("Freestyle — no plan"));
    fireEvent.click(await screen.findByText("+ Add a single exercise"));
    fireEvent.click(await screen.findByText("Back Squat"));
    // picking from "+ Add a single exercise" queues it; open it to log a set
    fireEvent.click(await screen.findByText("Back Squat"));
    expect(await screen.findByText("Log set")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Log set"));
    // first-ever set on this exercise is automatically a new best
    expect(await screen.findByText(/New best/)).toBeInTheDocument();
  });
});
